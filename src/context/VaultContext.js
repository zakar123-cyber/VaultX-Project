import React, { createContext, useState, useEffect, useContext } from 'react';
import { useAuth } from './AuthContext';
import * as DatabaseService from '../services/DatabaseService';
import { encrypt, decrypt, deriveKey } from '../services/EncryptionService';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';

const VaultContext = createContext();
export const useVault = () => useContext(VaultContext);

export const VaultProvider = ({ children }) => {
    const { masterKey, isAuthenticated, user } = useAuth(); // Need 'user'
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    /* ---------- LOAD VAULT ---------- */
    useEffect(() => {
        if (isAuthenticated && masterKey && user) {
            loadVault();
        } else {
            setItems([]);
        }
    }, [isAuthenticated, masterKey, user]);

    const loadVault = async () => {
        if (!user?.username) return;
        setIsLoading(true);
        try {
            await DatabaseService.initDatabase();
            const rows = await DatabaseService.getSecrets(user.username); // Pass username

            const decryptedItems = rows.map(row => {
                try {
                    const plaintext = decrypt(row.data, masterKey);
                    if (!plaintext) {
                        // Decryption failed (Wrong Key or Corrupted Data)
                        console.warn(`Row ${row.id} failed decryption (possible wrong key for this item)`);
                        return null;
                    }
                    // Validate JSON before parsing
                    if (typeof plaintext !== 'string' || !plaintext.startsWith('{')) {
                        console.warn(`Row ${row.id} invalid format:`, plaintext.substring(0, 20));
                        return null;
                    }
                    const itemData = JSON.parse(plaintext);
                    return { ...itemData, id: row.id, created_at: row.created_at };
                } catch (e) {
                    console.error("Failed to parse row", row.id, e);
                    return null;
                }
            }).filter(item => item !== null);

            setItems(decryptedItems);
        } catch (e) {
            console.error('Failed to load vault', e);
        } finally {
            setIsLoading(false);
        }
    };

    /* ---------- CRUD ---------- */
    const addItem = async (item) => {
        if (!masterKey || !user?.username) return false;
        try {
            const payload = JSON.stringify(item);
            const encryptedBlob = await encrypt(payload, masterKey);

            const newId = await DatabaseService.addSecret(user.username, encryptedBlob); // Pass username
            if (newId) {
                setItems(prev => [...prev, { ...item, id: newId }]);
                return true;
            }
            return false;
        } catch (e) {
            console.error('Add failed', e);
            return false;
        }
    };

    const updateItem = async (id, updates) => {
        if (!masterKey || !user?.username) return false;
        try {
            const oldItem = items.find(i => i.id === id);
            if (!oldItem) return false;

            const newItem = { ...oldItem, ...updates };
            // Strip technical fields
            const { id: _, created_at: __, ...dataToEncrypt } = newItem;

            const payload = JSON.stringify(dataToEncrypt);
            const encryptedBlob = await encrypt(payload, masterKey);

            const result = await DatabaseService.updateSecret(id, user.username, encryptedBlob); // Pass username

            if (result.changes > 0) {
                setItems(prev => prev.map(item => (item.id === id ? newItem : item)));
                return true;
            } else {
                console.error("Update failed: No rows modified");
                return false;
            }
        } catch (e) {
            console.error('Update failed', e);
            return false;
        }
    };

    const deleteItem = async (id) => {
        if (!user?.username) return false;
        try {
            const result = await DatabaseService.deleteSecret(id, user.username); // Pass username
            if (result.changes > 0) {
                setItems(prev => prev.filter(item => item.id !== id));
                return true;
            } else {
                console.error("Delete failed: No rows modified");
                return false;
            }
        } catch (e) {
            console.error('Delete failed', e);
            return false;
        }
    };

    /* ---------- IMPORT / EXPORT ---------- */
    const exportVault = async () => {
        if (!masterKey || !user?.username) {
            Alert.alert("Erreur", "Utilisateur non connecté ou clé manquante.");
            return;
        }
        try {
            if (items.length === 0) {
                const proceed = await new Promise(resolve => {
                    Alert.alert(
                        "Attention",
                        "Votre coffre est vide. Voulez-vous exporter un fichier vide ?",
                        [
                            { text: "Annuler", onPress: () => resolve(false), style: "cancel" },
                            { text: "Continuer", onPress: () => resolve(true) }
                        ]
                    );
                });
                if (!proceed) return;
            }

            const backupData = JSON.stringify({
                version: 1,
                username: user.username,
                date: new Date().toISOString(),
                data: items
            });

            // Encrypt the entire JSON
            const encryptedBackup = await encrypt(backupData, masterKey);

            // File setup
            const filename = `vaultx_backup_${user.username}_${Date.now()}.enc`;
            const filepath = FileSystem.documentDirectory + filename;

            // Write
            await FileSystem.writeAsStringAsync(filepath, encryptedBackup);

            // Share
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(filepath, {
                    mimeType: 'application/octet-stream',
                    dialogTitle: 'Sauvegarder votre coffre'
                });
            } else {
                Alert.alert("Erreur", "Le partage n'est pas supporté sur cet appareil.");
            }
        } catch (e) {
            console.error("Export failed", e);
            Alert.alert("Erreur d'export", `Détails: ${e.message}`);
        }
    };

    const importVault = async (importedContent = null, transferPin = null) => {
        if (!masterKey || !user?.username) return;
        try {
            let content = importedContent;

            // FIX: If called directly from an event handler, 'importedContent' might be an object (Event).
            // We must ensure it is a string or null/undefined.
            if (typeof content !== 'string') {
                content = null;
            }

            if (!content) {
                const result = await DocumentPicker.getDocumentAsync({
                    type: '*/*',
                    copyToCacheDirectory: true
                });

                if (result.canceled) return;

                const fileUri = result.assets[0].uri;
                content = await FileSystem.readAsStringAsync(fileUri);
            }

            let keyToUse = masterKey;
            if (transferPin) {
                keyToUse = await deriveKey(transferPin, "vaultx_transfer_salt");
            }

            const decryptedBackup = decrypt(content, keyToUse);
            if (!decryptedBackup) {
                // Return false to indicate failure (unlike Alert inside)
                // We let the caller handle the specific user feedback if it's a transfer
                if (transferPin) return false;

                Alert.alert("Erreur", "Impossible de déchiffrer le fichier. Mot de passe incorrect ou mauvais utilisateur.");
                return;
            }

            const parsed = JSON.parse(decryptedBackup);
            if (!parsed.data || !Array.isArray(parsed.data)) {
                Alert.alert("Erreur", "Format de sauvegarde invalide.");
                return;
            }

            // For PIN transfer, we might want to skip the Alert confirmation or use a different one
            // But reuse consistency is fine for now.
            // Wait, we can't return logic inside an Alert button callback easily.
            // If it's a transfer, we likely want to just proceed or return true?
            // Let's keep the Alert for safety.

            return new Promise((resolve) => {
                Alert.alert(
                    "Confirmer la restauration",
                    "Cette action ajoutera/écrasera vos données. Continuer ?",
                    [
                        { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
                        {
                            text: "Restaurer",
                            style: "destructive",
                            onPress: async () => {
                                try {
                                    console.log(`Starting restore for user: ${user.username}, items: ${parsed.data.length}`);
                                    const encryptedRows = await Promise.all(parsed.data.map(async (item) => {
                                        // Ensure item is valid before stringifying
                                        if (typeof item !== 'object' || item === null) return null;

                                        const payload = JSON.stringify(item);
                                        const encryptedBlob = await encrypt(payload, masterKey);
                                        // Guard against encrypt returning junk (though unlikely)
                                        if (typeof encryptedBlob !== 'string') {
                                            console.error("Encryption returned non-string:", encryptedBlob);
                                            return null;
                                        }
                                        return { data: encryptedBlob };
                                    }));

                                    const validRows = encryptedRows.filter(r => r !== null);
                                    if (validRows.length > 0) {
                                        await DatabaseService.restoreFromBackup(user.username, validRows);
                                        await loadVault();
                                        Alert.alert("Succès", "Restauration terminée.");
                                        resolve(true);
                                    } else {
                                        Alert.alert("Erreur", "Aucune donnée valide à restaurer.");
                                        resolve(false);
                                    }
                                } catch (e) {
                                    console.error("Restore failed", e);
                                    resolve(false);
                                }
                            }
                        }
                    ]
                );
            });

        } catch (e) {
            console.error("Import failed code:", e);
            Alert.alert("Erreur", "L'import a échoué.");
            return false;
        }
    };

    const getExportData = async (pin = null) => {
        if (!masterKey || !user?.username) return null;
        try {
            const backupData = JSON.stringify({
                version: 1,
                username: user.username,
                date: new Date().toISOString(),
                data: items
            });

            let keyToUse = masterKey;
            if (pin) {
                // Use a fixed salt for transfer PINs to keep payload small
                // In a real app we might want unique salts per transfer
                keyToUse = await deriveKey(pin, "vaultx_transfer_salt");
            }

            const encryptedBackup = await encrypt(backupData, keyToUse);
            return encryptedBackup;
        } catch (e) {
            console.error("Get Export Data failed", e);
            return null;
        }
    };

    return (
        <VaultContext.Provider
            value={{
                items,
                isLoading,
                addItem,
                updateItem,
                deleteItem,
                exportVault,
                importVault,
                getExportData
            }}
        >
            {children}
        </VaultContext.Provider>
    );
};
