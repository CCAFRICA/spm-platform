/**
 * Storage Key Migration
 *
 * Migrates localStorage keys from old clearcomp_ prefix to new vialuce_ prefix.
 * This ensures backward compatibility with existing data after the rebrand.
 */

const OLD_PREFIX = 'clearcomp_';
const NEW_PREFIX = 'vialuce_';

/**
 * Migrate all localStorage keys from clearcomp_ to vialuce_ prefix.
 * This is idempotent - safe to call multiple times.
 */
export function migrateStorageKeys(): { migrated: number; skipped: number } {
  if (typeof window === 'undefined') {
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  let skipped = 0;

  // Get all keys that start with the old prefix
  const keysToMigrate: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(OLD_PREFIX)) {
      keysToMigrate.push(key);
    }
  }

  // Migrate each key
  for (const oldKey of keysToMigrate) {
    const newKey = oldKey.replace(OLD_PREFIX, NEW_PREFIX);

    // Only migrate if new key doesn't already exist
    if (localStorage.getItem(newKey) === null) {
      const value = localStorage.getItem(oldKey);
      if (value !== null) {
        localStorage.setItem(newKey, value);
        localStorage.removeItem(oldKey);
        migrated++;
      }
    } else {
      // New key exists, remove old key
      localStorage.removeItem(oldKey);
      skipped++;
    }
  }

  if (migrated > 0 || skipped > 0) {
    console.log(`[StorageMigration] Migrated ${migrated} keys, skipped ${skipped} (already existed)`);
  }

  return { migrated, skipped };
}

/**
 * Check if migration is needed (any old keys exist)
 */
export function needsMigration(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(OLD_PREFIX)) {
      return true;
    }
  }
  return false;
}

/**
 * Get count of keys needing migration
 */
export function getMigrationCount(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(OLD_PREFIX)) {
      count++;
    }
  }
  return count;
}
