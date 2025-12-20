import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

// Configuration for PBKDF2
const PBKDF2_ITERATIONS = 10000;
const KEY_SIZE = 256 / 32; // 256-bit key

/**
 * Generates a random salt using expo-crypto.
 * @returns {Promise<string>} Hex string of the salt.
 */
export const generateSalt = async () => {
    const randomBytes = await Crypto.getRandomBytesAsync(16); // 128 bits
    // Convert Uint8Array to hex string
    return Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

/**
 * Derives a key from the password and salt using PBKDF2.
 * @param {string} password 
 * @param {string} salt 
 * @returns {string} Hex string of the derived key.
 */
export const deriveKey = (password, salt) => {
    return CryptoJS.PBKDF2(password, salt, {
        keySize: KEY_SIZE,
        iterations: PBKDF2_ITERATIONS,
    }).toString();
};

/**
 * Encrypts data using AES.
 * @param {string} text - The plaintext to encrypt.
 * @param {string} key - The derived key (hex string).
 * @returns {Promise<string>} JSON string containing { ciphertext, iv }.
 */
export const encrypt = async (text, key) => {
    try {
        // Generate a random IV using expo-crypto
        const ivBytes = await Crypto.getRandomBytesAsync(16); // 128 bits
        const ivHex = Array.from(ivBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const iv = CryptoJS.enc.Hex.parse(ivHex);

        // Encrypt
        const encrypted = CryptoJS.AES.encrypt(text, CryptoJS.enc.Hex.parse(key), {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        const result = JSON.stringify({
            ciphertext: encrypted.toString(),
            iv: ivHex
        });
        return result;
    } catch (e) {
        console.error("Encrypt failed internally:", e);
        throw e;
    }
};

export const decrypt = (encryptedData, key) => {
    try {
        if (typeof encryptedData !== 'string') {
            console.error("Decrypt expected string, got:", typeof encryptedData, encryptedData);
            return null;
        }

        // DEBUG: Check for malformed input
        if (encryptedData === '[object Object]') {
            console.error("Decrypt received '[object Object]'. Identifying source...");
            return null;
        }

        const { ciphertext, iv } = JSON.parse(encryptedData);

        const decrypted = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Hex.parse(key), {
            iv: CryptoJS.enc.Hex.parse(iv),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error("Decryption failed. Input was:", encryptedData ? encryptedData.substring(0, 50) : "null", "Error:", e);
        return null; // Or throw error
    }
};
