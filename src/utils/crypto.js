import CryptoJS from 'crypto-js';

export const hashPassword = (password) => {
    return CryptoJS.SHA256(password).toString();
};

export const encryptData = (data, key) => {
    try {
        const jsonString = JSON.stringify(data);
        // Use a deterministic IV based on the key to avoid native crypto
        const keyHash = CryptoJS.SHA256(key);
        const encrypted = CryptoJS.AES.encrypt(jsonString, key, {
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
        });
        return encrypted.toString();
    } catch (e) {
        console.error('Encryption failed', e);
        return null;
    }
};

export const decryptData = (ciphertext, key) => {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, key, {
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
        });
        const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedData) {
            return null;
        }
        return JSON.parse(decryptedData);
    } catch (e) {
        console.error('Decryption failed', e);
        return null;
    }
};

// Generate ID using timestamp and simple random (no crypto needed)
export const generateIdSync = () => {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 11);
    return timestamp + randomPart;
};
