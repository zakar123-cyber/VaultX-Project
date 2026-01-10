// import * as Notifications from 'expo-notifications'; // Disabled for temporary workaround
import { Platform } from 'react-native';

// MOCK Notifications to bypass missing native module on old APK
let Notifications;
try {
    // This is a hack. The import itself might not fail in JS, but calling methods usually does.
    // However, the error 'Cannot find native module ExpoPushTokenManager' often happens at import/setup time.
    // We will try to rely on a mock object if the real one crashes.
    Notifications = require('expo-notifications');

    // Test a property to verify native link (optional, but good practice)
    // If this throws, we go to catch.
} catch (e) {
    console.warn("Expo Notifications not found (Native module missing). Using Mock.");
    Notifications = {
        setNotificationHandler: () => { },
        setNotificationChannelAsync: async () => { },
        getPermissionsAsync: async () => ({ status: 'denied' }),
        requestPermissionsAsync: async () => ({ status: 'denied' }),
        scheduleNotificationAsync: async () => { },
        AndroidImportance: { LOW: 3 }
    };
}

// Ensure setNotificationHandler exists even if require worked but native crashed
if (!Notifications.setNotificationHandler) {
    Notifications = {
        setNotificationHandler: () => { },
        setNotificationChannelAsync: async () => { },
        getPermissionsAsync: async () => ({ status: 'denied' }),
        requestPermissionsAsync: async () => ({ status: 'denied' }),
        scheduleNotificationAsync: async () => { },
        AndroidImportance: { LOW: 3 }
    };
}


// Configure how notifications behave when the app is in the foreground
try {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    });
} catch (e) {
    console.warn("Failed to set notification handler:", e);
}

export const initNotifications = async () => {
    try {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('backup-channel', {
                name: 'Backup Notifications',
                importance: Notifications.AndroidImportance.LOW, // Low importance for background syncs
            });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        return finalStatus === 'granted';
    } catch (e) {
        console.warn("initNotifications failed (likely missing native module):", e);
        return false;
    }
};

export const sendBackupNotification = async (success) => {
    try {
        if (success) {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Sauvegarde Réussie ✅",
                    body: "Vos données sont sécurisées sur le cloud.",
                },
                trigger: null, // Send immediately
            });
        } else {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Échec de la Sauvegarde ❌",
                    body: "Vérifiez votre connexion internet.",
                },
                trigger: null,
            });
        }
    } catch (e) {
        console.warn("sendBackupNotification failed:", e);
    }
};
