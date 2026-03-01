/**
 * AIM-inspired D3 data processing utilities.
 *
 * Provides smoothing, aggregation, outlier removal, regression,
 * and confidence-band computation for the visualizer charts.
 */

// ---------------------------------------------------------------------------
// Smoothing (AIM: utils/smoothingData.ts)
// ---------------------------------------------------------------------------

/** Exponential Moving Average — AIM's primary smoothing algorithm */
export function smoothEMA(data: [number, number][], factor: number): [number, number][] {
  if (data.length === 0 || factor <= 0) return data;
  const weight = Math.min(1, Math.max(0, factor));
  const result: [number, number][] = [];
  let prev = data[0]![1];
  for (const [x, y] of data) {
    prev = weight * y + (1 - weight) * prev;
    result.push([x, prev]);
  }
  return result;
}

/** Centred Moving Average — window-based smoothing */
function smoothCMA(data: [number, number][], windowSize: number): [number, number][] {
  if (data.length === 0 || windowSize < 2) return data;
  const half = Math.floor((windowSize - 1) / 2);
  return data.map(([x], i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(data.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += data[j]![1];
    return [x, sum / (hi - lo + 1)] as [number, number];
  });
}

// ---------------------------------------------------------------------------
// Aggregation (AIM: utils/aggregateGroupData.ts)
// ---------------------------------------------------------------------------

type AggLineMethod = 'mean' | 'median' | 'min' | 'max';
type AggAreaMethod = 'none' | 'minmax' | 'stddev' | 'stderr' | 'ci95';

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function stdDev(arr: number[], mean: number): number {
  const ss = arr.reduce((a, v) => a + (v - mean) ** 2, 0);
  return Math.sqrt(ss / Math.max(1, arr.length - 1));
}

/** Aggregate multiple series at matching x positions */
function aggregateSeries(
  allSeries: [number, number][][],
  lineMethod: AggLineMethod = 'mean',
  areaMethod: AggAreaMethod = 'stddev',
): { line: [number, number][]; upper: [number, number][]; lower: [number, number][] } {
  if (allSeries.length === 0) return { line: [], upper: [], lower: [] };
  if (allSeries.length === 1) return { line: allSeries[0]!, upper: allSeries[0]!, lower: allSeries[0]! };

  // Align on x positions from the first series
  const xs = allSeries[0]!.map((d) => d[0]);
  const line: [number, number][] = [];
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    const values = allSeries.map((s) => s[Math.min(i, s.length - 1)]?.[1] ?? 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    let center: number;
    switch (lineMethod) {
      case 'median': center = median(values); break;
      case 'min': center = Math.min(...values); break;
      case 'max': center = Math.max(...values); break;
      default: center = mean;
    }
    line.push([x, center]);

    let hi = center, lo = center;
    const sd = stdDev(values, mean);
    const se = sd / Math.sqrt(values.length);
    switch (areaMethod) {
      case 'minmax':
        hi = Math.max(...values);
        lo = Math.min(...values);
        break;
      case 'stddev':
        hi = center + sd;
        lo = center - sd;
        break;
      case 'stderr':
        hi = center + se;
        lo = center - se;
        break;
      case 'ci95':
        hi = center + 1.96 * se;
        lo = center - 1.96 * se;
        break;
      default: break;
    }
    upper.push([x, hi]);
    lower.push([x, lo]);
  }

  return { line, upper, lower };
}

// ---------------------------------------------------------------------------
// Outlier removal (AIM: utils/removeOutliers.ts)
// ---------------------------------------------------------------------------

function removeOutliers(data: [number, number][], threshold = 2): [number, number][] {
  if (data.length < 4) return data;
  const ys = data.map((d) => d[1]);
  const sorted = [...ys].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
  const iqr = q3 - q1;
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  return data.filter((d) => Math.abs(d[1] - mean) <= threshold * iqr);
}

// ---------------------------------------------------------------------------
// Linear Regression (AIM: utils/regression/linearRegression.ts)
// ---------------------------------------------------------------------------

export function linearRegression(points: { x: number; y: number }[]): {
  slope: number; intercept: number; r2: number;
  line: [number, number][];
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, line: [] };

  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (const p of points) {
    sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y;
  }

  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return { slope: 0, intercept: sy / n, r2: 0, line: [] };

  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  const meanY = sy / n;
  let ssRes = 0, ssTot = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const xMin = xs[0]!, xMax = xs[xs.length - 1]!;
  const line: [number, number][] = [
    [xMin, slope * xMin + intercept],
    [xMax, slope * xMax + intercept],
  ];

  return { slope, intercept, r2, line };
}

