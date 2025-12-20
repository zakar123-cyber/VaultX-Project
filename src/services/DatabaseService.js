import * as SQLite from 'expo-sqlite';

let db = null;

export const initDatabase = async () => {
    if (db) {
        // Database already initialized, skip re-opening
        return;
    }
    try {
        // Use synchronous open for v16+
        db = SQLite.openDatabaseSync('vault.db');

        // Use synchronous execution to create table
        db.execSync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS secrets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                title TEXT NOT NULL,
                data TEXT NOT NULL, 
                created_at INTEGER DEFAULT (unixepoch())
            );
        `);

        // MIGRATION: Attempt to add 'username' column if it doesn't exist
        // This is needed if the app was installed before multi-user support
        try {
            const columns = db.getAllSync("PRAGMA table_info(secrets)");
            const hasUsername = columns.some(c => c.name === 'username');

            if (!hasUsername) {
                db.execSync('ALTER TABLE secrets ADD COLUMN username TEXT DEFAULT "default_user" NOT NULL');
                console.log('Migrated: Added username column');
            }
        } catch (e) {
            console.log('Migration check failed (non-fatal):', e.message);
        }

        console.log('Database initialized (Sync)');
    } catch (error) {
        console.error('Database init error', error);
        // Ensure db is null if init failed
        db = null;
        throw error;
    }
};

export const getDatabase = () => db;

export const addSecret = async (username, encryptedDataBlob) => {
    if (!db) await initDatabase();
    if (!username) throw new Error("Username required for addSecret");
    // Use runSync
    const result = db.runSync(
        'INSERT INTO secrets (username, title, data) VALUES (?, ?, ?)',
        [username, 'Encrypted Item', encryptedDataBlob]
    );
    return result.lastInsertRowId;
};

export const getSecrets = async (username) => {
    if (!db) await initDatabase();
    if (!username) {
        console.warn("getSecrets called without username");
        return [];
    }
    // Use getAllSync
    const allRows = db.getAllSync('SELECT * FROM secrets WHERE username = ?', [username]);
    return allRows;
};

export const updateSecret = async (id, username, encryptedDataBlob) => {
    if (!db) await initDatabase();
    if (!username) throw new Error("Username required for updateSecret");
    return db.runSync('UPDATE secrets SET data = ? WHERE id = ? AND username = ?', [encryptedDataBlob, id, username]);
};

export const deleteSecret = async (id, username) => {
    if (!db) await initDatabase();
    if (!username) throw new Error("Username required for deleteSecret");
    return db.runSync('DELETE FROM secrets WHERE id = ? AND username = ?', [id, username]);
};

// For Backup: Dump only CURRENT user data
export const getAllDataForBackup = async (username) => {
    if (!db) await initDatabase();
    if (!username) throw new Error("Username required for backup");
    return db.getAllSync('SELECT * FROM secrets WHERE username = ?', [username]);
};

// For Restore: Replace only CURRENT user data
export const restoreFromBackup = async (username, rows) => {
    if (!db) await initDatabase();
    db.withTransactionSync(() => {
        // Delete only this user's data
        db.runSync('DELETE FROM secrets WHERE username = ?', [username]);

        for (const row of rows) {
            // Restore with the username
            if (row.data) {
                db.runSync('INSERT INTO secrets (username, title, data) VALUES (?, ?, ?)', [username, 'Restored', row.data]);
            }
        }
    });
};

export const resetDatabase = async () => {
    if (!db) await initDatabase();
    db.runSync('DELETE FROM secrets');
};
