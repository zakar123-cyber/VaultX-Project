import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deriveKey, generateSalt, encrypt, decrypt } from '../services/EncryptionService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [masterKey, setMasterKey] = useState(null); // Memory only
    const [user, setUser] = useState(null); // Current user
    const [usersList, setUsersList] = useState([]); // List of registered usernames
    const [isInitialized, setIsInitialized] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkInitialization();
    }, []);

    const checkInitialization = async () => {
        try {
            // Load list of users
            const usersJson = await AsyncStorage.getItem('vault_users');
            const users = usersJson ? JSON.parse(usersJson) : [];
            setUsersList(users);
            setIsInitialized(true);
        } catch (e) {
            console.error("Auth init check failed", e);
        } finally {
            setLoading(false);
        }
    };

    // Register a NEW User
    const register = async (username, password) => {
        try {
            if (usersList.includes(username)) return false; // Already exists

            const salt = await generateSalt();
            const key = deriveKey(password, salt);

            const verifierText = "VAULT_VERIFIED";
            const encryptedVerifier = await encrypt(verifierText, key);

            // Store user-specific security params
            await AsyncStorage.setItem(`vault_salt_${username}`, salt);
            await AsyncStorage.setItem(`vault_verifier_${username}`, encryptedVerifier);

            // Update user list
            const newUsersList = [...usersList, username];
            await AsyncStorage.setItem('vault_users', JSON.stringify(newUsersList));
            setUsersList(newUsersList);

            // Auto-login
            setMasterKey(key);
            setUser({ username });
            return { success: true, key }; // Return key for display
        } catch (e) {
            console.error("Registration failed", e);
            return { success: false, error: e };
        }
    };

    // Login EXISTING User
    const login = async (username, password) => {
        try {
            if (!usersList.includes(username)) return false;

            const salt = await AsyncStorage.getItem(`vault_salt_${username}`);
            const verifier = await AsyncStorage.getItem(`vault_verifier_${username}`);

            if (!salt || !verifier) return false;

            const key = deriveKey(password, salt);
            const decryptedVerifier = decrypt(verifier, key);

            if (decryptedVerifier === "VAULT_VERIFIED") {
                setMasterKey(key);
                setUser({ username });
                return true;
            } else {
                return false;
            }
        } catch (e) {
            console.error("Login failed", e);
            return false;
        }
    };

    const logout = () => {
        setMasterKey(null);
        setUser(null);
    };

    const resetAll = async () => {
        try {
            await AsyncStorage.clear();
            const { resetDatabase } = require('../services/DatabaseService');
            await resetDatabase();
            setMasterKey(null);
            setUser(null);
            setUsersList([]);
            return true;
        } catch (e) {
            console.error("Reset failed", e);
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{
            masterKey,
            user,
            usersList,
            isInitialized,
            isLoading: loading,
            isAuthenticated: !!masterKey,
            isFirstLaunch: usersList.length === 0, // True if NO users exist
            register,
            login,
            logout,
            resetAll
        }}>
            {children}
        </AuthContext.Provider>
    );
};
