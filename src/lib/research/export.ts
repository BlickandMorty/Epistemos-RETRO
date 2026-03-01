import type { ExportFormat, ExportDataType, ResearchPaper } from './types';
import type { SignalHistoryEntry, CortexSnapshot } from '@/lib/store/use-pfc-store';
import type { ChatMessage } from '@/lib/engine/types';

// ═══════════════════════════════════════════════════════════════════
// Research Suite — Data Export System
// Produces detailed analysis reports with derived insights,
// trend analysis, and research summaries — not just raw data dumps.
// ═══════════════════════════════════════════════════════════════════

interface ExportPayload {
  signals?: SignalHistoryEntry[];
  papers?: ResearchPaper[];
  chatHistory?: ChatMessage[];
  cortexSnapshots?: CortexSnapshot[];
}

export function exportData(
  format: ExportFormat,
  dataType: ExportDataType,
  payload: ExportPayload,
): string {
  switch (format) {
    case 'json':
      return exportJSON(dataType, payload);
    case 'csv':
      return exportCSV(dataType, payload);
    case 'markdown':
      return exportMarkdown(dataType, payload);
    case 'bibtex':
      return exportBibTeX(payload.papers ?? []);
    case 'ris':
      return exportRIS(payload.papers ?? []);
    default:
      return exportJSON(dataType, payload);
  }
}

// ── Analytics computation helpers ──

interface SignalAnalytics {
  count: number;
  timeSpanHours: number;
  confidence: { avg: number; min: number; max: number; latest: number; trend: string };
  entropy: { avg: number; min: number; max: number; latest: number; trend: string };
  dissonance: { avg: number; min: number; max: number; latest: number; trend: string };
  healthScore: { avg: number; min: number; max: number; latest: number; trend: string };
  riskScore: { avg: number; min: number; max: number; latest: number; trend: string };
  overallAssessment: string;
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high';
}

function computeSignalAnalytics(signals: SignalHistoryEntry[]): SignalAnalytics | null {
  if (signals.length === 0) return null;

  const sorted = [...signals].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const timeSpanHours = (last.timestamp - first.timestamp) / 3600000;

  function stats(extract: (s: SignalHistoryEntry) => number) {
    const vals = sorted.map(extract);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const latest = vals[vals.length - 1]!;
    // Simple trend: compare last 25% to first 25%
    const q = Math.max(1, Math.floor(vals.length / 4));
    const earlyAvg = vals.slice(0, q).reduce((a, b) => a + b, 0) / q;
    const lateAvg = vals.slice(-q).reduce((a, b) => a + b, 0) / q;
    const diff = lateAvg - earlyAvg;
    const trend = Math.abs(diff) < 0.02 ? 'stable' : diff > 0 ? 'increasing' : 'decreasing';
    return { avg, min, max, latest, trend };
  }

  const confidence = stats((s) => s.confidence);
  const entropy = stats((s) => s.entropy);
  const dissonance = stats((s) => s.dissonance);
  const healthScore = stats((s) => s.healthScore);
  const riskScore = stats((s) => s.riskScore);

  // Overall assessment
  const riskLevel: 'low' | 'moderate' | 'elevated' | 'high' =
    riskScore.latest > 0.75 ? 'high' :
    riskScore.latest > 0.5 ? 'elevated' :
    riskScore.latest > 0.25 ? 'moderate' : 'low';

  const assessmentParts: string[] = [];
  if (confidence.trend === 'increasing') assessmentParts.push('confidence is trending upward');
  if (confidence.trend === 'decreasing') assessmentParts.push('confidence has declined over the session');
  if (entropy.latest > 0.7) assessmentParts.push('high entropy indicates significant uncertainty in recent analyses');
  if (dissonance.latest > 0.5) assessmentParts.push('elevated dissonance suggests conflicting information sources');
  if (healthScore.latest > 0.7) assessmentParts.push('strong overall system health');
  if (healthScore.latest < 0.3) assessmentParts.push('system health is degraded — review recent inputs');
  if (assessmentParts.length === 0) assessmentParts.push('metrics are within normal operating ranges');

  return {
    count: signals.length,
    timeSpanHours,
    confidence, entropy, dissonance, healthScore, riskScore,
    overallAssessment: assessmentParts.join('; ') + '.',
    riskLevel,
  };
}

