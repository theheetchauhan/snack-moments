// Small, dependency-free statistics helpers for the dashboards.

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (xs: number[]) => quantile(xs, 0.5);

export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export interface CI {
  estimate: number;
  lo: number;
  hi: number;
  n: number;
}

/** Mean with a normal-approximation 95% CI. */
/**
 * Weighted mean with a 95% CI (Hájek estimator; used for inverse-propensity weighting).
 * The SE uses the linearised (sandwich) variance, so unequal weights widen the interval honestly.
 */
export function weightedMeanCI(xs: number[], ws: number[]): CI {
  const W = ws.reduce((a, b) => a + b, 0);
  if (!xs.length || !W) return { estimate: NaN, lo: NaN, hi: NaN, n: 0 };
  const m = xs.reduce((a, x, i) => a + x * ws[i], 0) / W;
  const v = xs.reduce((a, x, i) => a + ws[i] ** 2 * (x - m) ** 2, 0) / W ** 2;
  const se = Math.sqrt(v);
  return { estimate: m, lo: m - 1.96 * se, hi: m + 1.96 * se, n: xs.length };
}

export function meanCI(xs: number[]): CI {
  const m = mean(xs);
  const se = sd(xs) / Math.sqrt(Math.max(1, xs.length));
  return { estimate: m, lo: m - 1.96 * se, hi: m + 1.96 * se, n: xs.length };
}

/** Welch difference of means (a − b) with a 95% CI. */
export function diffCI(a: number[], b: number[]): CI & { ma: number; mb: number; na: number; nb: number } {
  const ma = mean(a);
  const mb = mean(b);
  const se = Math.sqrt(sd(a) ** 2 / Math.max(1, a.length) + sd(b) ** 2 / Math.max(1, b.length));
  const d = ma - mb;
  return { estimate: d, lo: d - 1.96 * se, hi: d + 1.96 * se, n: a.length + b.length, ma, mb, na: a.length, nb: b.length };
}

export function histogram(xs: number[], lo: number, hi: number, bins: number, fmt: (x: number) => string = (x) => x.toFixed(1)) {
  const w = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ bin: fmt(lo + i * w), from: lo + i * w, count: 0 }));
  for (const x of xs) {
    if (!Number.isFinite(x)) continue;
    const i = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / w)));
    out[i].count++;
  }
  return out;
}

export function countBy<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) {
    const k = key(x);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Plain k-means (deterministic init on spread-out points). */
export function kmeans(points: number[][], k: number, iters = 30): { labels: number[]; centroids: number[][] } {
  if (points.length <= k) return { labels: points.map((_, i) => i), centroids: points };
  const dim = points[0].length;
  const centroids: number[][] = [points[0]];
  while (centroids.length < k) {
    let best = 0;
    let bestD = -1;
    points.forEach((p, i) => {
      const d = Math.min(...centroids.map((c) => dist2(p, c)));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    });
    centroids.push(points[best]);
  }
  let labels = new Array(points.length).fill(0);
  for (let it = 0; it < iters; it++) {
    labels = points.map((p) => {
      let bi = 0;
      let bd = Infinity;
      centroids.forEach((c, i) => {
        const d = dist2(p, c);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      return bi;
    });
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => labels[i] === c);
      if (!members.length) continue;
      centroids[c] = Array.from({ length: dim }, (_, d) => mean(members.map((m) => m[d])));
    }
  }
  return { labels, centroids };
}

export const dist2 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);

/** z-score standardisation per column. */
export function standardise(points: number[][]): number[][] {
  if (!points.length) return points;
  const dim = points[0].length;
  const ms = Array.from({ length: dim }, (_, d) => mean(points.map((p) => p[d])));
  const ss = Array.from({ length: dim }, (_, d) => sd(points.map((p) => p[d])) || 1);
  return points.map((p) => p.map((x, d) => (x - ms[d]) / ss[d]));
}

/** 2-component PCA via power iteration (for the cluster scatter). */
export function pca2(points: number[][]): [number, number][] {
  if (points.length < 3) return points.map((p) => [p[0] ?? 0, p[1] ?? 0]);
  const dim = points[0].length;
  const cov = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (const p of points) for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) cov[i][j] += (p[i] * p[j]) / points.length;
  const comps: number[][] = [];
  const C = cov.map((r) => r.slice());
  for (let c = 0; c < 2; c++) {
    let v: number[] = Array.from({ length: dim }, (_, i) => (i === c ? 1 : 0.5));
    for (let it = 0; it < 60; it++) {
      const nv = C.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
      const norm = Math.sqrt(nv.reduce((s, x) => s + x * x, 0)) || 1;
      v = nv.map((x) => x / norm);
    }
    const lambda = v.reduce((s, x, i) => s + x * C[i].reduce((t, y, j) => t + y * v[j], 0), 0);
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) C[i][j] -= lambda * v[i] * v[j];
    comps.push(v);
  }
  return points.map((p) => [comps[0].reduce((s, x, i) => s + x * p[i], 0), comps[1].reduce((s, x, i) => s + x * p[i], 0)]);
}

export const round = (x: number, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
