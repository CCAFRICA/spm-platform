/**
 * Storage Service Abstraction Layer
 *
 * All localStorage access should go through these services.
 * This enables future migration to Supabase or other backends.
 */

export * from './storage-migration';
export * from './tenant-registry-service';
