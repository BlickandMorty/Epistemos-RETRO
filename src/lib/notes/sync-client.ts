// Stub — vault sync via Tauri commands (Phase 2: vault sync)
// These functions wrap invoke() calls to the Rust backend.

import type { Vault } from './types';

export async function checkMigrationStatus(): Promise<boolean> {
  return false;
}

export async function loadVaultsFromDb(): Promise<Vault[]> {
  return [];
}

export async function loadVaultDataFromDb(_vaultId: string): Promise<{ pages: never[]; blocks: never[]; books: never[]; concepts: never[]; pageLinks: never[] }> {
  return { pages: [], blocks: [], books: [], concepts: [], pageLinks: [] };
}

export async function syncVaultToServer(_vaultId: string, ..._args: unknown[]): Promise<void> {
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
