import React, { createContext, useState, useEffect, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { backupDataToFirestore } from '../services/BackupService';
import * as DatabaseService from '../services/DatabaseService';
import { encrypt, decrypt, deriveKey } from '../services/EncryptionService';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const VaultContext = createContext();
export const useVault = () => useContext(VaultContext);

export const VaultProvider = ({ children }) => {
    const { masterKey, isAuthenticated, user, cloudUser, isCloudVerified } = useAuth(); // Need 'user'
    const { isAutoBackupEnabled } = useSettings();
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

            let failedCount = 0;

            const decryptedItems = rows.map(row => {
                try {
                    const plaintext = decrypt(row.data, masterKey);
                    if (!plaintext) {
                        // Decryption failed (Wrong Key or Corrupted Data)
                        console.warn(`Row ${row.id} failed decryption (possible wrong key for this item)`);
                        failedCount++;
                        return null;
                    }
                    // Validate JSON before parsing
                    if (typeof plaintext !== 'string' || !plaintext.startsWith('{')) {
                        console.warn(`Row ${row.id} invalid format:`, plaintext.substring(0, 20));
                        failedCount++;
                        return null;
                    }
                    const itemData = JSON.parse(plaintext);
                    return { ...itemData, id: row.id, created_at: row.created_at };
                } catch (e) {
                    console.error("Failed to parse row", row.id, e);
                    failedCount++;
                    return null;
                }
            }).filter(item => item !== null);

            setItems(decryptedItems);

            if (failedCount > 0) {
                Alert.alert(
                    " Attention",
                    `${failedCount} élément(s) n'ont pas pu être déchiffrés.\n\nCeci arrive si vous avez restauré une sauvegarde créée avec un MOT DE PASSE DIFFÉRENT.`
                );
            }
        } catch (e) {
            console.error('Failed to load vault', e);
        } finally {
            setIsLoading(false);
        }
    };

    /* ---------- CRUD ---------- */
    const triggerAutoBackup = async () => {
        // Debugging the condition
        console.log(`AutoBackup Check: Enabled=${isAutoBackupEnabled}, CloudUser=${!!cloudUser}, LocalUser=${!!user?.username}`);

        if (isAutoBackupEnabled && cloudUser && user?.username) {
            console.log("Triggering Auto Backup...");
            backupDataToFirestore(cloudUser.uid, user.username).then(res => {
                if (!res.success) console.warn("Auto Backup Failed", res.error);
            });
        }
    };

    const addItem = async (item) => {
        if (!masterKey || !user?.username) return false;
        try {
            const payload = JSON.stringify(item);
            const encryptedBlob = await encrypt(payload, masterKey);

            const newId = await DatabaseService.addSecret(user.username, encryptedBlob); // Pass username
            if (newId) {
                setItems(prev => [...prev, { ...item, id: newId }]);
                triggerAutoBackup();
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
                triggerAutoBackup();
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
                triggerAutoBackup();
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

            const backupPayload = JSON.stringify({
                version: 1,
                username: user.username,
                date: new Date().toISOString(),
                data: items
            });

            // PORTABILITY FIX: Retrieve the salt so we can include it in the file
            const userSalt = await AsyncStorage.getItem(`vault_salt_${user.username}`);
            if (!userSalt) {
                console.warn("Export warning: No salt found for user, backup might not be portable.");
            }

            // Encrypt the payload
            // 'encrypt' returns JSON string: { ciphertext, iv }
            const encryptedString = await encrypt(backupPayload, masterKey);
            const encryptedObj = JSON.parse(encryptedString);

            // Create container with Salt (Version 2 format)
            const finalExportObject = {
                version: 2,
                salt: userSalt, // Include salt for portability
                ...encryptedObj // Spread ciphertext and iv
            };

            // Write as JSON string
            const finalExportString = JSON.stringify(finalExportObject);

            // File setup
            const filename = `vaultx_backup_${user.username}_${Date.now()}.enc`;
            const filepath = FileSystem.documentDirectory + filename;

            // Write
            await FileSystem.writeAsStringAsync(filepath, finalExportString);

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

    /**
     * Imports vault data.
     * @param {string|null} importedContent - Content from file (if already read)
     * @param {string|null} passwordOrPin - Optional password (manual entry) or PIN (transfer)
     * @param {boolean} isManualPassword - True if passwordOrPin is a raw password, False if it's a Transfer PIN
     */
    const importVault = async (importedContent = null, passwordOrPin = null, isManualPassword = false, providedSalt = null) => {
        if (!user?.username) return { success: false, error: 'NO_USER' };

        try {
            let content = importedContent;

            // Handle event object or non-string
            if (typeof content !== 'string') {
                content = null;
            }

            // 1. Pick File if no content
            if (!content) {
                const result = await DocumentPicker.getDocumentAsync({
                    type: '*/*',
                    copyToCacheDirectory: true
                });

                if (result.canceled) return { success: false, error: 'CANCELED' };

                const fileUri = result.assets[0].uri;
                content = await FileSystem.readAsStringAsync(fileUri);
            }

            // 2. Parse Outer Container (check for V2/Portability)
            let fileSalt = null;
            let fileCiphertext = null;
            let fileIv = null;

            // Try to parse as JSON to check for V2 structure
            try {
                const container = JSON.parse(content);
                if (container.salt && container.ciphertext && container.iv) {
                    // VERSION 2 (Portable)
                    fileSalt = container.salt;
                    fileCiphertext = container.ciphertext;
                    fileIv = container.iv;
                    // Reconstruct the format 'decrypt' expects: { ciphertext, iv } stringified
                    content = JSON.stringify({ ciphertext: fileCiphertext, iv: fileIv });
                }
            } catch (jsonErr) {
                // Not a JSON container, assume Version 1 (Raw Encrypted String which is also JSON but might not have salt property at root)
                // or it's just the old format string. Proceed with 'content' as is.
            }

            // 3. Determine Key
            let keyToUse = masterKey; // Default: Try active session key

            if (passwordOrPin) {
                if (isManualPassword) {
                    // CASE: Manual Password Entry
                    // We need a salt. Check manual providedSalt FIRST, then fileSalt, then context.
                    const saltContext = providedSalt || fileSalt || await AsyncStorage.getItem(`vault_salt_${user.username}`);

                    if (!saltContext) {
                        Alert.alert("Erreur", "Fichier incompatible (pas de sel) et utilisateur inconnu.");
                        return { success: false, error: 'MISSING_SALT' };
                    }

                    const passwordToCheck = String(passwordOrPin).trim();
                    keyToUse = deriveKey(passwordToCheck, saltContext);
                } else {
                    // CASE: Transfer PIN
                    keyToUse = await deriveKey(passwordOrPin, "vaultx_transfer_salt");
                }
            }

            // 4. Decrypt
            const decryptedBackup = decrypt(content, keyToUse);

            if (!decryptedBackup) {
                // Decryption Failure
                if (isManualPassword || passwordOrPin) {
                    // If we explicitly tried a password/pin and it failed -> Wrong Password
                    Alert.alert("Erreur", "Mot de passe incorrect (ou fichier d'un autre utilisateur).");
                    return { success: false, error: 'WRONG_PASSWORD' };
                }

                // If we tried default masterKey and failed -> Prompt User
                return { success: false, error: 'DECRYPTION_FAILED', content: content, originalContent: importedContent || content, salt: fileSalt };
                // Note: passing back content so UI can re-submit it with password
            }

            // 5. Parse Decrypted Data
            let parsed;
            try {
                parsed = JSON.parse(decryptedBackup);
            } catch (e) {
                console.error("JSON Parse Error on Decrypted Data:", e);
                // If it decrypts to garbage, it means WRONG KEY was used but padding check accidentally passed (unlikely but possible with CBC)
                // OR the file is actually corrupted.
                // Usually Wrong Key -> padding error in decrypt -> returns null.
                Alert.alert("Erreur", `Données illisibles après déchiffrement.\n${e.message}`);
                return { success: false, error: 'CORRUPT_DATA' };
            }

            if (!parsed.data || !Array.isArray(parsed.data)) {
                Alert.alert("Erreur", "Format de sauvegarde invalide (pas de données trouvées).");
                return { success: false, error: 'INVALID_FORMAT' };
            }

            // 6. Confirmation & Restore
            return new Promise((resolve) => {
                Alert.alert(
                    "Confirmer la restauration",
                    `Restaurer ${parsed.data.length} éléments ? \n(Écrasera les doublons)`,
                    [
                        { text: "Annuler", style: "cancel", onPress: () => resolve({ success: false, error: 'CANCELED' }) },
                        {
                            text: "Restaurer",
                            style: "destructive",
                            onPress: async () => {
                                try {
                                    // Re-encrypt all items with CURRENT user's Master Key (to adopt them into current vault)
                                    // Important: If we imported using a different password, we MUST re-encrypt with 'masterKey' (active session key)
                                    // so the current user can read them later.

                                    if (!masterKey) {
                                        // Should not happen if logged in
                                        resolve({ success: false, error: 'NO_SESSION' });
                                        return;
                                    }

                                    const encryptedRows = await Promise.all(parsed.data.map(async (item) => {
                                        if (typeof item !== 'object' || item === null) return null;
                                        const payload = JSON.stringify(item);
                                        // Always encrypt with CURRENT ACTIVE KEY
                                        const encryptedBlob = await encrypt(payload, masterKey);
                                        return { data: encryptedBlob };
                                    }));

                                    const validRows = encryptedRows.filter(r => r !== null);
                                    if (validRows.length > 0) {
                                        await DatabaseService.restoreFromBackup(user.username, validRows);
                                        await loadVault();
                                        Alert.alert("Succès", "Restauration terminée.");
                                        resolve({ success: true });
                                    } else {
                                        Alert.alert("Erreur", "Aucune donnée valide à restaurer.");
                                        resolve({ success: false, error: 'NO_DATA' });
                                    }
                                } catch (e) {
                                    console.error("Restore failed", e);
                                    resolve({ success: false, error: 'RESTORE_ERROR' });
                                }
                            }
                        }
                    ]
                );
            });

        } catch (e) {
            console.error("Import failed code:", e);
            Alert.alert("Erreur", "L'import a échoué.");
            return { success: false, error: 'UNKNOWN' };
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
                getExportData,
                refreshVault: loadVault,
                triggerAutoBackup // Exported for manual trigger (e.g. from Settings)
            }}
        >
            {children}
        </VaultContext.Provider>
    );
};
