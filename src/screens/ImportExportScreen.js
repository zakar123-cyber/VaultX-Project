import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedView, ThemedText, ThemedButton } from '../components/ThemedComponents';
import { useVault } from '../context/VaultContext';
import { spacing } from '../theme';

export default function ImportExportScreen() {
    const {
        exportVault,
        importVault,
        isLoading
    } = useVault();

    return (
        <ThemedView style={styles.container}>
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
                    onPress={() => importVault()}
                    loading={isLoading}
                    variant="secondary"
                    style={styles.button}
                />
            </View>
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
});
