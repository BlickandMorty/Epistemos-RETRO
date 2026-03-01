// ═══════════════════════════════════════════════════════════════════
// Branded Types — compile-time nominal typing for domain IDs
// ═══════════════════════════════════════════════════════════════════

declare const __brand: unique symbol;

/** Intersect a primitive with a phantom brand tag for nominal typing. */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Domain IDs ──

export type UserId = Brand<string, 'UserId'>;
export type ChatId = Brand<string, 'ChatId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type PageId = Brand<string, 'PageId'>;
export type BlockId = Brand<string, 'BlockId'>;
export type VaultId = Brand<string, 'VaultId'>;
export type ThreadId = Brand<string, 'ThreadId'>;
export type ConceptId = Brand<string, 'ConceptId'>;

// ── Factory functions (the only way to create branded values) ──

export function userId(raw: string): UserId { return raw as UserId; }
export function chatId(raw: string): ChatId { return raw as ChatId; }
export function messageId(raw: string): MessageId { return raw as MessageId; }
export function pageId(raw: string): PageId { return raw as PageId; }
export function blockId(raw: string): BlockId { return raw as BlockId; }
export function vaultId(raw: string): VaultId { return raw as VaultId; }
export function threadId(raw: string): ThreadId { return raw as ThreadId; }
export function conceptId(raw: string): ConceptId { return raw as ConceptId; }