interface ChatAnalytics {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  avgConfidence: number | null;
  evidenceGradeDistribution: Record<string, number>;
  timeSpanHours: number;
  topTopics: string[];
}

function computeChatAnalytics(messages: ChatMessage[]): ChatAnalytics | null {
  if (messages.length === 0) return null;

  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const userMsgs = sorted.filter((m) => m.role === 'user');
  const assistantMsgs = sorted.filter((m) => m.role === 'system');
  const timeSpanHours = sorted.length > 1
    ? (sorted[sorted.length - 1]!.timestamp - sorted[0]!.timestamp) / 3600000
    : 0;

  const withConf = assistantMsgs.filter((m) => typeof m.confidence === 'number');
  const avgConfidence = withConf.length > 0
    ? withConf.reduce((sum, m) => sum + (m.confidence ?? 0), 0) / withConf.length
    : null;

  const gradeDistribution: Record<string, number> = {};
  for (const m of assistantMsgs) {
    if (m.evidenceGrade) {
      gradeDistribution[m.evidenceGrade] = (gradeDistribution[m.evidenceGrade] ?? 0) + 1;
    }
  }

  // Extract rough topics from user messages (most common significant words)
  const wordCounts: Record<string, number> = {};
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or', 'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just', 'about', 'what', 'how', 'why', 'when', 'where', 'who', 'which', 'that', 'this', 'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their', 'him', 'her']);
  for (const m of userMsgs) {
    const words = m.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w));
    for (const w of words) wordCounts[w] = (wordCounts[w] ?? 0) + 1;
  }
  const topTopics = Object.entries(wordCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([word]) => word);

  return {
    totalMessages: messages.length,
    userMessages: userMsgs.length,
    assistantMessages: assistantMsgs.length,
    avgConfidence,
    evidenceGradeDistribution: gradeDistribution,
    timeSpanHours,
    topTopics,
  };
}

interface CortexAnalytics {
  totalSnapshots: number;
  latestSignals: { confidence: number; entropy: number; dissonance: number; healthScore: number; riskScore: number } | null;
  totalQueriesProcessed: number;
  totalTraces: number;
  skillGapsDetected: number;
  inferenceModes: Record<string, number>;
}

function computeCortexAnalytics(snapshots: CortexSnapshot[]): CortexAnalytics | null {
  if (snapshots.length === 0) return null;

  const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1]!;

  const inferenceModes: Record<string, number> = {};
  let totalQueries = 0;
  let totalTraces = 0;
  let totalGaps = 0;
  for (const snap of sorted) {
    inferenceModes[snap.inferenceMode] = (inferenceModes[snap.inferenceMode] ?? 0) + 1;
    totalQueries += snap.meta?.queriesProcessed ?? 0;
    totalTraces += snap.meta?.totalTraces ?? 0;
    totalGaps += snap.meta?.skillGapsDetected ?? 0;
  }

  return {
    totalSnapshots: snapshots.length,
    latestSignals: latest.signals ? {
      confidence: latest.signals.confidence,
      entropy: latest.signals.entropy,
      dissonance: latest.signals.dissonance,
      healthScore: latest.signals.healthScore,
      riskScore: latest.signals.riskScore,
    } : null,
    totalQueriesProcessed: totalQueries,
    totalTraces,
    skillGapsDetected: totalGaps,
    inferenceModes,
  };
}

// ── JSON export with analytics ──

