/**
 * Nest DI token for the chosen StorageDriver. The factory in media.module.ts
 * picks the concrete driver based on `env.STORAGE_DRIVER`.
 */
export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");
