/**
 * Expected-time model. Instead of fixed "too fast" cut-offs, every screen gets an
 * expected decision time from its reading load and decision difficulty. We then
 * look at the residual log(actual / expected).
 *
 *   expected = base + reading + options + closeness
 *   - reading:   ~230 words/min on the visible text
 *   - options:   each extra option costs a little comparison time
 *   - closeness: choices near the player's indifference point take longer
 */
export const MS_PER_WORD = 260;
export const BASE_MS = 900;
export const PER_OPTION_MS = 450;
export const CLOSENESS_MS = 2200;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** closeness ∈ [0,1]: 1 when the top two predicted options are tied. */
export function closenessFromPredictive(pred: number[]): number {
  const s = pred.slice().sort((a, b) => b - a);
  if (s.length < 2) return 0;
  return Math.max(0, 1 - (s[0] - s[1]) / Math.max(s[0], 1e-6));
}

export function expectedMs(words: number, nOptions: number, closeness: number): number {
  return BASE_MS + words * MS_PER_WORD + Math.max(0, nOptions - 1) * PER_OPTION_MS + closeness * CLOSENESS_MS;
}

/** log residual against the population model (negative = faster than expected). */
export function residual(actualMs: number, expected: number): number {
  return Math.log(Math.max(actualMs, 50) / expected);
}

/** Rushing threshold: answered in less than ~35% of the expected time. */
export const RUSH_RESIDUAL = Math.log(0.35);

/** Anomaly evidence for CUSUM from one answer (0 = nothing unusual). */
export function anomalyEvidence(opts: {
  residual: number;
  samePositionAsPrevious: boolean;
  chosenPredictiveProb: number;
  nOptions: number;
}): number {
  let e = 0;
  if (opts.residual < RUSH_RESIDUAL) e += 0.9;
  else if (opts.residual < Math.log(0.55)) e += 0.4;
  if (opts.samePositionAsPrevious) e += 0.35;
  // surprising choice under the player's own model
  if (opts.chosenPredictiveProb < 0.6 / opts.nOptions) e += 0.35;
  return e;
}
