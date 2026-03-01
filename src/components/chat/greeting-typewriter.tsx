'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import {
  ALL_GREETING_PHRASES as GREETING_PHRASES,
  BORED_PHRASES,
  PHILOSOPHICAL_PHRASES,
  FOURTH_WALL_PHRASES,
} from '@/lib/greeting-phrases';

// Simple static placeholders for the search bar (replaces old syntax typewriter)
const SEARCH_PLACEHOLDERS = [
  "What's up?",
  "How can I help?",
  "Ask me anything...",
  "What are you working on?",
];

// ═══════════════════════════════════════════════════════════════════
// GreetingTypewriter — AI-style typing in the H1 greeting title
//
// Types out phrases with natural stutter pauses. Progresses through
// idle phases the longer the user sits on the landing page:
//   Phase 0 (0-20s):  Normal greetings
//   Phase 1 (20-45s): Bored / impatient
//   Phase 2 (45-75s): Philosophical questions
//   Phase 3 (75s+):   4th-wall breaking
//   Phase 4:          Counting to 10
// ═══════════════════════════════════════════════════════════════════

function pickRandom<T>(arr: readonly T[], exclude?: T): T {
  if (arr.length <= 1) return arr[0]!;
  let pick: T;
  do {
    pick = arr[Math.floor(Math.random() * arr.length)]!;
  } while (pick === exclude && arr.length > 1);
  return pick;
}

