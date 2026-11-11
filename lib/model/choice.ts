/**
 * Per-player Bayesian multinomial-logit choice model, approximated with particles.
 *
 * Utility of an option in a moment:
 *   U = -a * price/10 + b_ctx * protein/10 + c * indulgence
 *
 *   a     price sensitivity (per ₹10), > 0
 *   bF    protein value (per 10g) in functional moments (desk, gym, meeting)
 *   bC    protein value (per 10g) in craving moments (late night, movie, road trip)
 *   c     value of indulgence / taste
 *
 * Willingness to pay for protein in a context = b_ctx / a  (₹ per gram).
 * A small lapse rate makes the model robust to the occasional mis-tap.
 */
import { normal, rngFrom, type Rng } from "@/lib/rng";
import type { ContextKind, Item } from "@/lib/study/types";
import { getMoment, getSnack } from "@/lib/study/protein";

export const PARAMS = ["a", "bF", "bC", "c"] as const;
export type ParamName = (typeof PARAMS)[number];

export interface Particles {
  a: Float64Array;
  bF: Float64Array;
  bC: Float64Array;
  c: Float64Array;
  w: Float64Array; // normalised weights
}

export const LAPSE = 0.06;
export const N_PARTICLES = 2000;

export const PRIOR = {
  logA: { mean: Math.log(0.6), sd: 0.6 },
  bF: { mean: 0.6, sd: 0.8 },
  bC: { mean: 0.3, sd: 0.8 },
  c: { mean: 0.8, sd: 1.0 },
};

export interface Observation {
  itemId: string;
  item: Item;
  chosenIndex: number; // index into item.options (canonical order, not screen position)
}

export function samplePrior(rng: Rng, n = N_PARTICLES): Particles {
  const p: Particles = {
    a: new Float64Array(n),
    bF: new Float64Array(n),
    bC: new Float64Array(n),
    c: new Float64Array(n),
    w: new Float64Array(n).fill(1 / n),
  };
  for (let i = 0; i < n; i++) {
    p.a[i] = Math.exp(normal(rng, PRIOR.logA.mean, PRIOR.logA.sd));
    p.bF[i] = normal(rng, PRIOR.bF.mean, PRIOR.bF.sd);
    p.bC[i] = normal(rng, PRIOR.bC.mean, PRIOR.bC.sd);
    p.c[i] = normal(rng, PRIOR.c.mean, PRIOR.c.sd);
  }
  return p;
}

export interface OptionFeatures {
  price: number;
  protein: number;
  indulgence: number;
}

export function itemFeatures(item: Item): { ctx: ContextKind; feats: OptionFeatures[] } {
  const ctx = getMoment(item.momentId).context;
  const feats = item.options.map((o) => {
    const s = getSnack(o.snackId);
    return { price: o.price, protein: s.proteinG, indulgence: s.indulgence };
  });
  return { ctx, feats };
}

/** Choice probabilities for one parameter vector. */
export function choiceProbs(
  theta: { a: number; bF: number; bC: number; c: number },
  ctx: ContextKind,
  feats: OptionFeatures[],
  lapse = LAPSE,
): number[] {
  const b = ctx === "functional" ? theta.bF : theta.bC;
  const u = feats.map((f) => -theta.a * (f.price / 10) + b * (f.protein / 10) + theta.c * f.indulgence);
  const m = Math.max(...u);
  const e = u.map((x) => Math.exp(x - m));
  const s = e.reduce((x, y) => x + y, 0);
  const k = feats.length;
  return e.map((x) => (1 - lapse) * (x / s) + lapse / k);
}

/** Per-particle probability matrix [option][particle]. Allocation-free inner loop (hot path). */
function probMatrix(p: Particles, item: Item): Float64Array[] {
  const { ctx, feats } = itemFeatures(item);
  const n = p.w.length;
  const k = feats.length;
  const out: Float64Array[] = feats.map(() => new Float64Array(n));
  const pr = new Float64Array(k);
  const pt = new Float64Array(k);
  const ind = new Float64Array(k);
  for (let j = 0; j < k; j++) {
    pr[j] = feats[j].price / 10;
    pt[j] = feats[j].protein / 10;
    ind[j] = feats[j].indulgence;
  }
  const bArr = ctx === "functional" ? p.bF : p.bC;
  const u = new Float64Array(k);
  const lapseShare = LAPSE / k;
  for (let i = 0; i < n; i++) {
    const a = p.a[i];
    const b = bArr[i];
    const c = p.c[i];
    let m = -Infinity;
    for (let j = 0; j < k; j++) {
      u[j] = -a * pr[j] + b * pt[j] + c * ind[j];
      if (u[j] > m) m = u[j];
    }
    let s = 0;
    for (let j = 0; j < k; j++) {
      u[j] = Math.exp(u[j] - m);
      s += u[j];
    }
    for (let j = 0; j < k; j++) out[j][i] = (1 - LAPSE) * (u[j] / s) + lapseShare;
  }
  return out;
}

