/**
 * Typed stubs for Tauri invoke() commands.
 *
 * This file is a SCAFFOLD — it will be overwritten by tauri-specta
 * when `cargo tauri dev` runs. The stubs here allow the frontend
 * to compile and provide autocomplete before the codegen runs.
 *
 * All parameter names match the Rust snake_case originals — Tauri's
 * invoke() uses the Rust parameter names as JSON keys.
 */

import { invoke } from '@tauri-apps/api/core';

// ═══════════════════════════════════════════════════════════════════
// Placeholder types — replaced by tauri-specta codegen
// ═══════════════════════════════════════════════════════════════════

export interface Page {
  id: string;
  title: string;
  summary: string;
  tags_json: string;
  file_path: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  word_count: number;
  research_stage: string | null;
  emoji: string | null;
  created_at: string;
  updated_at: string;
  parent_page_id: string | null;
  folder_id: string | null;
}

export interface Block {
  id: string;
  page_id: string;
  parent_block_id: string | null;
  content: string;
  depth: number;
  order: number;
  created_at: string;
}

export interface Chat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  node_type: string;
  label: string;
  source_id: string | null;
  weight: number;
  metadata_json: string | null;
  is_manual: boolean;
}

export interface GraphEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  weight: number;
  is_manual: boolean;
}

export interface GraphSearchHit {
  node_id: string;
  label: string;
  score: number;
}

export interface NodeDetails {
  node: GraphNode;
  neighbors: GraphNode[];
  edges: GraphEdge[];
}

export interface SemanticHit {
  node_index: number;
  similarity: number;
}

export interface SearchResult {
  page_id: string;
  title: string;
  snippet: string;
  score: number;
}

export interface HybridSearchResult {
  page_id: string;
  title: string;
  snippet: string;
  fts_score: number;
  semantic_score: number;
  combined_score: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface InferenceConfig {
  mode: string;
  provider: string;
  api_key: string;
  model: string;
  ollama_base_url: string;
  ollama_model: string;
}

export interface LocalModelConfig {
  foundry_port: number | null;
  ollama_base_url: string;
  preferred_model: string;
}

export interface CostSummary {
  today_usd: number;
  total_usd: number;
  daily_budget_usd: number | null;
  queries_today: number;
}

export interface LocalServiceStatus {
  name: string;
  available: boolean;
  url: string;
  model: string | null;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
}

export interface FpsInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  mouse_dx: number;
  mouse_dy: number;
}

