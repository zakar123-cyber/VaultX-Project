// Écran de connexion / inscription
// C'est la première page qu'on voit quand on n'est pas connecté

import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { ThemedView, ThemedText, ThemedButton, ThemedInput } from '../components/ThemedComponents';
import { useAuth } from '../context/AuthContext';
import { spacing, colors } from '../theme';

export default function LoginScreen() {
    // On récupère les fonctions d'authentification
    const { login, register, isFirstLaunch } = useAuth();

    // Les états pour les champs de saisie
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Cette fonction est appelée quand on appuie sur le bouton
    const handleAction = async () => {
        // On vérifie que tous les champs sont remplis
        if (!username || !password) {
            Alert.alert('Erreur', 'Veuillez remplir tous les champs');
            return;
        }

        setLoading(true);
        try {
            if (isFirstLaunch) {
                // C'est le premier lancement, on crée un nouveau compte
                const success = await register(username, password);
                if (!success) Alert.alert('Erreur', 'L\'inscription a échoué');
            } else {
                // On se connecte avec un compte existant
                const success = await login(username, password);
                if (!success) Alert.alert('Erreur', 'Identifiants incorrects');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <View style={styles.content}>
                {/* Le titre de l'application */}
                <ThemedText type="header" style={styles.title}>
                    VaultX
                </ThemedText>

                {/* Le sous-titre qui change selon si c'est le premier lancement ou pas */}
                <ThemedText style={styles.subtitle}>
                    {isFirstLaunch ? 'Créez votre coffre local' : 'Déverrouillez votre coffre'}
                </ThemedText>

                {/* Le champ pour le nom d'utilisateur */}
                <ThemedInput
                    label="Nom d'utilisateur"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                />

                {/* Le champ pour le mot de passe (masqué) */}
                <ThemedInput
                    label="Mot de passe maître"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                {/* Le bouton qui change de texte selon le contexte */}
                <ThemedButton
                    title={isFirstLaunch ? 'Créer le Coffre' : 'Déverrouiller'}
                    onPress={handleAction}
                    loading={loading}
                    style={styles.button}
                />
            </View>
        </ThemedView>
    );
}

// Les styles de l'écran
const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        padding: spacing.l,
    },
    // Le contenu est centré et limité en largeur
    content: {
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
    },
    // Le titre VaultX en gros
    title: {
        fontSize: 40,
        textAlign: 'center',
        marginBottom: spacing.s,
    },
    // Le sous-titre explicatif
    subtitle: {
        textAlign: 'center',
        marginBottom: spacing.xl,
        color: colors.textSecondary,
    },
    button: {
        marginTop: spacing.m,
    },
});
