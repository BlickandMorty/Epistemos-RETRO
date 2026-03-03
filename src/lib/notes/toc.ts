// ═══════════════════════════════════════════════════════════════════
// Table of Contents — Parse headings from blocks, build hierarchy
// Ported from macOS NoteTableOfContents.swift
// ═══════════════════════════════════════════════════════════════════

import type { NoteBlock } from './types';

// ── TOC Types ──

export interface TOCItem {
  id: string;           // block id (unique identifier)
  level: number;        // 1-6 for H1-H6
  text: string;         // heading text (clean, no markdown)
  children: TOCItem[];  // nested subheadings
}

export type TOCKind = 'heading' | 'citation' | 'source';

export interface TOCEntry {
  id: string;
  level: number;
  text: string;
  kind: TOCKind;
  blockId: string;
}

// ── TOC Parser ──

/**
 * Extract headings from blocks (H1-H6)
 * Also extracts citations (blockquote) and sources (links) if includeExtras is true
 */
export function parseTOCFromBlocks(
  blocks: NoteBlock[],
  includeExtras: boolean = false
): TOCEntry[] {
  const items: TOCEntry[] = [];
  const seenTexts = new Map<string, number>(); // track duplicates

  for (const block of blocks) {
    // Headings: type === 'heading' with level property
    if (block.type === 'heading') {
      const level = parseInt(block.properties.level || '1', 10);
      const text = cleanHeadingText(block.content);
      
      if (text) {
        const uniqueText = makeUniqueText(text, seenTexts);
        items.push({
          id: block.id,
          level: Math.min(Math.max(level, 1), 6),
          text: uniqueText,
          kind: 'heading',
          blockId: block.id,
        });
      }
      continue;
    }

    if (includeExtras) {
      // Citations: blockquotes (type === 'quote')
      if (block.type === 'quote') {
        const text = cleanHeadingText(block.content);
        if (text && text.length > 10) {
          const preview = text.slice(0, 50) + (text.length > 50 ? '…' : '');
          items.push({
            id: block.id,
            level: 6,
            text: preview,
            kind: 'citation',
            blockId: block.id,
          });
        }
        continue;
      }

      // Sources: markdown links in content
      const links = extractLinks(block.content);
      for (const linkText of links) {
        items.push({
          id: `${block.id}-link-${items.length}`,
          level: 6,
          text: linkText,
          kind: 'source',
          blockId: block.id,
        });
      }
    }
  }

  return items;
}

/**
 * Parse headings from markdown text (alternative for vault import previews)
 */
export function parseTOCFromMarkdown(markdown: string): TOCEntry[] {
  const items: TOCEntry[] = [];
  const seenTexts = new Map<string, number>();
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const level = headingLevel(trimmed);

    if (level && level <= 6) {
      const text = cleanHeadingText(trimmed.slice(level + 1));
      if (text) {
        const uniqueText = makeUniqueText(text, seenTexts);
        items.push({
          id: `heading-${i}`,
          level,
          text: uniqueText,
          kind: 'heading',
          blockId: `line-${i}`,
        });
      }
    }
  }

  return items;
}

/**
 * Build hierarchical tree from flat TOC entries
 */
export function buildTOCTree(entries: TOCEntry[]): TOCItem[] {
  const root: TOCItem[] = [];
  const stack: TOCItem[] = [];

  for (const entry of entries) {
    const item: TOCItem = {
      id: entry.blockId,
      level: entry.level,
      text: entry.text,
      children: [],
    };

    // Pop items from stack that are at same or deeper level
    while (stack.length > 0 && stack[stack.length - 1]!.level >= entry.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // Top-level item
      root.push(item);
    } else {
      // Child of the last item on stack
      stack[stack.length - 1]!.children.push(item);
    }

    stack.push(item);
  }

  return root;
}

/**
 * Get flat list of TOC items (for scroll spy)
 */
export function getFlatTOCItems(tree: TOCItem[]): TOCItem[] {
  const flat: TOCItem[] = [];
  
  function traverse(items: TOCItem[]) {
    for (const item of items) {
      flat.push(item);
      if (item.children.length > 0) {
        traverse(item.children);
      }
    }
  }
  
  traverse(tree);
  return flat;
}

// ── Helpers ──

function headingLevel(line: string): number | null {
  let count = 0;
  for (const ch of line) {
    if (ch === '#') count++;
    else if (ch === ' ' && count > 0) return count;
    else return null;
  }
  return null;
}

function cleanHeadingText(content: string): string {
  if (!content) return '';
  
  // Strip HTML tags
  let text = content.replace(/<[^>]*>/g, '');
  
  // Strip markdown formatting
  text = text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // bold
    .replace(/\*(.+?)\*/g, '$1')      // italic
    .replace(/`(.+?)`/g, '$1')        // inline code
    .replace(/\[(.+?)\]\([^)]+\)/g, '$1')  // links
    .replace(/^#+\s*/, '')            // heading markers at start
    .trim();
  
  return text;
}

function extractLinks(content: string): string[] {
  const results: string[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  
  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) {
      results.push(match[1]);
    }
  }
  
  return results;
}

function makeUniqueText(text: string, seen: Map<string, number>): string {
  const count = seen.get(text) || 0;
  seen.set(text, count + 1);
  
  if (count === 0) {
    return text;
  }
  
  return `${text} (${count + 1})`;
}

// ── Scroll Helpers ──

/**
 * Scroll to a block by ID
 */
export function scrollToBlock(blockId: string, behavior: ScrollBehavior = 'smooth'): void {
  const element = document.querySelector(`[data-block-id="${blockId}"]`);
  if (element) {
    element.scrollIntoView({ behavior, block: 'start' });
  }
}

/**
 * Find which heading is currently in view
 * Returns the ID of the closest heading above the viewport center
 */
export function findActiveHeading(
  headingIds: string[],
  container: HTMLElement | null = null
): string | null {
  if (headingIds.length === 0) return null;
  
  const scrollContainer = container || document.documentElement;
  const containerRect = scrollContainer.getBoundingClientRect();
  const viewportCenter = containerRect.top + containerRect.height / 3;
  
  let activeId: string | null = null;
  
  for (const id of headingIds) {
    const element = document.querySelector(`[data-block-id="${id}"]`);
    if (!element) continue;
    
    const rect = element.getBoundingClientRect();
    // Element is above the viewport center
    if (rect.top <= viewportCenter) {
      activeId = id;
    } else {
      // We've passed the viewport center
      break;
    }
  }
  
  return activeId;
}

/**
 * Debounced TOC update helper
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}
