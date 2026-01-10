import React, { useState } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { ThemedView, ThemedText, ThemedButton, ThemedInput } from '../components/ThemedComponents';
import ThemedModal from '../components/ThemedModal';
import { useVault } from '../context/VaultContext';
import { spacing } from '../theme';
import { useAuth } from '../context/AuthContext';
import { restoreDataFromFirestore } from '../services/BackupService';

export default function ImportExportScreen() {
    const {
        exportVault,
        importVault,
        isLoading,
        refreshVault
    } = useVault();
    const { user, cloudUser, isCloudAuthenticated, promptGoogleLogin, masterKey } = useAuth(); // Destructure masterKey

    const [passwordModalVisible, setPasswordModalVisible] = useState(false);
    const [importPassword, setImportPassword] = useState('');
    const [pendingImport, setPendingImport] = useState(null); // { rows, salt }

    const handleImportPress = () => {
        Alert.alert(
            "Importer",
            "Choisir la source de la sauvegarde",
            [
                { text: "📁 Fichier Local", onPress: handleFileImport },
                { text: "☁️ Cloud (Firebase)", onPress: handleCloudRestore },
                { text: "Annuler", style: "cancel" }
            ]
        );
    };

    const handleFileImport = async () => {
        const result = await importVault();
        if (result && !result.success) {
            if (result.error === 'DECRYPTION_FAILED') {
                setPendingImport({
                    content: result.content,
                    salt: result.salt
                });
                setImportPassword('');
                setPasswordModalVisible(true);
            }
        }
    };

    const handleCloudRestore = async () => {
        if (!isCloudAuthenticated) {
            Alert.alert(
                "Authentification Requise",
                "Connectez-vous pour restaurer une sauvegarde.",
                [
                    { text: "Annuler", style: "cancel" },
                    { text: "Se connecter (Google)", onPress: () => promptGoogleLogin() }
                ]
            );
            return;
        }

        Alert.alert(
            "Restaurer depuis le Cloud",
            "Ceci REMPLACERA toutes les données locales actuelles.\n\nÊtes-vous sûr ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Restaurer",
                    style: "destructive",
                    onPress: async () => {
                        // 1. Fetch RAW data
                        const { fetchCloudBackup } = require('../services/BackupService');
                        const result = await fetchCloudBackup(cloudUser.uid, user.username);

                        if (result.success) {
                            if (!result.rows || result.rows.length === 0) {
                                Alert.alert("Info", "Sauvegarde vide.");
                                return;
                            }

                            // 2. Check if we can decrypt with CURRENT master key
                            const { decrypt, encrypt } = require('../services/EncryptionService');

                            // Try decrypting the first item as a test
                            const sampleItem = result.rows[0];
                            const testDecrypted = decrypt(sampleItem.data, masterKey);

                            if (testDecrypted) {
                                // SUCCESS: Current key works. Restore directly.
                                // We actually need to pass the "Encrypted Rows" to restoreFromBackup
                                // But DatabaseService.restoreFromBackup expects an array of { data: blob } 
                                // which is exactly what result.rows is (or close to it).
                                // Let's simplify: Just call restore function.
                                await processRestore(result.rows);
                            } else {
                                // FAIL: Current key doesn't work.
                                // We need to Ask for Old Password.
                                console.log("Smart Restore: Current key failed. Prompting for old password.");
                                setPendingImport({
                                    rows: result.rows,
                                    salt: result.salt
                                });
                                setImportPassword('');
                                setPasswordModalVisible(true);
                            }

                        } else {
                            Alert.alert("Erreur", result.error || "Échec de la récupération.");
                        }
                    }
                }
            ]
        );
    };

    const processRestore = async (rows) => {
        const { restoreFromBackup } = require('../services/DatabaseService');
        try {
            await restoreFromBackup(user.username, rows);
            if (refreshVault) await refreshVault();
            Alert.alert("Succès", "Restauration terminée.");
        } catch (e) {
            console.error("Restore DB failed:", e);
            Alert.alert("Erreur", "Échec de l'écriture en base de données.");
        }
    };

    const handlePasswordSubmit = async () => {
        if (!importPassword) return;

        setPasswordModalVisible(false);

        if (!pendingImport) return;

        // CASE 1: File Import (Single String Content)
        if (pendingImport.content) {
            // Re-attempt import with manual password
            const result = await importVault(pendingImport.content, importPassword.trim(), true, pendingImport.salt);

            if (result && !result.success) {
                // If wrong password, we could re-open modal or just show alert from importVault
            }
            // Reset
            setPendingImport(null);
            setImportPassword('');
            return;
        }

        // CASE 2: Cloud Import (Array of Encrypted Rows)
        if (pendingImport.rows) {
            const { decrypt, deriveKey, encrypt } = require('../services/EncryptionService');

            // 1. Derive OLD KEY
            const saltToUse = pendingImport.salt || "vault_salt_legacy";
            if (!saltToUse) {
                Alert.alert("Erreur", "Impossible de dériver la clé (Sel manquant).");
                return;
            }

            const oldKey = deriveKey(importPassword.trim(), saltToUse);

            // 2. Try Decrypting Sample
            const sampleItem = pendingImport.rows[0];
            const testDecrypted = decrypt(sampleItem.data, oldKey);

            if (!testDecrypted) {
                Alert.alert("Erreur", "Mot de passe incorrect (Déchiffrement échoué).");
                return;
            }

            // 3. SUCCESS! Re-encrypt ALL items with CURRENT MasterKey
            try {
                const reEncryptedRows = [];
                for (let row of pendingImport.rows) {
                    const plaintext = decrypt(row.data, oldKey);
                    if (plaintext) {
                        const newCiphertext = await encrypt(plaintext, masterKey);
                        reEncryptedRows.push({ data: newCiphertext });
                    }
                }

                // 4. Restore
                await processRestore(reEncryptedRows);

                // Cleanup
                setPendingImport(null);
                setImportPassword('');

            } catch (e) {
                console.error("Re-encryption failed:", e);
                Alert.alert("Erreur", "Échec lors de la migration des données.");
            }
        }
    };

    return (
        <ThemedView style={styles.container}>
            {/* ... Only change logic, keeping UI same ... */}
            <ThemedText type="header" style={styles.title}>
                Gestion des Données
            </ThemedText>

            <ThemedText style={styles.description}>
                Vos sauvegardes sont chiffrées avec votre mot de passe maître.
                Seule une personne possédant ce mot de passe pourra les restaurer.
            </ThemedText>

            <View style={styles.actions}>
                <ThemedButton
                    title="Exporter le Coffre (.enc)"
                    onPress={exportVault}
                    loading={isLoading}
                    style={styles.button}
                />

                <ThemedButton
                    title="Importer une Sauvegarde"
                    onPress={handleImportPress}
                    loading={isLoading}
                    variant="secondary"
                    style={styles.button}
                />
            </View>

            <ThemedModal
                visible={passwordModalVisible}
                onClose={() => setPasswordModalVisible(false)}
                title="Déchiffrement requis"
            >
                <ThemedText style={styles.modalText}>
                    Cette sauvegarde ne peut pas être déchiffrée avec votre clé actuelle (compte différent ou réinstallation).
                </ThemedText>
                <ThemedText style={styles.modalText}>
                    Veuillez entrer le mot de passe maître qui a servi à créer cette sauvegarde.
                </ThemedText>

                <ThemedInput
                    label="Mot de passe maître"
                    value={importPassword}
                    onChangeText={setImportPassword}
                    secureTextEntry
                    autoFocus
                    placeholder="Entrez le mot de passe..."
                />

                <View style={styles.modalActions}>
                    <ThemedButton
                        title="Annuler"
                        onPress={() => setPasswordModalVisible(false)}
                        variant="secondary"
                        style={styles.modalButton}
                    />
                    <ThemedButton
                        title="Déchiffrer"
                        onPress={handlePasswordSubmit}
                        style={styles.modalButton}
                        disabled={!importPassword}
                    />
                </View>
            </ThemedModal>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: spacing.l,
        justifyContent: 'center',
        flex: 1,
    },
    title: {
        textAlign: 'center',
        marginBottom: spacing.m,
    },
    description: {
        textAlign: 'center',
        marginBottom: spacing.xl,
        lineHeight: 22,
        opacity: 0.8,
    },
    actions: {
        gap: spacing.m,
    },
    button: {
        width: '100%',
    },
    modalText: {
        marginBottom: spacing.m,
        lineHeight: 20,
    },
    modalActions: {
        flexDirection: 'row',
        gap: spacing.m,
        marginTop: spacing.m,
    },
    modalButton: {
        flex: 1,
    },
});
