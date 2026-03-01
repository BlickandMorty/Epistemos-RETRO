// Stub — vault sync via Tauri commands (Phase 2: vault sync)
// These functions wrap invoke() calls to the Rust backend.

import type { Vault } from './types';

export async function checkMigrationStatus(): Promise<boolean> {
  return false;
}

export async function loadVaultsFromDb(): Promise<Vault[]> {
  return [];
}

export async function loadVaultDataFromDb(_vaultId: string): Promise<{ pages: unknown[]; blocks: unknown[] }> {
  return { pages: [], blocks: [] };
}

export async function syncVaultToServer(_vaultId: string): Promise<void> {
  // no-op until Phase 2
}

export async function migrateToSqlite(): Promise<void> {
  // no-op until Phase 2
}

export async function upsertVaultOnServer(_vault: Vault): Promise<void> {
  // no-op until Phase 2
}

export async function deleteVaultOnServer(_vaultId: string): Promise<void> {
  // no-op until Phase 2
}