export function ess(w: Float64Array): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * w[i];
  return 1 / s;
}

function weightedMeanSd(x: Float64Array, w: Float64Array) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m += w[i] * x[i];
  let v = 0;
  for (let i = 0; i < x.length; i++) v += w[i] * (x[i] - m) ** 2;
  return { mean: m, sd: Math.sqrt(v) };
}

/** Systematic resampling + Gaussian jitter (keeps particle diversity). */
function resampleMove(p: Particles, rng: Rng): Particles {
  const n = p.w.length;
  const idx = new Int32Array(n);
  const u0 = rng() / n;
  let c = p.w[0];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const u = u0 + i / n;
    while (u > c && j < n - 1) {
      j++;
      c += p.w[j];
    }
    idx[i] = j;
  }
  const sds = {
    logA: weightedMeanSd(p.a.map(Math.log), p.w).sd,
    bF: weightedMeanSd(p.bF, p.w).sd,
    bC: weightedMeanSd(p.bC, p.w).sd,
    c: weightedMeanSd(p.c, p.w).sd,
  };
  const h = 0.35; // jitter bandwidth (fraction of posterior sd)
  const out: Particles = {
    a: new Float64Array(n),
    bF: new Float64Array(n),
    bC: new Float64Array(n),
    c: new Float64Array(n),
    w: new Float64Array(n).fill(1 / n),
  };
  for (let i = 0; i < n; i++) {
    const k = idx[i];
    out.a[i] = Math.exp(Math.log(p.a[k]) + normal(rng, 0, h * sds.logA));
    out.bF[i] = p.bF[k] + normal(rng, 0, h * sds.bF);
    out.bC[i] = p.bC[k] + normal(rng, 0, h * sds.bC);
    out.c[i] = p.c[k] + normal(rng, 0, h * sds.c);
  }
  return out;
}

export function update(p: Particles, obs: Observation, rng: Rng): Particles {
  const P = probMatrix(p, obs.item)[obs.chosenIndex];
  const n = p.w.length;
  let s = 0;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = p.w[i] * P[i];
    s += w[i];
  }
  for (let i = 0; i < n; i++) w[i] /= s;
  const next = { ...p, w };
  return ess(w) < n / 3 ? resampleMove(next, rng) : next;
}

/** Rebuilds the posterior from scratch for a session (deterministic per session id). */
export function posteriorFor(sessionKey: string, observations: Observation[]): Particles {
  const rng = rngFrom(`particles:${sessionKey}`);
  let p = samplePrior(rng);
  for (const o of observations) p = update(p, o, rng);
  return p;
}

const entropy = (ps: number[]) => -ps.reduce((s, x) => (x > 0 ? s + x * Math.log(x) : s), 0);

/** Posterior predictive probability of each option. */
export function predictive(p: Particles, item: Item): number[] {
  const M = probMatrix(p, item);
  return M.map((row) => {
    let s = 0;
    for (let i = 0; i < row.length; i++) s += p.w[i] * row[i];
    return s;
  });
}

/** Expected information gain (mutual information between the answer and θ), in nats. */
export function expectedInfoGain(p: Particles, item: Item): number {
  const M = probMatrix(p, item);
  const n = p.w.length;
  const marg = M.map((row) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += p.w[i] * row[i];
    return s;
  });
  let condH = 0;
  for (let i = 0; i < n; i++) {
    let h = 0;
    for (let k = 0; k < M.length; k++) {
      const x = M[k][i];
      if (x > 0) h -= x * Math.log(x);
    }
    condH += p.w[i] * h;
  }
  return entropy(marg) - condH;
}

