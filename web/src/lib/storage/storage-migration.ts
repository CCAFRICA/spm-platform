/**
 * Storage Key Migration
 *
 * Migrates localStorage keys from legacy prefix to ViaLuce prefix.
 * localStorage removed -- all operations return zero/false (no-ops).
 */

// Legacy prefixes removed — all localStorage operations are no-ops

/**
 * Migrate all localStorage keys from legacy prefix to vialuce_ prefix.
 * This is idempotent -- safe to call multiple times.
 */
export function migrateStorageKeys(): { migrated: number; skipped: number } {
  // No-op: localStorage removed
  return { migrated: 0, skipped: 0 };
}

/**
 * Check if migration is needed (any old keys exist)
 */
export function needsMigration(): boolean {
  // No-op: localStorage removed
  return false;
}

/**
 * Get count of keys needing migration
 */
export function getMigrationCount(): number {
  // No-op: localStorage removed
  return 0;
}
