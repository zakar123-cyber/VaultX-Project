import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ThemedView, ThemedText } from '../components/ThemedComponents';
import { useVault } from '../context/VaultContext';
import { spacing, colors } from '../theme';

export default function QRShareScreen() {
    const { getExportData } = useVault();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [pin, setPin] = useState('');

    useEffect(() => {
        // Generate random 4-digit PIN
        const newPin = Math.floor(1000 + Math.random() * 9000).toString();
        setPin(newPin);
        loadData(newPin);
    }, []);

    const loadData = async (pinToUse) => {
        const exportData = await getExportData(pinToUse);
        if (exportData) {
            if (exportData.length > 2500) {
                setError('Vault data is too large for a single QR code.');
            } else {
                setData(exportData);
            }
        } else {
            setError('No data to share.');
        }
    };

    return (
        <ThemedView style={styles.container}>
            <ThemedText type="header" style={styles.title}>Share Vault</ThemedText>

            {/* PIN Display */}
            <View style={styles.pinContainer}>
                <ThemedText style={styles.pinLabel}>Transfer PIN:</ThemedText>
                <ThemedText type="header" style={styles.pinValue}>{pin}</ThemedText>
                <ThemedText style={styles.pinHint}>Enter this on the receiver's phone</ThemedText>
            </View>

            <View style={styles.qrContainer}>
                {error ? (
                    <ThemedText style={styles.error}>{error}</ThemedText>
                ) : data ? (
                    <View style={styles.qrWrapper}>
                        <QRCode value={data} size={250} backgroundColor="white" color="black" />
                    </View>
                ) : (
                    <ThemedText>Loading...</ThemedText>
                )}
            </View>
            <ThemedText style={styles.hint}>
                Scan this with another VaultX app to transfer your data.
            </ThemedText>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: spacing.l,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        marginBottom: spacing.xl,
    },
    qrContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 300,
        width: 300,
        marginBottom: spacing.xl,
    },
    qrWrapper: {
        padding: spacing.m,
        backgroundColor: 'white',
        borderRadius: spacing.m,
    },
    error: {
        color: colors.danger,
        textAlign: 'center',
    },
    hint: {
        textAlign: 'center',
        color: colors.textSecondary,
    },
    pinContainer: {
        alignItems: 'center',
        marginBottom: spacing.l,
        padding: spacing.m,
        backgroundColor: colors.card,
        borderRadius: spacing.m,
        width: '100%',
    },
    pinLabel: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: spacing.s,
    },
    pinValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.primary,
        marginBottom: spacing.s,
    },
    pinHint: {
        fontSize: 12,
        color: colors.textSecondary,
    },
});