function weightedQuantiles(x: number[], w: number[], qs: number[]): number[] {
  const idx = x.map((_, i) => i).sort((i, j) => x[i] - x[j]);
  const out: number[] = [];
  let c = 0;
  let qi = 0;
  for (const i of idx) {
    c += w[i];
    while (qi < qs.length && c >= qs[qi]) {
      out.push(x[i]);
      qi++;
    }
  }
  while (out.length < qs.length) out.push(x[idx[idx.length - 1]]);
  return out;
}

export interface Interval {
  median: number;
  lo: number;
  hi: number;
}

export interface PosteriorSummary {
  mean: Record<ParamName, number>;
  sd: Record<ParamName, number>;
  wtpFunctional: Interval; // ₹ per gram
  wtpCraving: Interval;
  /** P(protein valued more in functional than craving moments) */
  pContextSwitch: number;
  driver: DriverProfile;
  importance: { price: number; protein: number; taste: number };
  /** 40 posterior draws for market simulation */
  draws: { a: number; bF: number; bC: number; c: number }[];
  ess: number;
}

export type DriverProfile = "price-led" | "taste-led" | "protein-led" | "context-switcher" | "undecided";

const clampWtp = (v: number) => Math.max(-5, Math.min(15, v));

export function summarise(p: Particles, rng: Rng = rngFrom("summary")): PosteriorSummary {
  const mean = {} as Record<ParamName, number>;
  const sd = {} as Record<ParamName, number>;
  for (const k of PARAMS) {
    const r = weightedMeanSd(p[k], p.w);
    mean[k] = r.mean;
    sd[k] = r.sd;
  }
  const w = Array.from(p.w);
  const wF = Array.from(p.bF).map((b, i) => clampWtp(b / p.a[i]));
  const wC = Array.from(p.bC).map((b, i) => clampWtp(b / p.a[i]));
  const [fLo, fMed, fHi] = weightedQuantiles(wF, w, [0.1, 0.5, 0.9]);
  const [cLo, cMed, cHi] = weightedQuantiles(wC, w, [0.1, 0.5, 0.9]);
  let pSwitch = 0;
  for (let i = 0; i < p.w.length; i++) if (p.bF[i] - p.bC[i] > 0.4) pSwitch += p.w[i];

  // Importance = how much each attribute can move utility across its realistic range.
  const importance = {
    price: Math.abs(mean.a) * 5, // typical within-choice price gap ≈ ₹50 = 5 units of ₹10
    protein: Math.max(0, (mean.bF + mean.bC) / 2) * 2.3, // 2g → 25g ≈ 2.3 units of 10g
    taste: Math.max(0, mean.c) * 0.85, // indulgence 0.15 → 1.0
  };
  // Classify relative to a typical player (the prior), because short adaptive sessions shrink
  // every estimate towards the prior: what matters is which attribute moved furthest from it.
  const PRIOR_IMPORTANCE = { price: 0.72 * 5, protein: ((PRIOR.bF.mean + PRIOR.bC.mean) / 2) * 2.3, taste: PRIOR.c.mean * 0.85 };
  const rel = {
    price: importance.price / PRIOR_IMPORTANCE.price,
    protein: importance.protein / PRIOR_IMPORTANCE.protein,
    taste: importance.taste / PRIOR_IMPORTANCE.taste,
  };
  let driver: DriverProfile = "undecided";
  const top = Object.entries(rel).sort((x, y) => y[1] - x[1]);
  if (pSwitch > 0.75 && mean.bF - mean.bC > 0.6) driver = "context-switcher";
  else if (top[0][1] > top[1][1] * 1.15) driver = `${top[0][0]}-led` as DriverProfile;

  const draws: PosteriorSummary["draws"] = [];
  const cdf: number[] = [];
  let acc = 0;
  for (let i = 0; i < p.w.length; i++) cdf.push((acc += p.w[i]));
  for (let d = 0; d < 40; d++) {
    const u = rng();
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    draws.push({ a: p.a[lo], bF: p.bF[lo], bC: p.bC[lo], c: p.c[lo] });
  }

  return {
    mean,
    sd,
    wtpFunctional: { median: fMed, lo: fLo, hi: fHi },
    wtpCraving: { median: cMed, lo: cLo, hi: cHi },
    pContextSwitch: pSwitch,
    driver,
    importance,
    draws,
    ess: ess(p.w),
  };
}

export const PRIOR_SD: Record<ParamName, number> = {
  a: 0.45, // approx sd of exp(N(log .6, .6))
  bF: PRIOR.bF.sd,
  bC: PRIOR.bC.sd,
  c: PRIOR.c.sd,
};
