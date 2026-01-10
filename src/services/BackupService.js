import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebaseConfig";
import { getAllDataForBackup, restoreFromBackup } from "./DatabaseService";
import AsyncStorage from '@react-native-async-storage/async-storage'; // Import AsyncStorage

import { sendBackupNotification } from './NotificationService';

export const backupDataToFirestore = async (userId, username) => {
    try {
        console.log(`Starting backup for user: ${username} (Cloud ID: ${userId})`);

        // 1. Get ALL LOCAL data for this user
        const localData = await getAllDataForBackup(username);

        if (localData.length === 0) {
            console.log("No data to backup.");
            await sendBackupNotification(true);
            return { success: true, message: "No data to backup" };
        }

        // 2. Get the SALT used for this user's encryption
        const userSalt = await AsyncStorage.getItem(`vault_salt_${username}`);
        if (!userSalt) {
            console.warn("Warning: Backing up without a salt. Restoration on other devices might fail.");
        }

        const docRef = doc(db, "users", userId);

        // 3. Prepare payload WITH SALT
        const backupData = {
            username: username,
            backupTimestamp: new Date().toISOString(),
            device: "Mobile",
            version: 2, // Bump version to indicate salt presence
            salt: userSalt, // CRITICAL: Save the salt!
            data: localData
        };

        // Use dynamic key based on username to allow multiple local users per Cloud Account
        const backupKey = `backup_${username}`;

        await setDoc(docRef, { [backupKey]: backupData }, { merge: true });

        console.log("Backup successful.");
        await sendBackupNotification(true);
        return { success: true };

    } catch (error) {
        console.error("Backup Failed", error);
        await sendBackupNotification(false);
        return { success: false, error: error.message };
    }
};

export const restoreDataFromFirestore = async (userId, username) => {
    // Legacy function wrapper for backward compatibility or direct restore
    const result = await fetchCloudBackup(userId, username);
    if (!result.success) return result;

    await restoreFromBackup(username, result.rows);
    return { success: true, count: result.rows.length };
};

export const fetchCloudBackup = async (userId, username) => {
    try {
        console.log(`Fetching backup for user: ${username} (Cloud ID: ${userId})`);

        const docRef = doc(db, "users", userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            // Priority 1: Check specific user backup
            let backupKey = `backup_${username}`;
            let backupPayload = data[backupKey];

            // Priority 2: Check legacy 'backup' field
            if (!backupPayload) {
                backupPayload = data.backup;
                if (backupPayload) backupKey = 'backup';
            }

            // Priority 3: Fallback - Look for ANY key starting with 'backup_'
            // This is useful for cross-account restoration (Migration)
            if (!backupPayload) {
                const allKeys = Object.keys(data);
                const otherBackupKey = allKeys.find(k => k.startsWith('backup_'));
                if (otherBackupKey) {
                    console.log(`No backup for ${username}, but found ${otherBackupKey}. Using that.`);
                    backupPayload = data[otherBackupKey];
                    backupKey = otherBackupKey;
                }
            }

            if (backupPayload) {
                let rows = [];
                if (backupPayload.data && Array.isArray(backupPayload.data)) {
                    rows = backupPayload.data;
                } else if (typeof backupPayload === 'string') {
                    rows = JSON.parse(backupPayload);
                } else {
                    rows = backupPayload;
                }

                // Return RAW rows. Do NOT write to DB yet.
                // We pass back the 'salt' found in this specific backup payload
                return { success: true, rows, salt: backupPayload.salt, originalUser: backupPayload.username || 'unknown' };
            } else {
                return { success: false, error: "No backup found for this account (or any other profile)." };
            }
        } else {
            return { success: false, error: "No cloud account data found." };
        }
    } catch (error) {
        console.error("Fetch failed:", error);
        return { success: false, error: error.message };
    }
};