function exportJSON(dataType: ExportDataType, payload: ExportPayload): string {
  const data: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    dataType,
  };

  // Always include analytics summary
  data.analytics = {};

  if (dataType === 'all' || dataType === 'signals') {
    data.signals = payload.signals ?? [];
    const analysis = computeSignalAnalytics(payload.signals ?? []);
    if (analysis) (data.analytics as Record<string, unknown>).signalAnalysis = analysis;
  }
  if (dataType === 'all' || dataType === 'papers') {
    data.papers = payload.papers ?? [];
    (data.analytics as Record<string, unknown>).paperCount = (payload.papers ?? []).length;
    const tagCounts: Record<string, number> = {};
    for (const p of payload.papers ?? []) {
      for (const t of p.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
    (data.analytics as Record<string, unknown>).paperTagDistribution = tagCounts;
    const journalCounts: Record<string, number> = {};
    for (const p of payload.papers ?? []) {
      if (p.journal) journalCounts[p.journal] = (journalCounts[p.journal] ?? 0) + 1;
    }
    (data.analytics as Record<string, unknown>).journalDistribution = journalCounts;
  }
  if (dataType === 'all' || dataType === 'chat-history') {
    data.chatHistory = payload.chatHistory ?? [];
    const chatAnalysis = computeChatAnalytics(payload.chatHistory ?? []);
    if (chatAnalysis) (data.analytics as Record<string, unknown>).chatAnalysis = chatAnalysis;
  }
  if (dataType === 'all' || dataType === 'pipeline-runs') {
    data.cortexSnapshots = payload.cortexSnapshots ?? [];
    const cortexAnalysis = computeCortexAnalytics(payload.cortexSnapshots ?? []);
    if (cortexAnalysis) (data.analytics as Record<string, unknown>).cortexAnalysis = cortexAnalysis;
  }

  return JSON.stringify(data, null, 2);
}

// ── CSV export ──

function exportCSV(dataType: ExportDataType, payload: ExportPayload): string {
  if (dataType === 'signals' && payload.signals) {
    const headers = 'timestamp,confidence,entropy,dissonance,healthScore,riskScore';
    const rows = payload.signals.map(
      (s) => `${new Date(s.timestamp).toISOString()},${s.confidence},${s.entropy},${s.dissonance},${s.healthScore},${s.riskScore}`,
    );
    return [headers, ...rows].join('\n');
  }

  if (dataType === 'papers' && payload.papers) {
    const headers = 'title,authors,year,journal,doi,url,tags,savedAt';
    const rows = payload.papers.map(
      (p) =>
        `"${esc(p.title)}","${esc(p.authors.join('; '))}",${p.year},"${esc(p.journal ?? '')}","${esc(p.doi ?? '')}","${esc(p.url ?? '')}","${esc(p.tags.join('; '))}",${new Date(p.savedAt).toISOString()}`,
    );
    return [headers, ...rows].join('\n');
  }

  if (dataType === 'chat-history' && payload.chatHistory) {
    const headers = 'id,role,timestamp,confidence,evidenceGrade,text';
    const rows = payload.chatHistory.map(
      (m) =>
        `"${m.id}","${m.role}","${new Date(m.timestamp).toISOString()}",${m.confidence ?? ''},${m.evidenceGrade ?? ''},"${esc(m.text.slice(0, 500))}"`,
    );
    return [headers, ...rows].join('\n');
  }

  return exportJSON(dataType, payload);
}

// ── Markdown export — full analysis report ──

function fmt(n: number): string { return n.toFixed(3); }
function pct(n: number): string { return (n * 100).toFixed(1) + '%'; }

function exportMarkdown(dataType: ExportDataType, payload: ExportPayload): string {
  const now = new Date();
  const lines: string[] = [
    `# Brainiac — Analysis Report`,
    ``,
    `**Generated:** ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${now.toLocaleTimeString()}`,
    `**Export type:** ${dataType}`,
    ``,
  ];

  // ── Executive Summary ──
  const sigAnalysis = computeSignalAnalytics(payload.signals ?? []);
  const chatAnalysis = computeChatAnalytics(payload.chatHistory ?? []);
  const cortexAnalysis = computeCortexAnalytics(payload.cortexSnapshots ?? []);
  const paperCount = (payload.papers ?? []).length;

  lines.push(`## Executive Summary`, ``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Signal data points | ${(payload.signals ?? []).length} |`);
  lines.push(`| Research papers saved | ${paperCount} |`);
  lines.push(`| Chat messages | ${(payload.chatHistory ?? []).length} |`);
  lines.push(`| Cortex snapshots | ${(payload.cortexSnapshots ?? []).length} |`);
  if (sigAnalysis) {
    lines.push(`| Session duration | ${sigAnalysis.timeSpanHours.toFixed(1)} hours |`);
    lines.push(`| Current confidence | ${pct(sigAnalysis.confidence.latest)} |`);
    lines.push(`| Risk level | **${sigAnalysis.riskLevel.toUpperCase()}** |`);
  }
  lines.push(``);

  // ── Signal Analysis ──
  if ((dataType === 'all' || dataType === 'signals') && sigAnalysis) {
    lines.push(`## Signal Analysis`, ``);
    lines.push(`### Overview`);
    lines.push(`- **${sigAnalysis.count}** data points over **${sigAnalysis.timeSpanHours.toFixed(1)} hours**`);
    lines.push(`- Overall assessment: ${sigAnalysis.overallAssessment}`);
    lines.push(``);

    lines.push(`### Current Readings`, ``);
    lines.push(`| Signal | Latest | Average | Min | Max | Trend |`);
    lines.push(`|--------|--------|---------|-----|-----|-------|`);
    lines.push(`| Confidence | ${pct(sigAnalysis.confidence.latest)} | ${pct(sigAnalysis.confidence.avg)} | ${pct(sigAnalysis.confidence.min)} | ${pct(sigAnalysis.confidence.max)} | ${sigAnalysis.confidence.trend} |`);
    lines.push(`| Entropy | ${fmt(sigAnalysis.entropy.latest)} | ${fmt(sigAnalysis.entropy.avg)} | ${fmt(sigAnalysis.entropy.min)} | ${fmt(sigAnalysis.entropy.max)} | ${sigAnalysis.entropy.trend} |`);
    lines.push(`| Dissonance | ${fmt(sigAnalysis.dissonance.latest)} | ${fmt(sigAnalysis.dissonance.avg)} | ${fmt(sigAnalysis.dissonance.min)} | ${fmt(sigAnalysis.dissonance.max)} | ${sigAnalysis.dissonance.trend} |`);
    lines.push(`| Health Score | ${pct(sigAnalysis.healthScore.latest)} | ${pct(sigAnalysis.healthScore.avg)} | ${pct(sigAnalysis.healthScore.min)} | ${pct(sigAnalysis.healthScore.max)} | ${sigAnalysis.healthScore.trend} |`);
    lines.push(`| Risk Score | ${pct(sigAnalysis.riskScore.latest)} | ${pct(sigAnalysis.riskScore.avg)} | ${pct(sigAnalysis.riskScore.min)} | ${pct(sigAnalysis.riskScore.max)} | ${sigAnalysis.riskScore.trend} |`);
    lines.push(``);

    // Risk assessment
    lines.push(`### Risk Assessment`, ``);
    lines.push(`- **Risk Level:** ${sigAnalysis.riskLevel.toUpperCase()}`);
    if (sigAnalysis.riskLevel === 'high') {
      lines.push(`- ⚠️ Risk score is elevated (${pct(sigAnalysis.riskScore.latest)}). Review recent research inputs for conflicting or low-quality sources.`);
    } else if (sigAnalysis.riskLevel === 'elevated') {
      lines.push(`- ⚡ Moderate risk detected. Dissonance between sources may require reconciliation.`);
    } else {
      lines.push(`- ✅ Risk levels are within acceptable thresholds.`);
    }
    lines.push(``);

    // Raw signal table
    if (payload.signals && payload.signals.length > 0) {
      lines.push(`### Signal History (Raw Data)`, ``);
      lines.push(`| Timestamp | Confidence | Entropy | Dissonance | Health | Risk |`);
      lines.push(`|-----------|-----------|---------|------------|--------|------|`);
      for (const s of payload.signals) {
        lines.push(
          `| ${new Date(s.timestamp).toLocaleString()} | ${fmt(s.confidence)} | ${fmt(s.entropy)} | ${fmt(s.dissonance)} | ${fmt(s.healthScore)} | ${fmt(s.riskScore)} |`,
        );
      }
      lines.push(``);
    }
  }

  // ── Research Papers ──
  if ((dataType === 'all' || dataType === 'papers') && payload.papers?.length) {
    lines.push(`## Research Library`, ``);
    lines.push(`**${paperCount} papers** in the collection.`);
    lines.push(``);

    // Tag distribution
    const tagCounts: Record<string, number> = {};
    for (const p of payload.papers) {
      for (const t of p.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
    const topTags = Object.entries(tagCounts).sort(([, a], [, b]) => b - a).slice(0, 10);
    if (topTags.length > 0) {
      lines.push(`### Research Topics`, ``);
      for (const [tag, count] of topTags) {
        lines.push(`- **${tag}** (${count} paper${count !== 1 ? 's' : ''})`);
      }
      lines.push(``);
    }

    // Journal distribution
    const journalCounts: Record<string, number> = {};
    for (const p of payload.papers) {
      if (p.journal) journalCounts[p.journal] = (journalCounts[p.journal] ?? 0) + 1;
    }
    const topJournals = Object.entries(journalCounts).sort(([, a], [, b]) => b - a).slice(0, 5);
    if (topJournals.length > 0) {
      lines.push(`### Top Journals`, ``);
      for (const [journal, count] of topJournals) {
        lines.push(`- **${journal}** (${count})`);
      }
      lines.push(``);
    }

    // Year distribution
    const yearCounts: Record<number, number> = {};
    for (const p of payload.papers) {
      yearCounts[p.year] = (yearCounts[p.year] ?? 0) + 1;
    }
    const years = Object.entries(yearCounts).sort(([a], [b]) => Number(b) - Number(a));
    if (years.length > 0) {
      lines.push(`### Publication Years`, ``);
      for (const [year, count] of years) {
        lines.push(`- ${year}: ${count} paper${count !== 1 ? 's' : ''}`);
      }
      lines.push(``);
    }

    lines.push(`### Paper Details`, ``);
    for (const p of payload.papers) {
      lines.push(`#### ${p.title}`);
      lines.push(`- **Authors:** ${p.authors.join(', ')}`);
      lines.push(`- **Year:** ${p.year}`);
      if (p.journal) lines.push(`- **Journal:** ${p.journal}`);
      if (p.doi) lines.push(`- **DOI:** ${p.doi}`);
      if (p.url) lines.push(`- **URL:** ${p.url}`);
      if (p.tags.length > 0) lines.push(`- **Tags:** ${p.tags.join(', ')}`);
      if (p.abstract) lines.push(``, `> ${p.abstract}`);
      if (p.notes) lines.push(``, `**Research Notes:** ${p.notes}`);
      lines.push(``);
    }
  }

  // ── Chat Analysis ──
  if ((dataType === 'all' || dataType === 'chat-history') && chatAnalysis) {
    lines.push(`## Conversation Analysis`, ``);
    lines.push(`- **${chatAnalysis.totalMessages}** total messages (${chatAnalysis.userMessages} user, ${chatAnalysis.assistantMessages} assistant)`);
    lines.push(`- **Session duration:** ${chatAnalysis.timeSpanHours.toFixed(1)} hours`);
    if (chatAnalysis.avgConfidence !== null) {
      lines.push(`- **Average response confidence:** ${pct(chatAnalysis.avgConfidence)}`);
    }
    lines.push(``);

    if (chatAnalysis.topTopics.length > 0) {
      lines.push(`### Key Topics Discussed`, ``);
      lines.push(`${chatAnalysis.topTopics.map((t) => `\`${t}\``).join(', ')}`);
      lines.push(``);
    }

    if (Object.keys(chatAnalysis.evidenceGradeDistribution).length > 0) {
      lines.push(`### Evidence Grade Distribution`, ``);
      lines.push(`| Grade | Count |`);
      lines.push(`|-------|-------|`);
      for (const [grade, count] of Object.entries(chatAnalysis.evidenceGradeDistribution).sort(([, a], [, b]) => b - a)) {
        lines.push(`| ${grade} | ${count} |`);
      }
      lines.push(``);
    }

    // Recent conversation excerpts
    if (payload.chatHistory && payload.chatHistory.length > 0) {
      lines.push(`### Conversation Log`, ``);
      for (const m of payload.chatHistory) {
        const role = m.role === 'user' ? '🧑 User' : '🤖 Brainiac';  // system = assistant responses
        lines.push(`**${role}** *(${new Date(m.timestamp).toLocaleString()})*`);
        if (m.confidence) lines.push(`> Confidence: ${pct(m.confidence)} | Grade: ${m.evidenceGrade ?? 'N/A'}`);
        lines.push(``);
        lines.push(m.text.slice(0, 2000));
        lines.push(``);
        lines.push(`---`);
        lines.push(``);
      }
    }
  }

  // ── Cortex / Pipeline Analysis ──
  if ((dataType === 'all' || dataType === 'pipeline-runs') && cortexAnalysis) {
    lines.push(`## Pipeline & Cortex Analysis`, ``);
    lines.push(`- **${cortexAnalysis.totalSnapshots}** cortex snapshots recorded`);
    lines.push(`- **${cortexAnalysis.totalQueriesProcessed}** total queries processed`);
    lines.push(`- **${cortexAnalysis.totalTraces}** reasoning traces recorded`);
    lines.push(`- **${cortexAnalysis.skillGapsDetected}** skill gaps detected`);
    lines.push(``);

    if (cortexAnalysis.latestSignals) {
      const ls = cortexAnalysis.latestSignals;
      lines.push(`### Latest Brain State`, ``);
      lines.push(`| Signal | Value |`);
      lines.push(`|--------|-------|`);
      lines.push(`| Confidence | ${pct(ls.confidence)} |`);
      lines.push(`| Entropy | ${fmt(ls.entropy)} |`);
      lines.push(`| Dissonance | ${fmt(ls.dissonance)} |`);
      lines.push(`| Health Score | ${pct(ls.healthScore)} |`);
      lines.push(`| Risk Score | ${pct(ls.riskScore)} |`);
      lines.push(``);
    }

    if (Object.keys(cortexAnalysis.inferenceModes).length > 0) {
      lines.push(`### Inference Mode Usage`, ``);
      for (const [mode, count] of Object.entries(cortexAnalysis.inferenceModes)) {
        lines.push(`- **${mode}:** ${count} snapshot${count !== 1 ? 's' : ''}`);
      }
      lines.push(``);
    }
  }

  // ── Footer ──
  lines.push(`---`);
  lines.push(``);
  lines.push(`*Generated by Brainiac Export System — ${now.toISOString()}*`);

  return lines.join('\n');
}

function exportBibTeX(papers: ResearchPaper[]): string {
  return papers
    .map((p) => {
      const key = `${p.authors[0]?.split(' ').pop() ?? 'unknown'}${p.year}`;
      const lines = [
        `@article{${key},`,
        `  title = {${p.title}},`,
        `  author = {${p.authors.join(' and ')}},`,
        `  year = {${p.year}},`,
      ];
      if (p.journal) lines.push(`  journal = {${p.journal}},`);
      if (p.doi) lines.push(`  doi = {${p.doi}},`);
      if (p.url) lines.push(`  url = {${p.url}},`);
      lines.push(`}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

function exportRIS(papers: ResearchPaper[]): string {
  return papers
    .map((p) => {
      const lines = [
        `TY  - JOUR`,
        `TI  - ${p.title}`,
        ...p.authors.map((a) => `AU  - ${a}`),
        `PY  - ${p.year}`,
      ];
      if (p.journal) lines.push(`JO  - ${p.journal}`);
      if (p.doi) lines.push(`DO  - ${p.doi}`);
      if (p.url) lines.push(`UR  - ${p.url}`);
      if (p.abstract) lines.push(`AB  - ${p.abstract}`);
      lines.push(`ER  - `);
      return lines.join('\n');
    })
    .join('\n\n');
}

/** Trigger a file download in the browser */
export function downloadExport(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Get mime type for export format */
export function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'json': return 'application/json';
    case 'csv': return 'text/csv';
    case 'markdown': return 'text/markdown';
    case 'bibtex': return 'application/x-bibtex';
    case 'ris': return 'application/x-research-info-systems';
    default: return 'text/plain';
  }
}

function esc(s: string): string {
  return s.replace(/"/g, '""');
}
