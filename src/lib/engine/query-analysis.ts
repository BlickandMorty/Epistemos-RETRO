/**
 * Query analysis — follow-up detection, domain classification,
 * question-type identification, entity extraction, complexity scoring.
 *
 * Extracted from simulate.ts for independent importability.
 */

// ═════════════════════════════════════════════════════════════════════
// ██ CONVERSATION CONTEXT — follow-up query detection
// ═════════════════════════════════════════════════════════════════════

/**
 * Minimal conversation history passed to runPipeline so follow-up queries
 * like "go deeper" or "what about the benefits" can inherit the original
 * topic context instead of analyzing their own words literally.
 */
export interface ConversationContext {
  /** Previous user messages (text only, most recent first) */
  previousQueries: string[];
  /** Previous system analysis entities — the *topic* of prior exchanges */
  previousEntities: string[];
  /** The original "root" question of the conversation */
  rootQuestion?: string;
}

const FOLLOW_UP_PATTERNS = [
  /^(go|let'?s?\s+go|dig|dive|let'?s?\s+dive|let'?s?\s+dig)\s+(deeper|further|more)/i,
  /^(tell me|explain|elaborate|expand)\s+(more|further|on)/i,
  /^(what about|how about|and what|and how)\b/i,
  /^(more on|more about|deeper into)\b/i,
  /^(can you|could you)\s+(explain|elaborate|expand|detail|go deeper)/i,
  /^(why|how)\s+(is that|does that|is this|does this|so|exactly)\b/i,
  /^(what makes|what are)\s+(it|them|this|that)\s/i,
  /^(the|its?|their|those?)\s+(benefit|advantage|drawback|effect|impact|cause|reason|nuance)/i,
  /^(benefits?|advantages?|drawbacks?|effects?|impacts?|causes?|reasons?|nuances?)\s+(of|behind)/i,
  /^(ok|okay|sure|yes|yeah|right|interesting)\b.*\b(but|and|so|what|how|why|tell|explain|more|deeper)/i,
];

function isFollowUpQuery(query: string): boolean {
  const trimmed = query.trim();
  // Short queries with no strong topic words are likely follow-ups
  if (trimmed.split(/\s+/).length <= 8 && !trimmed.includes('?')) {
    for (const pattern of FOLLOW_UP_PATTERNS) {
      if (pattern.test(trimmed)) return true;
    }
  }
  // Also catch any query matching follow-up patterns regardless of length
  for (const pattern of FOLLOW_UP_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

/**
 * Extract a focus qualifier from a follow-up query.
 * e.g. "go deeper into the nuances of what makes it beneficial" → "beneficial"
 * e.g. "what about the cognitive effects" → "cognitive effects"
 */
function extractFollowUpFocus(query: string): string | null {
  const focusPatterns = [
    /(?:deeper into|more about|expand on|elaborate on|tell me about)\s+(?:the\s+)?(?:nuances?\s+of\s+)?(?:what\s+makes?\s+(?:it|them|this|that)\s+)?(.+)/i,
    /(?:what about|how about)\s+(?:the\s+)?(.+)/i,
    /(?:what (?:makes?|are)\s+(?:it|them|this|that))\s+(.+)/i,
    /(?:benefits?|advantages?|effects?|impacts?|causes?|reasons?)\s+(?:of\s+)?(.+)/i,
  ];
  for (const pattern of focusPatterns) {
    const match = query.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/[?.!]+$/, '').trim();
    }
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════
// ██ QUERY ANALYSIS
// ═════════════════════════════════════════════════════════════════════

export type Domain =
  | 'medical'
  | 'philosophy'
  | 'science'
  | 'technology'
  | 'social_science'
  | 'economics'
  | 'psychology'
  | 'ethics'
  | 'general';

export type QuestionType =
  | 'causal'
  | 'comparative'
  | 'definitional'
  | 'evaluative'
  | 'speculative'
  | 'meta_analytical'
  | 'empirical'
  | 'conceptual';

export interface QueryAnalysis {
  domain: Domain;
  questionType: QuestionType;
  entities: string[];
  coreQuestion: string;
  complexity: number;
  isEmpirical: boolean;
  isPhilosophical: boolean;
  isMetaAnalytical: boolean;
  hasSafetyKeywords: boolean;
  hasNormativeClaims: boolean;
  keyTerms: string[];
  emotionalValence: 'neutral' | 'positive' | 'negative' | 'mixed';
  /** True when the query is a follow-up referencing the previous topic */
  isFollowUp: boolean;
  /** The aspect the user wants to focus on in this follow-up */
  followUpFocus: string | null;
}

export function analyzeQuery(query: string, context?: ConversationContext): QueryAnalysis {
  const words = query.split(/\s+/);
  const wordCount = words.length;

  // Detect follow-up queries and merge with previous context
  const followUp = context && context.previousQueries.length > 0 && isFollowUpQuery(query);
  const followUpFocus = followUp ? extractFollowUpFocus(query) : null;

  // If this is a follow-up, build an enriched query that includes the original topic
  // This ensures analyzeQuery extracts the RIGHT entities (the topic, not "deeper")
  const enrichedQuery = followUp && context
    ? `${context.rootQuestion || context.previousQueries[0]} — ${followUpFocus || query}`
    : query;

  // Use enrichedQuery for domain/entity detection so follow-ups inherit topic
  const analysisText = enrichedQuery;

  const domainPatterns: [RegExp, Domain][] = [
    [/\b(drug|treatment|therapy|clinical|patient|dose|symptom|disease|cancer|heart|blood|surgery|aspirin|stroke|medic|pharma|vaccine|diagnosis|prognosis|efficacy|ssri|depression|health)\b/i, 'medical'],
    [/\b(meaning|truth|moral|ethic|consciousness|existence|free.?will|determinism|metaphys|epistem|ontolog|philosophy|virtue|deontol|utilitarian|nihil|absurd)\b/i, 'philosophy'],
    [/\b(quantum|particle|evolution|genome|cell|molecule|gravity|physics|chemistry|biology|neuroscience|climate|ecosystem|species|bilingual|language|linguistic|cognitive)\b/i, 'science'],
    [/\b(algorithm|software|AI|machine.?learn|neural.?net|blockchain|compute|programming|data.?science|model|training|GPT|LLM|transformer)\b/i, 'technology'],
    [/\b(society|culture|inequality|gender|race|class|politics|democracy|governance|institution|social|community)\b/i, 'social_science'],
    [/\b(market|inflation|GDP|fiscal|monetary|trade|supply|demand|price|wage|economic|capitalism|labor)\b/i, 'economics'],
    [/\b(behavior|cognition|emotion|perception|memory|personality|mental|anxiety|trauma|attachment|motivation|bias|cognitive|sleep|bilingual|language)\b/i, 'psychology'],
    [/\b(should|ought|right|wrong|justice|fair|blame|guilt|punish|crime|criminal|prison|morality|law|legal)\b/i, 'ethics'],
  ];

  let domain: Domain = 'general';
  for (const [pattern, d] of domainPatterns) {
    if (pattern.test(analysisText)) { domain = d; break; }
  }

  const questionPatterns: [RegExp, QuestionType][] = [
    [/\b(cause|effect|leads? to|result in|because|why does|impact of|consequence|relationship between)\b/i, 'causal'],
    [/\b(compare|versus|vs\.?|difference between|better|worse|more effective)\b/i, 'comparative'],
    [/\b(what is|define|meaning of|what does .+ mean)\b/i, 'definitional'],
    [/\b(should|ought|is it (good|bad|right|wrong)|evaluate|assess|worth)\b/i, 'evaluative'],
    [/\b(what if|could|hypothetically|imagine|speculate|possible that|future)\b/i, 'speculative'],
    [/\b(meta.?analy|pool|systematic review|across studies|heterogeneity)\b/i, 'meta_analytical'],
    [/\b(evidence|data|study|trial|experiment|measure|observe|test|rct)\b/i, 'empirical'],
  ];

  let questionType: QuestionType = 'conceptual';
  for (const [pattern, qt] of questionPatterns) {
    if (pattern.test(analysisText)) { questionType = qt; break; }
  }

  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
    'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'what',
    'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'if', 'then',
    'than', 'but', 'and', 'or', 'not', 'no', 'nor', 'so', 'too', 'very',
    'just', 'about', 'more', 'most', 'some', 'any', 'all', 'each', 'every',
    'both', 'few', 'many', 'much', 'own', 'same', 'other', 'such', 'only',
    'from', 'with', 'for', 'of', 'to', 'in', 'on', 'at', 'by', 'up',
    'out', 'off', 'over', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'again', 'there', 'here', 'think',
    'deeply', 'really', 'actually', 'basically', 'like', 'things', 'thing',
    'please', 'also', 'still', 'even', 'know', 'understand', 'seems',
    'seem', 'make', 'sense', 'ppl', 'people', 'get', 'got', 'going',
  ]);

  // Extract entities from the enriched text (includes original topic for follow-ups)
  const analysisWords = analysisText.split(/\s+/);
  let entities = analysisWords
    .map((w) => w.replace(/[^a-zA-Z]/g, '').toLowerCase())
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .map((w) => w.replace(/^-+|-+$/g, '').replace(/[^a-z]/g, ''))
    .filter((w) => w.length > 3)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 8);

  // For follow-ups, also inject previous entities to maintain topic continuity
  if (followUp && context && context.previousEntities.length > 0) {
    const merged = [...new Set([...context.previousEntities, ...entities])];
    entities = merged.slice(0, 8);
  }

  const sentences = analysisText.split(/[.?!]+/).map((s) => s.trim()).filter(Boolean);
  const questionSentence = sentences.find((s) => s.includes('?')) ?? sentences[0] ?? analysisText;
  // For follow-ups, use the root question as the core question for display
  const coreQuestion = followUp && context?.rootQuestion
    ? context.rootQuestion.slice(0, 120)
    : questionSentence.slice(0, 120);

  const complexity = Math.min(1, (wordCount / 40) * 0.5 + (entities.length / 8) * 0.3 + (sentences.length > 2 ? 0.2 : 0)
    + (followUp ? 0.15 : 0)); // Follow-ups are inherently deeper

  const isEmpirical = /\b(study|trial|evidence|data|experiment|rct|cohort|measure|observe|effect|efficacy)\b/i.test(analysisText);
  const isPhilosophical = /\b(truth|meaning|moral|ethic|consciousness|free.?will|determinism|existence|reality|metaphys|why are we|what is the truth)\b/i.test(analysisText);
  const isMetaAnalytical = /\b(meta.?analy|pool|systematic|heterogeneity|across studies)\b/i.test(analysisText);
  const hasSafetyKeywords = /\b(harm|danger|weapon|toxic|exploit|kill|violence|suicide)\b/i.test(analysisText);
  const hasNormativeClaims = /\b(should|ought|right|wrong|blame|guilt|deserve|just|fair|moral)\b/i.test(analysisText);

  const keyTerms = entities.slice(0, 5);

  const negativeWords = /\b(blame|imprison|bad|wrong|harm|suffering|pain|death|guilt|punish|crime|unjust|unfair)\b/i;
  const positiveWords = /\b(good|benefit|improve|help|hope|progress|heal|growth|love|justice|beneficial|advantage)\b/i;
  const valenceNeg = negativeWords.test(analysisText);
  const valencePos = positiveWords.test(analysisText);
  const emotionalValence: QueryAnalysis['emotionalValence'] = valenceNeg && valencePos
    ? 'mixed' : valenceNeg ? 'negative' : valencePos ? 'positive' : 'neutral';

  return {
    domain, questionType, entities, coreQuestion, complexity,
    isEmpirical, isPhilosophical, isMetaAnalytical,
    hasSafetyKeywords, hasNormativeClaims, keyTerms, emotionalValence,
    isFollowUp: !!followUp,
    followUpFocus,
  };
}
