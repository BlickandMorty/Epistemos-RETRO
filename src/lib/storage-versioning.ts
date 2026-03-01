// ═══════════════════════════════════════════════════════════════════
// Storage Versioning — Safe localStorage wrapper with schema versions
// ═══════════════════════════════════════════════════════════════════
//
// All localStorage reads/writes should go through this module.
// - Structured data uses readVersioned/writeVersioned (version envelope)
// - Simple string flags use readString/writeString (no envelope needed)
// - Corrupted or missing data never crashes — returns null/fallback
// - Old unversioned data is treated as version 0 and auto-migrated
// ═══════════════════════════════════════════════════════════════════

/** Envelope stored in localStorage for versioned data */
export interface VersionedData<T> {
  __v: number;
  data: T;
}

/**
 * Read versioned JSON data from localStorage.
 *
 * - Returns `null` if key is missing or data is corrupt
 * - If data exists without a version envelope (legacy), treats it as version 0
 * - If stored version < currentVersion and a `migrate` function is provided,
 *   calls migrate(oldVersion, rawData) to transform it
 * - Never throws — all errors are caught and return null
 */
export function readVersioned<T>(
  key: string,
  currentVersion: number,
  migrate?: (oldVersion: number, raw: unknown) => T | null,
): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;

    const parsed = JSON.parse(raw);

    // Check if this is a versioned envelope
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      '__v' in parsed &&
      typeof parsed.__v === 'number'
    ) {
      const envelope = parsed as VersionedData<unknown>;

      if (envelope.__v === currentVersion) {
        return envelope.data as T;
      }

      // Version mismatch — try migration
      if (migrate) {
        const migrated = migrate(envelope.__v, envelope.data);
        if (migrated !== null) {
          // Write back the migrated data at the current version
          writeVersioned(key, currentVersion, migrated);
        }
        return migrated;
      }

      // No migration function — still return data if version is older
      // (forward-compatible: newer versions may have added fields)
      if (envelope.__v <= currentVersion) {
        return envelope.data as T;
      }

      // Data is from a newer version we don't understand — return as-is
      // (best effort: don't lose data)
      return envelope.data as T;
    }

    // Unversioned (legacy) data — treat as version 0
    if (migrate) {
      const migrated = migrate(0, parsed);
      if (migrated !== null) {
        writeVersioned(key, currentVersion, migrated);
      }
      return migrated;
    }

    // No migration needed — return raw parsed data as-is
    // (backward compatible: treat legacy data as valid)
    writeVersioned(key, currentVersion, parsed as T);
    return parsed as T;
  } catch {
    // JSON parse error or any other issue — data is corrupt
    return null;
  }
}

/**
 * Write versioned JSON data to localStorage.
 * Wraps the data in a version envelope: { __v: number, data: T }
 * Silently fails on quota errors or unavailable storage.
 */
export function writeVersioned<T>(
  key: string,
  version: number,
  data: T,
): void {
  if (typeof window === 'undefined') return;
  try {
    const envelope: VersionedData<T> = { __v: version, data };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable — fail silently
  }
}

/**
 * Read a simple string value from localStorage.
 * Returns null if the key doesn't exist or on any error.
 * Never throws.
 */
export function readString(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a simple string value to localStorage.
 * Silently fails on quota errors or unavailable storage.
 */
export function writeString(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Remove a key from localStorage.
 * Silently fails on errors.
 */
export function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable
  }
}
