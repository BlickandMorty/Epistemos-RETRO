// ═══════════════════════════════════════════════════════════════════
// ██ NOTE INTENT DETECTION — Parse user queries for note actions
// ═══════════════════════════════════════════════════════════════════
//
// Detects when the user wants the AI to interact with their notes.
// E.g. "summarize my notes about X", "write this to my notes",
// "add a note about what we just discussed", etc.
//
// Returns an intent object describing what action to take with the
// AI's response in relation to the notes system.
// ═══════════════════════════════════════════════════════════════════

export type NoteAction =
  | 'summarize_notes'     // Summarize existing notes → insert as new block
  | 'write_to_notes'      // Write the AI response to notes
  | 'create_note_page'    // Create a new note page with AI content
  | 'expand_note'         // Expand on existing note content
  | null;                 // No note intent detected

export interface NoteIntent {
  action: NoteAction;
  /** Optional topic/keyword the user specified (e.g., "summarize my notes about dogs") */
  topic: string | null;
  /** Original query text */
  query: string;
  /** Confidence that this is a note-related intent (0–1) */
  confidence: number;
}

// ── Pattern groups for intent detection ────────────────────────

const SUMMARIZE_PATTERNS = [
  /summarize?\s+(?:my\s+)?notes?/i,
  /(?:give|create|make|write)\s+(?:me\s+)?(?:a\s+)?summary\s+(?:of\s+)?(?:my\s+)?notes?/i,
  /condense\s+(?:my\s+)?notes?/i,
  /tldr\s+(?:of\s+)?(?:my\s+)?notes?/i,
  /overview\s+(?:of\s+)?(?:my\s+)?notes?/i,
  /recap\s+(?:of\s+)?(?:my\s+)?notes?/i,
  /summarize\s+(?:what|everything)\s+(?:i['']ve\s+)?(?:written|noted)/i,
];

const WRITE_TO_NOTE_PATTERNS = [
  /(?:write|save|put|add|insert)\s+(?:this|that|it|the (?:response|analysis|result))\s+(?:to|in(?:to)?|on)\s+(?:my\s+)?notes?/i,
  /(?:write|save|put|add|insert)\s+(?:to|in(?:to)?|on)\s+(?:my\s+)?notes?/i,
  /save\s+(?:this|that)\s+(?:as|to)\s+(?:a\s+)?note/i,
  /(?:add|create)\s+(?:a\s+)?note\s+(?:about|on|for|with)/i,
  /(?:take|make)\s+(?:a\s+)?note\s+(?:of|about|on)/i,
  /note\s+this\s+down/i,
  /jot\s+(?:this|that)\s+down/i,
];

const CREATE_PAGE_PATTERNS = [
  /(?:create|make|start)\s+(?:a\s+)?(?:new\s+)?(?:note\s+)?page\s+(?:about|on|for|called|titled)/i,
  /(?:new|fresh)\s+(?:note\s+)?page/i,
  /create\s+(?:a\s+)?note\s+(?:page|document)/i,
];

const EXPAND_PATTERNS = [
  /expand\s+(?:on\s+)?(?:my\s+)?(?:notes?|what\s+i\s+(?:wrote|noted))\s+(?:about|on|regarding)/i,
  /(?:elaborate|flesh\s+out|develop)\s+(?:my\s+)?notes?\s+(?:about|on)/i,
  /add\s+(?:more\s+)?detail\s+to\s+(?:my\s+)?notes?\s+(?:about|on)/i,
];

// ── Topic extraction ────────────────────────────────────────────

function extractTopic(query: string, action: NoteAction): string | null {
  // Try to extract "about X" or "on X"
  const aboutMatch = query.match(/(?:about|on|regarding|for|called|titled)\s+["""]?(.+?)["""]?\s*$/i);
  if (aboutMatch) return aboutMatch[1]!.trim().replace(/[.!?]+$/, '');

  // "summarize my notes" with no topic
  if (action === 'summarize_notes') return null;

  return null;
}

// ── Main detection function ────────────────────────────────────

export function detectNoteIntent(query: string): NoteIntent {
  const q = query.trim();

  // Check each pattern group in priority order
  for (const pattern of CREATE_PAGE_PATTERNS) {
    if (pattern.test(q)) {
      return {
        action: 'create_note_page',
        topic: extractTopic(q, 'create_note_page'),
        query: q,
        confidence: 0.9,
      };
    }
  }

  for (const pattern of SUMMARIZE_PATTERNS) {
    if (pattern.test(q)) {
      return {
        action: 'summarize_notes',
        topic: extractTopic(q, 'summarize_notes'),
        query: q,
        confidence: 0.85,
      };
    }
  }

  for (const pattern of EXPAND_PATTERNS) {
    if (pattern.test(q)) {
      return {
        action: 'expand_note',
        topic: extractTopic(q, 'expand_note'),
        query: q,
        confidence: 0.8,
      };
    }
  }

  for (const pattern of WRITE_TO_NOTE_PATTERNS) {
    if (pattern.test(q)) {
      return {
        action: 'write_to_notes',
        topic: extractTopic(q, 'write_to_notes'),
        query: q,
        confidence: 0.85,
      };
    }
  }

  return { action: null, topic: null, query: q, confidence: 0 };
}
