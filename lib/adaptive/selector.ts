/**
 * Adaptive item selection ("like the GRE", but for preferences).
 *
 * Next item = softmax over (expected information gain − practical cost), where cost
 * penalises repeating a moment, repeating snacks and an unbalanced context mix.
 * Quality probes (repeat / dominated) are injected when the CUSUM anomaly
 * accumulator fires, and otherwise on a light schedule so everyone gets checked.
 */
import { expectedInfoGain, PRIOR_SD, type Particles } from "@/lib/model/choice";
import { getItem, getMoment, makeDominatedItem, PROTEIN_STUDY } from "@/lib/study/protein";
import type { AnchorArm, Item } from "@/lib/study/types";
import type { Rng } from "@/lib/rng";

export const MIN_ROUNDS = 4;
export const MAX_ROUNDS = 10;
export const CUSUM_H = 1.6;
const SOFTMAX_TAU = 0.025;
const CANDIDATE_SAMPLE = 45;

export interface AnsweredRef {
  itemId: string;
  momentId: string;
  probe: Item["probe"];
}

export interface SelectorInput {
  particles: Particles;
  answered: AnsweredRef[];
  cusum: number;
  anchorArm: AnchorArm;
  rng: Rng;
}

export type SelectReason =
  | "anchor-start"
  | "max-information"
  | "cusum-probe"
  | "scheduled-probe"
  | "stop-converged"
  | "stop-max-rounds"
  | "stop-low-information";

export interface SelectorResult {
  item: Item | null;
  reason: SelectReason;
  eig?: number;
  converged: number; // 0..1 how far posterior sd has shrunk vs prior
  candidatesConsidered?: number;
}

function wsd(x: Float64Array, w: Float64Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) m += w[i] * x[i];
  let v = 0;
  for (let i = 0; i < x.length; i++) v += w[i] * (x[i] - m) ** 2;
  return Math.sqrt(v);
}

/** 0..1: how much the posterior has tightened vs the prior (cheap: weighted sds only). */
export function convergence(p: Particles): number {
  const ratios = (["a", "bF", "bC", "c"] as const).map((k) => wsd(p[k], p.w) / PRIOR_SD[k]);
  const meanRatio = ratios.reduce((x, y) => x + y, 0) / ratios.length;
  return Math.max(0, Math.min(1, 1 - meanRatio));
}

function highPremiumMultiplier(item: Item): number {
  const hi = item.options[item.options.length - 1];
  const base = PROTEIN_STUDY.snacks.find((s) => s.id === hi.snackId)!.basePrice;
  return hi.price / base;
}

export function selectNext(input: SelectorInput): SelectorResult {
  const { particles, answered, cusum, anchorArm, rng } = input;
  const n = answered.length;
  const conv = convergence(particles);
  const repeatDone = answered.some((a) => a.probe === "repeat");
  const dominatedDone = answered.some((a) => a.probe === "dominated");
  const bankAnswered = answered.filter((a) => a.probe === "none");
  const contexts = new Set(answered.map((a) => getMoment(a.momentId).context));

  if (n >= MAX_ROUNDS) return { item: null, reason: "stop-max-rounds", converged: conv };

  // 1) first item: randomised anchor (low vs high starting protein premium)
  if (n === 0) {
    const desk = PROTEIN_STUDY.items.filter((i) => i.momentId === "desk_430" && i.format === "triad");
    // low anchor = cheapest protein premium on offer, high anchor = the priciest (prices are rounded)
    const sorted = desk.slice().sort((x, y) => highPremiumMultiplier(x) - highPremiumMultiplier(y));
    const third = Math.max(1, Math.floor(sorted.length / 3));
    const pool = anchorArm === "low" ? sorted.slice(0, third) : sorted.slice(-third);
    return { item: pool[Math.floor(rng() * pool.length)], reason: "anchor-start", converged: conv };
  }

  // 2) CUSUM-triggered probe
  if (cusum > CUSUM_H && (!repeatDone || !dominatedDone)) {
    if (!repeatDone && bankAnswered.length >= 2) {
      return { item: getItem(`repeat::${bankAnswered[0].itemId}`), reason: "cusum-probe", converged: conv };
    }
    if (!dominatedDone) {
      const m = PROTEIN_STUDY.moments[Math.floor(rng() * PROTEIN_STUDY.moments.length)];
      return { item: makeDominatedItem(m.id, rng), reason: "cusum-probe", converged: conv };
    }
  }

  // 3) scheduled probes so every session carries checks
  if (!dominatedDone && n === 2) {
    const m = PROTEIN_STUDY.moments[Math.floor(rng() * PROTEIN_STUDY.moments.length)];
    return { item: makeDominatedItem(m.id, rng), reason: "scheduled-probe", converged: conv };
  }
  if (!repeatDone && n >= 5 && bankAnswered.length >= 2) {
    return { item: getItem(`repeat::${bankAnswered[0].itemId}`), reason: "scheduled-probe", converged: conv };
  }

  // 4) stopping rule (after minimum, both contexts covered, checks done)
  const bothContexts = contexts.has("functional") && contexts.has("craving");
  if (n >= MIN_ROUNDS && bothContexts && repeatDone && conv >= 0.5) {
    return { item: null, reason: "stop-converged", converged: conv };
  }

  // 5) information-maximising choice with practical costs, softmax-sampled
  const seen = new Set(answered.map((a) => a.itemId.replace(/^repeat::/, "")));
  const momentCount = new Map<string, number>();
  for (const a of answered) momentCount.set(a.momentId, (momentCount.get(a.momentId) ?? 0) + 1);
  const fCount = answered.filter((a) => getMoment(a.momentId).context === "functional").length;
  const cCount = n - fCount;

  let pool = PROTEIN_STUDY.items.filter((i) => !seen.has(i.id));
  // sample a subset for speed (and extra exposure control)
  pool = pool
    .map((i) => ({ i, r: rng() }))
    .sort((x, y) => x.r - y.r)
    .slice(0, CANDIDATE_SAMPLE)
    .map((x) => x.i);

  const scored = pool.map((item) => {
    const eig = expectedInfoGain(particles, item);
    const ctx = getMoment(item.momentId).context;
    const momentPenalty = 0.06 * (momentCount.get(item.momentId) ?? 0);
    const balance = ctx === "functional" ? (fCount - cCount) * 0.03 : (cCount - fCount) * 0.03;
    return { item, eig, score: eig - momentPenalty - Math.max(0, balance) };
  });
  scored.sort((x, y) => y.score - x.score);
  const best = scored[0];

  // fatigue-aware stop: information has run dry relative to round cost
  if (n >= MIN_ROUNDS && bothContexts && repeatDone && best.eig < 0.04 + 0.01 * n) {
    return { item: null, reason: "stop-low-information", converged: conv };
  }

  const top = scored.slice(0, 8);
  const exps = top.map((s) => Math.exp((s.score - best.score) / SOFTMAX_TAU));
  const total = exps.reduce((a, b) => a + b, 0);
  let u = rng() * total;
  let chosen = top[0];
  for (let i = 0; i < top.length; i++) {
    u -= exps[i];
    if (u <= 0) {
      chosen = top[i];
      break;
    }
  }
  return {
    item: chosen.item,
    reason: "max-information",
    eig: chosen.eig,
    converged: conv,
    candidatesConsidered: pool.length,
  };
}

/** Updates the CUSUM accumulator with this answer's anomaly evidence. */
export function updateCusum(prev: number, evidence: number, k = 0.5): number {
  return Math.max(0, prev + evidence - k);
}
