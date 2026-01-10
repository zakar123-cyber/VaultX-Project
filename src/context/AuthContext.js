import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deriveKey, generateSalt, encrypt, decrypt } from '../services/EncryptionService';
import {
    signOut,
    GoogleAuthProvider,
    signInWithCredential,
    onAuthStateChanged
} from 'firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { auth } from '../services/firebaseConfig';
import { Alert } from 'react-native';



const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [masterKey, setMasterKey] = useState(null); // Memory only
    const [user, setUser] = useState(null); // Current user
    const [usersList, setUsersList] = useState([]); // List of registered usernames
    const [isInitialized, setIsInitialized] = useState(false);
    const [loading, setLoading] = useState(true);

    // --- CLOUD AUTH STATE ---
    const [cloudUser, setCloudUser] = useState(null);
    const [cloudLoading, setCloudLoading] = useState(true);

    // Monitor Firebase Auth State
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCloudUser(user);
            setCloudLoading(false);
        });
        return unsubscribe;
    }, []);

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
    const register = async (username, password, forceReset = false) => {
        try {
            if (!forceReset && usersList.includes(username)) return false; // Already exists

            if (forceReset) {
                // Clear everything first
                await AsyncStorage.clear();
                const { resetDatabase } = require('../services/DatabaseService');
                await resetDatabase();
            }

            const salt = await generateSalt();
            const key = deriveKey(password, salt);

            const verifierText = "VAULT_VERIFIED";
            const encryptedVerifier = await encrypt(verifierText, key);

            // Store user-specific security params
            await AsyncStorage.setItem(`vault_salt_${username}`, salt);
            await AsyncStorage.setItem(`vault_verifier_${username}`, encryptedVerifier);

            // Update user list
            const newUsersList = forceReset ? [username] : [...usersList, username];
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

    // --- CLOUD AUTH FUNCTIONS ---

    // --- CLOUD AUTH FUNCTIONS (GOOGLE) ---


    // ...

    // --- CLOUD AUTH FUNCTIONS (GOOGLE - NATIVE) ---
    // Using @react-native-google-signin/google-signin for Development Build

    useEffect(() => {
        try {
            GoogleSignin.configure({
                webClientId: "761563254420-sr2dom03ru0f41euon8crqc4vffgbbs8.apps.googleusercontent.com",
            });
        } catch (e) {
            console.error("Google Signin Configure Error", e);
        }
    }, []);

    const promptGoogleLogin = async () => {
        console.log("Starting Native Google Auth...");
        try {
            await GoogleSignin.hasPlayServices();
            const userInfo = await GoogleSignin.signIn();
            console.log("Native Google Sign-In Success:", userInfo);

            // Retrieve the ID Token
            const idToken = userInfo.data?.idToken || userInfo.idToken;
            if (!idToken) {
                throw new Error("No ID Token found in response");
            }

            const credential = GoogleAuthProvider.credential(idToken);
            await signInWithCredential(auth, credential);
        } catch (error) {
            console.error("Google Sign-In Error", error);
            if (error.code === statusCodes.SIGN_IN_CANCELLED) {
                // User cancelled
                console.log("User cancelled login");
            } else if (error.code === statusCodes.IN_PROGRESS) {
                // Operation in progress
                Alert.alert("Info", "Connexion déjà en cours...");
            } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                Alert.alert("Erreur", "Google Play Services non disponible.");
            } else {
                Alert.alert("Erreur", "Échec de la connexion Google: " + error.message);
            }
        }
    };

    const cloudLogout = async () => {
        try {
            await signOut(auth);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
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
            resetAll,

            cloudUser,
            isCloudAuthenticated: !!cloudUser,
            isCloudVerified: cloudUser?.emailVerified,
            cloudLogout,
            promptGoogleLogin
        }}>
            {children}
        </AuthContext.Provider>
    );
};
