# VaultX - Secure Password Manager

A secure, offline-first password manager for Android built with React Native and Expo.

## Features
- 🔐 **AES-256 Encryption** - Military-grade encryption for all stored secrets
- 🔑 **PBKDF2 Key Derivation** - 10,000 iterations for secure master password hashing
- 📱 **Biometric Unlock** - FaceID/Fingerprint support
- ☁️ **Cloud Backup** - Encrypted backups to Firebase (optional)
- 📷 **QR Code Transfer** - Securely transfer vaults between devices
- 🌐 **Offline-First** - Works without internet, data stored locally in SQLite

## Setup

### Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Android device with Expo Dev Client OR Android Emulator

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/vaultx.git
   cd vaultx
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase (Required for Cloud Backup)**
   
   Copy the template files and fill in your Firebase credentials:
   ```bash
   cp google-services.template.json google-services.json
   cp src/services/firebaseConfig.template.js src/services/firebaseConfig.js
   ```
   
   Get your credentials from [Firebase Console](https://console.firebase.google.com/).

4. **Build Development APK**
   ```bash
   npx eas build --profile development --platform android
   ```

5. **Run the app**
   ```bash
   npx expo start --dev-client
   ```

## Security

### Encryption Details
- **Algorithm**: AES-256-CBC
- **Key Derivation**: PBKDF2 with 10,000 iterations
- **Salt**: 128-bit random salt per user (stored locally)
- **IV**: Random 128-bit IV per encryption operation

### Data Storage
- All secrets are encrypted before storage
- Master password is NEVER stored - only a verifier hash
- SQLite database stored in app's private directory
- Cloud backups are encrypted with user's salt before upload

### Files NOT Included (Security)
The following files contain sensitive credentials and are NOT included in this repository:
- `google-services.json` - Firebase Android configuration
- `src/services/firebaseConfig.js` - Firebase JS SDK configuration

## Production Build

```bash
npx eas build --profile production --platform android
```

## License
MIT
