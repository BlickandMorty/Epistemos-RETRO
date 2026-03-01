'use client';

import type {
  ResearchPaper,
  Citation,
  RerouteInstruction,
  ResearchBook,
} from '@/lib/research/types';
import { writeVersioned } from '@/lib/storage-versioning';
import type { PFCSet, PFCGet } from '../use-pfc-store';

const RESEARCH_PAPERS_VERSION = 1;

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface ResearchSliceState {
  researchPapers: ResearchPaper[];
  currentCitations: Citation[];
  pendingReroute: RerouteInstruction | null;
  researchBooks: ResearchBook[];
}

// ---------------------------------------------------------------------------
// Actions interface
// ---------------------------------------------------------------------------

export interface ResearchSliceActions {
  addResearchPaper: (paper: ResearchPaper) => void;
  removeResearchPaper: (id: string) => void;
  updateResearchPaper: (
    id: string,
    updates: Partial<ResearchPaper>,
  ) => void;
  setCurrentCitations: (citations: Citation[]) => void;
  setPendingReroute: (instruction: RerouteInstruction | null) => void;
  scanNotesForResearch: () => void;
}

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

export const createResearchSlice = (set: PFCSet, get: PFCGet) => ({
  // --- initial state ---
  researchPapers: [] as ResearchPaper[],
  currentCitations: [] as Citation[],
  pendingReroute: null as RerouteInstruction | null,
  researchBooks: [] as ResearchBook[],

  // --- actions ---

  addResearchPaper: (paper: ResearchPaper) =>
    set((s) => {
      const updated = [paper, ...s.researchPapers].slice(0, 500);
      if (typeof window !== 'undefined') {
        writeVersioned('pfc-research-papers', RESEARCH_PAPERS_VERSION, updated);
      }
      return { researchPapers: updated };
    }),

  removeResearchPaper: (id: string) =>
    set((s) => {
      const updated = s.researchPapers.filter(
        (p: ResearchPaper) => p.id !== id,
      );
      if (typeof window !== 'undefined') {
        writeVersioned('pfc-research-papers', RESEARCH_PAPERS_VERSION, updated);
      }
      return { researchPapers: updated };
    }),

  updateResearchPaper: (id: string, updates: Partial<ResearchPaper>) =>
    set((s) => {
      const updated = s.researchPapers.map((p: ResearchPaper) =>
        p.id === id ? { ...p, ...updates } : p,
      );
      if (typeof window !== 'undefined') {
        writeVersioned('pfc-research-papers', RESEARCH_PAPERS_VERSION, updated);
      }
      return { researchPapers: updated };
    }),

  setCurrentCitations: (citations: Citation[]) =>
    set({ currentCitations: citations }),

  setPendingReroute: (instruction: RerouteInstruction | null) =>
    set({ pendingReroute: instruction }),

  scanNotesForResearch: () => {
    const store = get();
    const notePages = store.notePages ?? [];
    const noteBlocks = store.noteBlocks ?? [];
    if (noteBlocks.length === 0) return;

    const existingTitles = new Set(
      store.researchPapers.map((p: ResearchPaper) => p.title.toLowerCase()),
    );
    const papers: ResearchPaper[] = [];
    const citations: Citation[] = [];

    for (const page of notePages) {
      const blocks = noteBlocks.filter(
        (b: { pageId: string }) => b.pageId === page.id,
      );
      if (blocks.length === 0) continue;

      const text = blocks
        .map((b: { content: string }) => b.content.replace(/<[^>]*>/g, ''))
        .join(' ');
      if (text.length < 10) continue;

      const tags = extractNoteTopicTags(text);
      const sourceNote = page.title || 'Untitled note';

      // Pattern 1: "Author et al. (YYYY)"
      const etAlRe = /([A-Z][a-z]+(?:\s(?:van|de|von|el|al|bin))?)(?:\s+(?:et\s+al\.?|and\s+colleagues|&\s+[A-Z][a-z]+))[\s,]*\(?(\d{4})\)?/g;
      let m;
      while ((m = etAlRe.exec(text)) !== null) {
        const author = m[1]!.trim();
        const year = parseInt(m[2]!, 10);
        if (year < 1900 || year > 2030) continue;
        const title = `${author} et al. (${year})`;
        if (existingTitles.has(title.toLowerCase())) continue;
        existingTitles.add(title.toLowerCase());
        papers.push({
          id: `note-${Date.now()}-${papers.length}`,
          title, authors: [author], year, tags,
          savedAt: Date.now(), notes: `Found in: ${sourceNote}`,
        });
      }

      // Pattern 2: "Author & Author (YYYY)"
      const dualRe = /([A-Z][a-z]+)\s+(?:&|and)\s+([A-Z][a-z]+)\s*\((\d{4})\)/g;
      while ((m = dualRe.exec(text)) !== null) {
        const a1 = m[1]!.trim();
        const a2 = m[2]!.trim();
        const year = parseInt(m[3]!, 10);
        if (year < 1900 || year > 2030) continue;
        const title = `${a1} & ${a2} (${year})`;
        if (existingTitles.has(title.toLowerCase())) continue;
        existingTitles.add(title.toLowerCase());
        papers.push({
          id: `note-${Date.now()}-${papers.length}`,
          title, authors: [a1, a2], year, tags,
          savedAt: Date.now(), notes: `Found in: ${sourceNote}`,
        });
      }

      // Pattern 3: DOIs
      const doiRe = /\b(10\.\d{4,}\/[^\s,;)]+)/g;
      while ((m = doiRe.exec(text)) !== null) {
        const doi = m[1]!.replace(/[.)]+$/, '');
        if (citations.some((c) => c.doi === doi)) continue;
        const start = Math.max(0, m.index - 120);
        const end = Math.min(text.length, m.index + m[0].length + 40);
        const context = text.slice(start, end).replace(/\n/g, ' ').trim();
        citations.push({
          id: `cite-note-${Date.now()}-${citations.length}`,
          text: context, source: `DOI: ${doi} (from: ${sourceNote})`, doi,
          url: `https://doi.org/${doi}`, confidence: 0.8,
        });
      }

      // Pattern 4: Inline "(Author, YYYY)"
      const inlineRe = /\(([A-Z][a-z]+(?:\s(?:van|de|von|el|al|bin))?),\s*(\d{4})\)/g;
      while ((m = inlineRe.exec(text)) !== null) {
        const author = m[1]!.trim();
        const year = parseInt(m[2]!, 10);
        if (year < 1900 || year > 2030) continue;
        const title = `${author} (${year})`;
        if (existingTitles.has(title.toLowerCase())) continue;
        existingTitles.add(title.toLowerCase());
        papers.push({
          id: `note-${Date.now()}-${papers.length}`,
          title, authors: [author], year, tags,
          savedAt: Date.now(), notes: `Found in: ${sourceNote}`,
        });
      }
    }

    // Batch-add papers
    if (papers.length > 0) {
      set((s) => {
        const updated = [...papers, ...s.researchPapers].slice(0, 500);
        if (typeof window !== 'undefined') {
          writeVersioned('pfc-research-papers', RESEARCH_PAPERS_VERSION, updated);
        }
        return { researchPapers: updated };
      });
    }

    // Merge citations
    if (citations.length > 0) {
      set((s) => {
        const merged = [...s.currentCitations, ...citations];
        return { currentCitations: merged };
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractNoteTopicTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();
  const domains: [string, string[]][] = [
    ['neuroscience', ['brain', 'neural', 'neuron', 'cortex', 'cognitive', 'fmri', 'eeg']],
    ['psychology', ['psychological', 'behavior', 'cognition', 'perception', 'emotion']],
    ['medicine', ['clinical', 'patient', 'treatment', 'therapy', 'diagnosis', 'medical']],
    ['statistics', ['meta-analysis', 'effect size', 'p-value', 'regression', 'bayesian']],
    ['biology', ['gene', 'protein', 'cell', 'organism', 'evolution', 'biological']],
    ['AI/ML', ['machine learning', 'deep learning', 'transformer', 'neural network', 'llm']],
    ['physics', ['quantum', 'relativity', 'particle', 'entropy', 'thermodynamic']],
    ['economics', ['economic', 'market', 'fiscal', 'monetary', 'gdp', 'inflation']],
    ['sociology', ['social', 'society', 'demographic', 'inequality', 'cultural']],
    ['philosophy', ['epistemolog', 'ontolog', 'phenomenolog', 'ethics', 'philosophical']],
  ];
  for (const [tag, keywords] of domains) {
    if (keywords.some((k) => lower.includes(k))) {
      tags.push(tag);
      if (tags.length >= 3) break;
    }
  }
  return tags.length > 0 ? tags : ['research'];
}