// ---------------------------------------------------------------------------
// LOESS Regression (AIM: utils/regression/loess.ts)
// ---------------------------------------------------------------------------

export function loess(
  points: { x: number; y: number }[],
  bandwidth = 0.3,
  steps = 40,
): [number, number][] {
  const n = points.length;
  if (n < 3) return points.map((p) => [p.x, p.y]);

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const xMin = sorted[0]!.x, xMax = sorted[n - 1]!.x;
  const result: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const x = xMin + (xMax - xMin) * (i / steps);
    const maxDist = Math.max(1e-10, bandwidth * (xMax - xMin));

    let w0 = 0, w1 = 0, w2 = 0, wy = 0, wxy = 0;
    for (const p of sorted) {
      const u = Math.abs(p.x - x) / maxDist;
      if (u >= 1) continue;
      const w = (1 - u * u * u) ** 3; // tricube kernel
      w0 += w; w1 += w * p.x; w2 += w * p.x * p.x;
      wy += w * p.y; wxy += w * p.x * p.y;
    }

    if (w0 === 0) { result.push([x, 0]); continue; }
    const det = w0 * w2 - w1 * w1;
    if (Math.abs(det) < 1e-12) {
      result.push([x, wy / w0]);
    } else {
      const a = (w2 * wy - w1 * wxy) / det;
      const b = (w0 * wxy - w1 * wy) / det;
      result.push([x, a + b * x]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Confidence bands from a single series (using rolling window std dev)
// ---------------------------------------------------------------------------

export function computeConfidenceBand(
  data: [number, number][],
  windowSize = 5,
  multiplier = 1,
): { upper: [number, number][]; lower: [number, number][] } {
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < data.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(data.length - 1, i + half);
    const vals: number[] = [];
    for (let j = lo; j <= hi; j++) vals.push(data[j]![1]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, vals.length - 1));
    upper.push([data[i]![0], data[i]![1] + sd * multiplier]);
    lower.push([data[i]![0], data[i]![1] - sd * multiplier]);
  }

  return { upper, lower };
}

// ---------------------------------------------------------------------------
// Heat map data generation from correlation matrix
// ---------------------------------------------------------------------------

export function computeCorrelationMatrix(
  series: { key: string; data: [number, number][] }[],
): { labels: string[]; matrix: number[][] } {
  const labels = series.map((s) => s.key);
  const n = series.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { matrix[i]![j] = 1; continue; }
      const a = series[i]!.data.map((d) => d[1]);
      const b = series[j]!.data.map((d) => d[1]);
      const len = Math.min(a.length, b.length);
      const ma = a.slice(0, len).reduce((s, v) => s + v, 0) / len;
      const mb = b.slice(0, len).reduce((s, v) => s + v, 0) / len;
      let cov = 0, va = 0, vb = 0;
      for (let k = 0; k < len; k++) {
        cov += (a[k]! - ma) * (b[k]! - mb);
        va += (a[k]! - ma) ** 2;
        vb += (b[k]! - mb) ** 2;
      }
      const denom = Math.sqrt(va * vb);
      matrix[i]![j] = denom === 0 ? 0 : cov / denom;
    }
  }

  return { labels, matrix };
}