export function GreetingTypewriter({ isDark, isSunny }: { isDark: boolean; isSunny?: boolean }) {
  const [displayText, setDisplayText] = useState('');
  const mountTimeRef = useRef(Date.now());
  const stateRef = useRef({
    charIdx: 0,
    phase: 'typing' as 'typing' | 'pausing' | 'deleting',
    currentPhrase: '',
    lastPhrase: '' as string, // prevents consecutive repeats
    idlePhase: 0 as 0 | 1 | 2 | 3 | 4,
    countValue: 0, // for counting phase
    phrasesShown: 0,
  });

  // Pick next phrase based on idle duration
  const getNextPhrase = useCallback((): string => {
    const s = stateRef.current;
    const elapsed = (Date.now() - mountTimeRef.current) / 1000;

    // Phase 4: counting
    if (s.idlePhase === 4) {
      s.countValue++;
      if (s.countValue <= 10) { s.lastPhrase = String(s.countValue); return s.lastPhrase; }
      if (s.countValue === 11) { s.lastPhrase = '...well that was anticlimactic'; return s.lastPhrase; }
      // Reset to philosophical after counting
      s.idlePhase = 2;
      s.countValue = 0;
      const p = pickRandom(PHILOSOPHICAL_PHRASES, s.lastPhrase);
      s.lastPhrase = p;
      return p;
    }

    // Determine phase from elapsed time
    if (elapsed > 75 && s.idlePhase < 3) {
      s.idlePhase = 3;
    } else if (elapsed > 45 && s.idlePhase < 2) {
      s.idlePhase = 2;
    } else if (elapsed > 20 && s.idlePhase < 1) {
      s.idlePhase = 1;
    }

    const last = s.lastPhrase;
    let phrase: string;
    switch (s.idlePhase) {
      case 0: phrase = pickRandom(GREETING_PHRASES, last); break;
      case 1: phrase = pickRandom(BORED_PHRASES, last); break;
      case 2: phrase = pickRandom(PHILOSOPHICAL_PHRASES, last); break;
      case 3: {
        phrase = pickRandom(FOURTH_WALL_PHRASES, last);
        if (phrase === "i'm gonna count to 10.") {
          s.idlePhase = 4;
          s.countValue = 0;
        }
        break;
      }
      default: phrase = pickRandom(GREETING_PHRASES, last);
    }
    s.lastPhrase = phrase;
    return phrase;
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    // First greeting is always "Sup, Brainiac!" — subsequent ones are random questions
    stateRef.current.currentPhrase = 'Sup, Brainiac!';

    function tick() {
      const s = stateRef.current;
      const target = s.currentPhrase;

      if (s.phase === 'typing') {
        if (s.charIdx < target.length) {
          s.charIdx++;
          setDisplayText(target.slice(0, s.charIdx));

          const ch = target[s.charIdx - 1] ?? '';

          // AI-style stutter with natural rhythm
          let delay = 45 + Math.random() * 30; // 45-75ms base (snappier)

          // Punctuation pauses — natural reading rhythm
          if ('.!?'.includes(ch)) delay += 200 + Math.random() * 200;
          else if (',;:'.includes(ch)) delay += 80 + Math.random() * 80;
          else if (ch === ' ' && Math.random() < 0.08) delay += 60 + Math.random() * 60; // breath at some spaces

          // ~10% chance: short stutter (brief hesitation, like rethinking a word)
          if (Math.random() < 0.10) delay += 120 + Math.random() * 130;
          // ~3% chance: longer "thinking" pause (like reformulating mid-sentence)
          if (Math.random() < 0.03) delay += 350 + Math.random() * 250;

          // Slightly slower on first 2 chars (initial thought forming)
          if (s.charIdx <= 2) delay += 100;

          timer = setTimeout(tick, delay);
        } else {
          s.phase = 'pausing';
          // Hold the completed phrase — longer for contemplative, shorter for counting
          const pauseTime = target.length < 5 ? 1000 : 2600 + Math.random() * 1000;
          timer = setTimeout(tick, pauseTime);
        }
      } else if (s.phase === 'pausing') {
        s.phase = 'deleting';
        timer = setTimeout(tick, 80); // small beat before deleting
      } else {
        // Deleting — accelerates as it goes (fast wipe effect)
        if (s.charIdx > 0) {
          // Delete faster as we get closer to empty: 30ms → 8ms
          const progress = 1 - s.charIdx / target.length;
          const deleteSpeed = Math.max(8, 28 - progress * 20);
          // Delete 1-3 chars at a time for speed (more aggressive near start)
          const charsToDelete = s.charIdx > 10 ? Math.min(s.charIdx, 1 + Math.floor(Math.random() * 2)) : 1;
          s.charIdx = Math.max(0, s.charIdx - charsToDelete);
          setDisplayText(target.slice(0, s.charIdx));
          timer = setTimeout(tick, deleteSpeed);
        } else {
          // Pick next phrase — brief pause before new thought
          s.currentPhrase = getNextPhrase();
          s.phrasesShown++;
          s.phase = 'typing';
          timer = setTimeout(tick, 350 + Math.random() * 250);
        }
      }
    }

    timer = setTimeout(tick, 250);
    return () => clearTimeout(timer);
  }, [getNextPhrase]);

  // White cursor for all dark themes (amber, navy, cosmic, sunset, oled)
  // Black cursor for default light AND sunny
  const cursorColor = isDark
    ? 'rgba(255,255,255,0.9)'
    : 'rgba(0,0,0,0.85)';

  return (
    <span style={{ display: 'inline' }}>
      {displayText}
      <span
        className="typewriter-cursor"
        style={{
          display: 'inline-block',
          width: '0.35em',
          height: '0.95em',
          backgroundColor: cursorColor,
          marginLeft: '2px',
          verticalAlign: 'text-bottom',
          borderRadius: '1.5px',
        }}
      />
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SearchBarPlaceholder — simple static text for the search input
// ═══════════════════════════════════════════════════════════════════

export function SearchBarPlaceholder({ isDark }: { isDark: boolean }) {
  const [text] = useState(() => pickRandom(SEARCH_PLACEHOLDERS));
  return (
    <span
      style={{
        fontSize: '0.9375rem',
        fontWeight: 400,
        color: isDark ? 'rgba(156,143,128,0.4)' : 'rgba(0,0,0,0.3)',
        fontFamily: 'var(--font-display)',
        letterSpacing: '-0.01em',
      }}
    >
      {text}
    </span>
  );
}