export interface ResearchStatus {
  page_id: string;
  stage: number;
  stage_name: string;
  is_complete: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Commands — grouped by module
// ═══════════════════════════════════════════════════════════════════

export const commands = {
  // ── Notes ──
  createPage: (title: string) =>
    invoke<Page>('create_page', { title }),
  getPage: (page_id: string) =>
    invoke<Page>('get_page', { page_id }),
  listPages: () =>
    invoke<Page[]>('list_pages'),
  updatePage: (page: Page) =>
    invoke<void>('update_page', { page }),
  deletePage: (page_id: string) =>
    invoke<void>('delete_page', { page_id }),
  loadBody: (page_id: string) =>
    invoke<string>('load_body', { page_id }),
  saveBody: (page_id: string, content: string) =>
    invoke<void>('save_body', { page_id, content }),
  getBlocks: (page_id: string) =>
    invoke<Block[]>('get_blocks', { page_id }),
  generateNoteAi: (page_id: string, prompt: string) =>
    invoke<void>('generate_note_ai', { page_id, prompt }),

  // ── Chat ──
  createChat: (title?: string) =>
    invoke<Chat>('create_chat', { title: title ?? null }),
  listChats: () =>
    invoke<Chat[]>('list_chats'),
  getMessages: (chat_id: string) =>
    invoke<Message[]>('get_messages', { chat_id }),
  deleteChat: (chat_id: string) =>
    invoke<void>('delete_chat', { chat_id }),
  submitQuery: (chat_id: string, query: string) =>
    invoke<void>('submit_query', { chat_id, query }),
  runSoarStone: (chat_id: string, stone_prompt: string) =>
    invoke<void>('run_soar_stone', { chat_id, stone_prompt }),
  cancelQuery: () =>
    invoke<void>('cancel_query'),

  // ── Graph ──
  getGraph: () =>
    invoke<GraphData>('get_graph'),
  rebuildGraph: () =>
    invoke<GraphData>('rebuild_graph'),
  searchGraph: (query: string) =>
    invoke<GraphSearchHit[]>('search_graph', { query }),
  extractEntities: (force?: boolean) =>
    invoke<void>('extract_entities', { force: force ?? null }),
  getNodeDetails: (node_id: string) =>
    invoke<NodeDetails>('get_node_details', { node_id }),
  summarizeNode: (node_id: string) =>
    invoke<void>('summarize_node', { node_id }),
  setNodeEmbedding: (node_index: number, vector: number[]) =>
    invoke<void>('set_node_embedding', { node_index, vector }),
  semanticNeighbors: (node_index: number, k: number, threshold: number) =>
    invoke<SemanticHit[]>('semantic_neighbors', { node_index, k, threshold }),
  semanticSimilarity: (node_a: number, node_b: number) =>
    invoke<number>('semantic_similarity', { node_a, node_b }),

  // ── Folders ──
  createFolder: (name: string) =>
    invoke<Folder>('create_folder', { name }),
  getFolder: (folder_id: string) =>
    invoke<Folder>('get_folder', { folder_id }),
  listFolders: () =>
    invoke<Folder[]>('list_folders'),
  updateFolder: (folder: Folder) =>
    invoke<void>('update_folder', { folder }),
  deleteFolder: (folder_id: string) =>
    invoke<void>('delete_folder', { folder_id }),

  // ── Search ──
  searchPages: (query: string, limit?: number) =>
    invoke<SearchResult[]>('search_pages', { query, limit: limit ?? null }),
  rebuildSearchIndex: () =>
    invoke<number>('rebuild_search_index'),
  searchHybrid: (query: string, limit?: number) =>
    invoke<HybridSearchResult[]>('search_hybrid', { query, limit: limit ?? null }),

  // ── Vault ──
  getVaultPath: () =>
    invoke<string | null>('get_vault_path'),
  setVaultPath: (path: string) =>
    invoke<void>('set_vault_path', { path }),
  importVault: () =>
    invoke<ImportResult>('import_vault'),
  exportPage: (page_id: string) =>
    invoke<string>('export_page', { page_id }),
  exportAll: () =>
    invoke<number>('export_all'),
  startVaultWatcher: () =>
    invoke<void>('start_vault_watcher'),
  stopVaultWatcher: () =>
    invoke<void>('stop_vault_watcher'),
  isVaultWatching: () =>
    invoke<boolean>('is_vault_watching'),

  // ── System ──
  getInferenceConfig: () =>
    invoke<InferenceConfig>('get_inference_config'),
  setInferenceConfig: (config: InferenceConfig) =>
    invoke<void>('set_inference_config', { config }),
  testConnection: (provider: string, api_key: string, model: string) =>
    invoke<ConnectionTestResult>('test_connection', { provider, api_key, model }),
  getAppInfo: () =>
    invoke<Record<string, unknown>>('get_app_info'),
  checkLocalServices: () =>
    invoke<LocalServiceStatus[]>('check_local_services'),
  getLocalModelConfig: () =>
    invoke<LocalModelConfig>('get_local_model_config'),
  setLocalModelConfig: (config: LocalModelConfig) =>
    invoke<void>('set_local_model_config', { config }),
  getCostSummary: () =>
    invoke<CostSummary>('get_cost_summary'),
  setDailyBudget: (budget_usd: number) =>
    invoke<void>('set_daily_budget', { budget_usd }),
  resetCostTracker: () =>
    invoke<void>('reset_cost_tracker'),

  // ── Physics ──
  startPhysics: () =>
    invoke<void>('start_physics'),
  stopPhysics: () =>
    invoke<void>('stop_physics'),
  pinNode: (node_id: string) =>
    invoke<void>('pin_node', { node_id }),
  unpinNode: (node_id: string) =>
    invoke<void>('unpin_node', { node_id }),
  moveNode: (node_id: string, x: number, y: number, z: number) =>
    invoke<void>('move_node', { node_id, x, y, z }),
  isPhysicsRunning: () =>
    invoke<boolean>('is_physics_running'),
  toggleFpsMode: () =>
    invoke<string>('toggle_fps_mode'),
  fpsInput: (input: FpsInput) =>
    invoke<void>('fps_input', { input }),
  getPhysicsMode: () =>
    invoke<string>('get_physics_mode'),

  // ── Research ──
  startResearch: (page_id: string, topic?: string) =>
    invoke<ResearchStatus>('start_research', { page_id, topic: topic ?? null }),
  advanceResearch: (page_id: string) =>
    invoke<ResearchStatus>('advance_research', { page_id }),
  getResearchStatus: (page_id: string) =>
    invoke<ResearchStatus>('get_research_status', { page_id }),
} as const;
