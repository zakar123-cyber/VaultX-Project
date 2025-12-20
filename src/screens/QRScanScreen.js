import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Alert, TextInput, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ThemedView, ThemedText } from '../components/ThemedComponents';
import { useVault } from '../context/VaultContext';
import { spacing, colors } from '../theme';

export default function QRScanScreen({ navigation }) {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const { importVault } = useVault();

    const [showPinPrompt, setShowPinPrompt] = useState(false);
    const [scannedData, setScannedData] = useState(null);
    const [inputPin, setInputPin] = useState('');

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission]);

    const handleBarCodeScanned = async ({ data }) => {
        if (scanned) return;
        setScanned(true);
        setScannedData(data);
        setShowPinPrompt(true);
    };

    const processImport = async () => {
        setShowPinPrompt(false);
        try {
            console.log("Processing import with PIN length:", inputPin.length);
            // Try importing with the entered PIN
            const success = await importVault(scannedData, inputPin.trim());
            if (success) {
                Alert.alert('Succès', 'Données importées avec succès', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            } else {
                Alert.alert('Erreur', 'Code PIN incorrect (vérifiez sur l\'autre appareil)', [
                    {
                        text: 'Réessayer',
                        onPress: () => {
                            setScanned(false);
                            setScannedData(null);
                            setInputPin('');
                        }
                    }
                ]);
            }
        } catch (e) {
            console.error("Import error UI:", e);
            Alert.alert('Erreur', 'Échec de l\'import', [
                {
                    text: 'Réessayer',
                    onPress: () => {
                        setScanned(false);
                        setScannedData(null);
                        setInputPin('');
                    }
                }
            ]);
        }
    };

    if (!permission) {
        return <ThemedView style={styles.center}><ThemedText>Requesting permissions...</ThemedText></ThemedView>;
    }

    if (!permission.granted) {
        return (
            <ThemedView style={styles.center}>
                <ThemedText style={{ marginBottom: 10 }}>No access to camera</ThemedText>
                <ThemedText onPress={requestPermission} style={{ color: colors.blue }}>Grant Permission</ThemedText>
            </ThemedView>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFillObject}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{
                    barcodeTypes: ["qr"],
                }}
            />

            {/* Overlay Frame */}
            <View style={styles.frameContainer}>
                <View style={styles.frame} />
                <ThemedText style={styles.hint}>Align QR code within the frame</ThemedText>
            </View>

            {/* PIN Prompt Modal (Overlay) */}
            {showPinPrompt && (
                <View style={styles.promptOverlay}>
                    <View style={styles.promptBox}>
                        <ThemedText type="header" style={styles.promptTitle}>Entrez le Code PIN</ThemedText>
                        <ThemedText style={styles.promptMsg}>Le code affiché sur l'autre téléphone</ThemedText>

                        <TextInput
                            style={styles.pinInput}
                            value={inputPin}
                            onChangeText={setInputPin}
                            placeholder="Ex: 1234"
                            placeholderTextColor="#999"
                            keyboardType="numeric"
                            autoCorrect={false}
                            maxLength={4}
                            autoFocus
                        />

                        <View style={styles.promptActions}>
                            <TouchableOpacity
                                style={[styles.promptBtn, styles.cancelBtn]}
                                onPress={() => {
                                    setShowPinPrompt(false);
                                    setScanned(false);
                                    setScannedData(null);
                                    setInputPin('');
                                }}
                            >
                                <ThemedText>Annuler</ThemedText>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.promptBtn, styles.confirmBtn]}
                                onPress={processImport}
                            >
                                <ThemedText style={{ color: 'white', fontWeight: 'bold' }}>Valider</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    frameContainer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    frame: {
        width: 250,
        height: 250,
        borderWidth: 2,
        borderColor: colors.blue,
        backgroundColor: 'transparent',
        marginBottom: spacing.m,
    },
    hint: {
        color: 'white',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: spacing.s,
        borderRadius: spacing.s,
    },
    // Prompt Styles
    promptOverlay: {
        ...StyleSheet.absoluteFillObject, // Covers entire screen
        backgroundColor: 'rgba(0,0,0,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100, // Ensure it's on top
    },
    promptBox: {
        width: '80%',
        backgroundColor: colors.background, // Will be dark or light
        padding: spacing.l,
        borderRadius: spacing.m,
        alignItems: 'center',
    },
    promptTitle: {
        marginBottom: spacing.s,
    },
    promptMsg: {
        marginBottom: spacing.m,
        textAlign: 'center',
        color: colors.textSecondary,
    },
    pinInput: {
        width: '100%',
        backgroundColor: colors.inputBackground || '#f0f0f0',
        padding: spacing.m,
        borderRadius: spacing.s,
        fontSize: 24,
        textAlign: 'center',
        letterSpacing: 4,
        marginBottom: spacing.l,
        color: 'black', // Force black text for input for visibility if not themed perfectly
    },
    promptActions: {
        flexDirection: 'row',
        gap: spacing.m,
        width: '100%',
    },
    promptBtn: {
        flex: 1,
        padding: spacing.m,
        borderRadius: spacing.s,
        alignItems: 'center',
    },
    cancelBtn: {
        backgroundColor: colors.card,
    },
    confirmBtn: {
        backgroundColor: colors.primary,
    },
});
