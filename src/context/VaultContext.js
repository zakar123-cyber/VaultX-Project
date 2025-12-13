import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { encryptData, decryptData, generateIdSync } from '../utils/crypto';

const VaultContext = createContext();

export const useVault = () => useContext(VaultContext);

export const VaultProvider = ({ children }) => {
    const { masterKey, isAuthenticated } = useAuth();
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isAuthenticated && masterKey) {
            loadVault();
        } else {
            setItems([]);
        }
    }, [isAuthenticated, masterKey]);

    const loadVault = async () => {
        setIsLoading(true);
        try {
            const encryptedData = await AsyncStorage.getItem('vaultx_data');
            if (encryptedData) {
                const decryptedItems = decryptData(encryptedData, masterKey);
                if (decryptedItems) {
                    setItems(decryptedItems);
                }
            }
        } catch (e) {
            console.error('Failed to load vault', e);
        } finally {
            setIsLoading(false);
        }
    };

    const saveVault = async (newItems) => {
        try {
            const encryptedData = encryptData(newItems, masterKey);
            if (encryptedData) {
                await AsyncStorage.setItem('vaultx_data', encryptedData);
                setItems(newItems);
                return true;
            }
            return false;
        } catch (e) {
            console.error('Failed to save vault', e);
            return false;
        }
    };

    const addItem = async (item) => {
        const newItem = { ...item, id: generateIdSync() };
        const newItems = [...items, newItem];
        return await saveVault(newItems);
    };

    const updateItem = async (id, updates) => {
        const newItems = items.map((item) => (item.id === id ? { ...item, ...updates } : item));
        return await saveVault(newItems);
    };

    const deleteItem = async (id) => {
        const newItems = items.filter((item) => item.id !== id);
        return await saveVault(newItems);
    };

    const importVault = async (jsonString) => {
        try {
            await AsyncStorage.setItem('vaultx_data', jsonString);
            await loadVault();
            return true;
        } catch (e) {
            console.error('Import failed', e);
            return false;
        }
    };

    const getExportData = async () => {
        return await AsyncStorage.getItem('vaultx_data');
    };

    return (
        <VaultContext.Provider
            value={{
                items,
                isLoading,
                addItem,
                updateItem,
                deleteItem,
                importVault,
                getExportData,
            }}
        >
            {children}
        </VaultContext.Provider>
    );
};
