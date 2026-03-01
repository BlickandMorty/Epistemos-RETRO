// Stub — vault sync via Tauri commands (Phase 2: vault sync)
// These functions wrap invoke() calls to the Rust backend.

import type { Vault } from './types';

export async function checkMigrationStatus(): Promise<boolean> {
  return false;
}

export async function loadVaultsFromDb(): Promise<Vault[]> {
  return [];
}

export async function loadVaultDataFromDb(_vaultId: string): Promise<{ pages: unknown[]; blocks: unknown[]; books: unknown[]; concepts: unknown[]; pageLinks: unknown[] }> {
  return { pages: [], blocks: [], books: [], concepts: [], pageLinks: [] };
}

export async function syncVaultToServer(_vaultId: string): Promise<void> {
  // no-op until Phase 2
}

export async function migrateToSqlite(_payload?: unknown): Promise<{ ok: boolean; skipped: boolean }> {
  return { ok: true, skipped: true }; // no-op until Phase 2
}

export async function upsertVaultOnServer(_vault: Vault): Promise<void> {
  // no-op until Phase 2
}

export async function deleteVaultOnServer(_vaultId: string): Promise<void> {
  // no-op until Phase 2
}
