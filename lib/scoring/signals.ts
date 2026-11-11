/**
 * Response-quality and insight signals.
 *
 * Two families, kept strictly apart:
 *   NOISE      – evidence the answers are careless or mechanical. Only these lower quality.
 *   DIVERGENCE – gaps between what people say and what they do. These are findings, never penalties.
 */
import { getItem, getSnack } from "@/lib/study/protein";
import { getMoment } from "@/lib/study/protein";
import { RUSH_RESIDUAL } from "@/lib/timing/expected";
import { modelImpliedPrice } from "@/lib/model/price";
import type { AnswerRecord, SessionData } from "@/lib/session/types";

export const FORMULA_VERSION = "quality-v1.3";

export type NoiseKey =
  | "speed"
  | "position"
  | "rhythm"
  | "repeat"
  | "dominated"
  | "monotonicity"
  | "surprise"
  | "effort"
  | "gut"
  | "week"
  | "text";

export interface Signal {
  key: NoiseKey;
  label: string;
  severity: number; // 0..1
  weight: number; // max points it can remove
  weak: boolean; // weak signals only count alongside a strong one
  detail: string;
  value: number | null;
}

export const NOISE_WEIGHTS: Record<NoiseKey, { weight: number; weak: boolean; label: string }> = {
  speed: { weight: 36, weak: false, label: "Rushing (vs expected time)" },
  position: { weight: 22, weak: false, label: "Same screen position" },
  rhythm: { weight: 8, weak: true, label: "Rhythmic tapping pattern" },
  repeat: { weight: 18, weak: false, label: "Flipped on repeat item" },
  dominated: { weight: 25, weak: false, label: "Picked a dominated option" },
  monotonicity: { weight: 10, weak: false, label: "Paid more for less protein" },
  surprise: { weight: 18, weak: false, label: "Choices fit no consistent preference" },
  effort: { weight: 8, weak: true, label: "Flat timing on hard vs easy choices" },
  gut: { weight: 22, weak: false, label: "Quick games answered faster than readable" },
  week: { weight: 6, weak: true, label: "Snack-week total doesn't match its own moments" },
  text: { weight: 12, weak: false, label: "Open text looks low-effort / pasted" },
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function corr(x: number[], y: number[]): number {
  if (x.length < 3) return 0;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Normalised Lempel-Ziv complexity of a symbol sequence (low = repetitive). */
export function lzComplexity(seq: number[]): number {
  if (seq.length < 2) return 1;
  const s = seq.join("");
  let i = 0;
  let c = 0;
  while (i < s.length) {
    let l = 1;
    while (i + l <= s.length && s.slice(0, i).includes(s.slice(i, i + l)) && i + l < s.length) l++;
    c++;
    i += l;
  }
  const n = s.length;
  return c / (n / Math.log(n) / Math.log(3) || 1);
}

export function positionEntropy(positions: number[], k = 3): number {
  const counts = new Array(k).fill(0);
  positions.forEach((p) => counts[p]++);
  const n = positions.length || 1;
  return -counts.reduce((s, c) => (c ? s + (c / n) * Math.log(c / n) : s), 0) / Math.log(k);
}

function isPeriodic(seq: number[], period: number): boolean {
  if (seq.length < period * 3) return false;
  for (let i = period; i < seq.length; i++) if (seq[i] !== seq[i - period]) return false;
  return new Set(seq).size > 1;
}

interface Tradeoff {
  ctx: string;
  rate: number; // ₹ per gram
  accepted: boolean;
}

/** Protein-for-money trade-offs revealed by each choice (taste held roughly equal). */
export function tradeoffs(answers: AnswerRecord[]): Tradeoff[] {
  const out: Tradeoff[] = [];
  for (const a of answers) {
    if (a.probe === "dominated") continue;
    const item = getItem(a.itemId);
    const ctx = getMoment(item.momentId).context;
    const ch = item.options[a.chosenIndex];
    const chS = getSnack(ch.snackId);
    item.options.forEach((o, idx) => {
      if (idx === a.chosenIndex) return;
      const s = getSnack(o.snackId);
      if (Math.abs(s.indulgence - chS.indulgence) > 0.35) return;
      const dP = chS.proteinG - s.proteinG;
      const dR = ch.price - o.price;
      if (dP > 0 && dR > 0) out.push({ ctx, rate: dR / dP, accepted: true });
      if (dP < 0 && dR < 0) out.push({ ctx, rate: -dR / -dP, accepted: false });
    });
  }
  return out;
}

export function computeNoise(s: SessionData, textVerdict?: { lowEffort: number; reason: string } | null): Signal[] {
  const ans = s.answers;
  const n = ans.length;
  const sig = (key: NoiseKey, severity: number, detail: string, value: number | null): Signal => ({
    key,
    label: NOISE_WEIGHTS[key].label,
    weight: NOISE_WEIGHTS[key].weight,
    weak: NOISE_WEIGHTS[key].weak,
    severity: Math.max(0, Math.min(1, severity)),
    detail,
    value,
  });
  const out: Signal[] = [];

  // speed
  const rushed = ans.filter((a) => a.residual < RUSH_RESIDUAL).length;
  const rushFrac = n ? rushed / n : 0;
  out.push(sig("speed", rushFrac * 2, `${rushed}/${n} choices made in under 35% of the expected time`, rushFrac));

  // position bias
  const pos = ans.map((a) => a.position);
  const counts = [0, 0, 0];
  pos.forEach((p) => counts[p]++);
  const maxShare = n ? Math.max(...counts) / n : 0;
  const posSev = n >= 5 ? (maxShare >= 0.85 ? 1 : maxShare >= 0.7 ? 0.5 : 0) : 0;
  out.push(
    sig("position", posSev, `${Math.round(maxShare * 100)}% of taps on the same screen position (options were shuffled)`, maxShare),
  );

  // rhythm (weak)
  const periodic = isPeriodic(pos, 2) || isPeriodic(pos, 3);
  const lz = lzComplexity(pos);
  out.push(sig("rhythm", periodic ? 1 : 0, periodic ? "Tap positions repeat in a fixed cycle" : `LZ complexity ${lz.toFixed(2)}`, lz));

  // repeat probe
  const rep = ans.find((a) => a.probe === "repeat");
  if (rep) {
    const orig = ans.find((a) => a.itemId === getItem(rep.itemId).repeatOf);
    const flipped = orig ? orig.chosenIndex !== rep.chosenIndex : false;
    // A flip on a genuine toss-up is normal; a flip on a choice the player's own model
    // was confident about is noise. Severity scales with that confidence.
    const conf = Math.max(orig?.fitProb ?? 0.5, rep.fitProb ?? 0.5);
    const sev = flipped ? Math.max(0, Math.min(1, (conf - 0.45) / 0.3)) : 0;
    out.push(
      sig(
        "repeat",
        sev,
        flipped ? `Chose a different snack when the same choice came back (model confidence ${conf.toFixed(2)})` : "Same choice on the repeat item",
        flipped ? 1 : 0,
      ),
    );
  } else out.push(sig("repeat", 0, "No repeat item shown", null));

  // dominated probe
  const dom = ans.find((a) => a.probe === "dominated");
  if (dom) {
    const item = getItem(dom.itemId);
    const failed = dom.chosenIndex === item.dominatedIndex;
    out.push(sig("dominated", failed ? 1 : 0, failed ? "Picked the same snack at a higher price" : "Avoided the overpriced duplicate", failed ? 1 : 0));
  } else out.push(sig("dominated", 0, "No dominated item shown", null));

  // monotonicity across choices in the same context
  const tr = tradeoffs(ans);
  let viol = 0;
  let comps = 0;
  for (const acc of tr.filter((t) => t.accepted)) {
    for (const rej of tr.filter((t) => !t.accepted && t.ctx === acc.ctx)) {
      comps++;
      if (rej.rate < acc.rate * 0.6) viol++;
    }
  }
  const monoFrac = comps ? viol / comps : 0;
  out.push(
    sig("monotonicity", comps >= 3 ? Math.max(0, monoFrac - 0.15) * 1.4 : 0, `${viol}/${comps} trade-off pairs where a cheaper protein deal was refused after a pricier one was accepted`, monoFrac),
  );

  // posterior-predictive fit (in-sample, final posterior)
  const fitted = ans.filter((a) => a.probe === "none" && a.fitProb != null);
  const avgFit = mean(fitted.map((a) => a.fitProb!));
  const chance = mean(fitted.map((a) => 1 / a.order.length));
  const ratio = chance ? avgFit / chance : 1;
  const surpriseSev = fitted.length >= 3 ? (ratio <= 1.05 ? 1 : ratio <= 1.15 ? 0.5 : 0) : 0;
  out.push(sig("surprise", surpriseSev, `Own preference model explains choices at ${ratio.toFixed(2)}× chance (≈1.0 = random)`, ratio));

  // effort fit (weak): harder choices should take longer
  const r = corr(
    ans.map((a) => a.closeness),
    ans.map((a) => Math.log(a.latencyMs)),
  );
  const medRes = ans.map((a) => a.residual).sort((a, b) => a - b)[Math.floor(n / 2)] ?? 0;
  const effortSev = n >= 4 && r < 0.05 && medRes < Math.log(0.6) ? 1 : 0;
  out.push(sig("effort", effortSev, `Time vs difficulty correlation ${r.toFixed(2)}`, r));

  // Quick games (Gut Check swipes + Label Detective answers): an independent task, so rushing
  // here is separate evidence from rushing in the choice rounds. Too fast to read = strong signal.
  const sw = s.gut?.swipes ?? [];
  const lab = s.label?.questions.filter((q) => q.answer != null) ?? [];
  if (sw.length >= 6 || lab.length) {
    const rights = sw.filter((x) => x.right).length;
    const allSame = sw.length >= 6 && (rights === 0 || rights === sw.length);
    const medMs = sw.length ? sw.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(sw.length / 2)] : 9999;
    const labFast = lab.length ? lab.filter((q) => q.ms < 1000).length / lab.length : 0;
    let sev = 0;
    if (medMs < 350) sev += 0.6;
    if (labFast >= 0.5) sev += 0.6;
    if (allSame) sev += 0.3;
    out.push(
      sig(
        "gut",
        sev,
        `Gut Check: ${rights}/${sw.length} right, median ${medMs === 9999 ? "–" : medMs}ms/card · Label Detective: ${Math.round(labFast * 100)}% answered < 1s`,
        medMs,
      ),
    );
  } else out.push(sig("gut", 0, "Quick games not played", null));

  // My Snack Week (weak): the "whole week" answer is asked first, then each moment.
  // Rough people are off by a bit; a wildly different total suggests answers weren't read.
  const c = s.week?.consistency;
  if (c != null && s.week) {
    const sev = c > 2.5 || c < 0.4 ? 1 : c > 1.8 || c < 0.55 ? 0.5 : 0;
    out.push(sig("week", sev, `Moments add up to ${c.toFixed(2)}× the whole-week answer (≈1 = consistent)`, c));
  } else out.push(sig("week", 0, "My Snack Week not played", null));

  // open text
  if (textVerdict) out.push(sig("text", textVerdict.lowEffort, textVerdict.reason, textVerdict.lowEffort));
  else if (s.reality?.pasted) out.push(sig("text", 0.6, "Text was pasted rather than typed", 1));
  else out.push(sig("text", 0, s.reality?.why ? "Typed answer" : "No open text", null));

  return out;
}

export type Band = "green" | "amber" | "red";

export interface QualityResult {
  score: number;
  band: Band;
  weight: number;
  strongSignals: number;
  signals: Signal[];
  version: string;
}

export function qualityScore(signals: Signal[]): QualityResult {
  const strong = signals.filter((s) => !s.weak && s.severity >= 0.5).length;
  const anyStrong = strong > 0;
  let penalty = 0;
  for (const s of signals) {
    if (s.weak && !anyStrong) continue; // weak evidence only counts with corroboration
    penalty += s.weight * s.severity;
  }
  const score = Math.round(Math.max(0, Math.min(100, 100 - penalty)));
  let band: Band = score >= 70 ? "green" : score >= 40 ? "amber" : "red";
  if (band === "red" && strong < 2) band = "amber"; // never red on a single signal
  const weight = band === "green" ? 1 : band === "red" ? 0 : Math.max(0.3, Math.min(0.9, 0.3 + ((score - 30) / 40) * 0.6));
  return { score, band, weight: Number(weight.toFixed(2)), strongSignals: strong, signals, version: FORMULA_VERSION };
}

export interface EngagementResult {
  score: number;
  parts: { completion: number; healthyTime: number; depth: number; focus: number; fatigue: number };
  fatigueSlope: number;
}

export function engagementScore(s: SessionData): EngagementResult {
  const ans = s.answers;
  const completion = s.status === "completed" ? 35 : Math.min(25, ans.length * 3);
  const healthyFrac = ans.length ? ans.filter((a) => a.residual > Math.log(0.45) && a.residual < Math.log(4)).length / ans.length : 0;
  const healthyTime = 25 * healthyFrac;
  const depthAvg = ans.length ? mean(ans.map((a) => Math.min(3, a.focusCount + a.changes))) : 0;
  const depth = 15 * Math.min(1, depthAvg / 1.2);
  const focus = 15 * Math.max(0, 1 - s.counters.hidden / 3);
  // fatigue: slope of residual over rounds (getting much faster/sloppier late = fatigue)
  const xs = ans.map((a) => a.round);
  const ys = ans.map((a) => a.residual);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  const slope = den ? num / den : 0;
  const fatigue = slope > -0.08 ? 10 : slope > -0.2 ? 5 : 0;
  const score = Math.round(completion + healthyTime + depth + focus + fatigue);
  return { score, parts: { completion, healthyTime, depth, focus, fatigue }, fatigueSlope: slope };
}

// ---------------- Divergence (insight, never a penalty) ----------------

export interface Divergence {
  revealedIndex: number; // 1..5 scale, from choices
  stated: number | null;
  sayDoGap: number | null; // stated - revealed
  shelfProteinShare: number | null; // 0..1 of ₹ spent on virtuous snacks
  choiceVsShelf: number | null; // revealed(0..1) - shelf share
  crowdGuess: number | null;
  selfVsCrowd: number | null; // stated(0..100) - crowd guess (positive = "I care more than others")
  squeezeProteinCutShare: number | null; // share of ₹ removed that was protein snacks
  contextGap: number | null; // ₹/g functional − craving
  proteinPickRate: number; // share of choices taking the highest-protein option
  gutProteinAppeal: number | null; // share of protein snacks swiped right in Gut Check
  gutIndulgentAppeal: number | null;
  gutVsChoice: number | null; // gut protein appeal − considered protein pick rate
  labelProteinCorrect: boolean | null; // Label Detective: recalled protein grams
  labelPriceCorrect: boolean | null; // Label Detective: recalled price
  proteinRateFunctional: number | null; // empirical protein pick rate at desk / gym / meeting
  proteinRateCraving: number | null; // … late night / movie / road trip
  pContextSwitch: number | null;
  firstPeek: string | null; // Peek & Pick: attribute looked at first
  proteinPeeked: boolean | null; // ever checked protein when it was hidden
  peeks: number | null;
  bidFunctional: number | null; // Bid It: max ₹ for a protein bar after the gym
  bidCraving: number | null; // … at 11pm
  bidVsModelFunctional: number | null; // bid − model-implied price (₹)
  duelProteinRate: number | null; // protein pick rate in head-to-head duels
  triadProteinRate: number | null; // protein pick rate in 3-card triads
  barProteinShare: number | null; // Build-a-Bar: share of protein among protein/taste/price points
  barProteinKept: number | null; // share of protein points kept through the cost squeeze
  designVsChoice: number | null; // bar protein share − protein importance from choices (+ = designs "healthier" than they choose)
  weekSnacks: number | null; // My Snack Week: snack moments per week
  weekFunctionalShare: number | null; // share of those moments that are functional (desk / gym / meeting)
}

export function revealedIndex(answers: AnswerRecord[]): { index: number; pickRate: number } {
  const bank = answers.filter((a) => a.probe !== "dominated");
  if (!bank.length) return { index: 3, pickRate: 0 };
  let rankSum = 0;
  let top = 0;
  for (const a of bank) {
    const item = getItem(a.itemId);
    const prot = item.options.map((o) => getSnack(o.snackId).proteinG);
    const sorted = [...new Set(prot)].sort((x, y) => x - y);
    const r = sorted.length > 1 ? sorted.indexOf(prot[a.chosenIndex]) / (sorted.length - 1) : 0.5;
    rankSum += r;
    if (prot[a.chosenIndex] === Math.max(...prot)) top++;
  }
  return { index: 1 + 4 * (rankSum / bank.length), pickRate: top / bank.length };
}

export function computeDivergence(s: SessionData): Divergence {
  const { index, pickRate } = revealedIndex(s.answers);
  let shelfShare: number | null = null;
  let squeezeShare: number | null = null;
  if (s.shelf) {
    const priceOf = new Map(s.shelf.prices.map((p) => [p.snackId, p.price]));
    let tot = 0;
    let prot = 0;
    for (const [id, q] of Object.entries(s.shelf.basket)) {
      const v = (priceOf.get(id) ?? 0) * q;
      tot += v;
      if (getSnack(id).virtuous) prot += v;
    }
    shelfShare = tot ? prot / tot : null;
    const rem = s.shelf.removed;
    const remTot = rem.reduce((a, r) => a + r.price, 0);
    squeezeShare = remTot ? rem.filter((r) => getSnack(r.snackId).virtuous).reduce((a, r) => a + r.price, 0) / remTot : null;
  }
  const stated = s.stated;
  const revealed01 = (index - 1) / 4;
  const sw = s.gut?.swipes ?? [];
  const virt = sw.filter((x) => getSnack(x.snackId).virtuous);
  const nonV = sw.filter((x) => !getSnack(x.snackId).virtuous);
  const gutProtein = virt.length ? virt.filter((x) => x.right).length / virt.length : null;
  const gutIndulgent = nonV.length ? nonV.filter((x) => x.right).length / nonV.length : null;
  const lq = s.label?.questions ?? [];
  const lp = lq.find((q) => q.kind === "protein");
  const lpr = lq.find((q) => q.kind === "price");
  const isTop = (a: AnswerRecord) => {
    const it = getItem(a.itemId);
    const prot = it.options.map((o) => getSnack(o.snackId).proteinG);
    return prot[a.chosenIndex] === Math.max(...prot);
  };
  const ctxRate = (ctx: "functional" | "craving") => {
    const xs = s.answers.filter((a) => a.probe !== "dominated" && getMoment(a.momentId).context === ctx);
    return xs.length >= 2 ? xs.filter(isTop).length / xs.length : null;
  };
  const rateFor = (fmt: "duel" | "triad") => {
    const xs = s.answers.filter((a) => a.probe === "none" && getItem(a.itemId).format === fmt);
    if (!xs.length) return null;
    return xs.filter((a) => {
      const it = getItem(a.itemId);
      const prot = it.options.map((o) => getSnack(o.snackId).proteinG);
      return prot[a.chosenIndex] === Math.max(...prot);
    }).length / xs.length;
  };
  return {
    revealedIndex: index,
    stated,
    sayDoGap: stated != null ? stated - index : null,
    shelfProteinShare: shelfShare,
    choiceVsShelf: shelfShare != null ? revealed01 - shelfShare : null,
    crowdGuess: s.crowd?.guessPct ?? null,
    selfVsCrowd: stated != null && s.crowd ? ((stated - 1) / 4) * 100 - s.crowd.guessPct : null,
    squeezeProteinCutShare: squeezeShare,
    contextGap: s.posterior ? s.posterior.wtpFunctional.median - s.posterior.wtpCraving.median : null,
    proteinPickRate: pickRate,
    gutProteinAppeal: gutProtein,
    gutIndulgentAppeal: gutIndulgent,
    gutVsChoice: gutProtein != null ? gutProtein - pickRate : null,
    labelProteinCorrect: lp ? lp.answer === lp.correct : null,
    labelPriceCorrect: lpr ? lpr.answer === lpr.correct : null,
    proteinRateFunctional: ctxRate("functional"),
    proteinRateCraving: ctxRate("craving"),
    pContextSwitch: s.posterior?.pContextSwitch ?? null,
    firstPeek: s.peek?.reveals[0]?.attr ?? null,
    proteinPeeked: s.peek ? s.peek.reveals.some((r) => r.attr === "protein") : null,
    peeks: s.peek ? s.peek.reveals.length : null,
    bidFunctional: s.bid?.rounds.find((r) => getMoment(r.momentId).context === "functional")?.bid ?? null,
    bidCraving: s.bid?.rounds.find((r) => getMoment(r.momentId).context === "craving")?.bid ?? null,
    bidVsModelFunctional:
      s.bid && s.posterior
        ? (s.bid.rounds.find((r) => getMoment(r.momentId).context === "functional")?.bid ?? 0) - modelImpliedPrice(s.posterior, "functional")
        : null,
    duelProteinRate: rateFor("duel"),
    triadProteinRate: rateFor("triad"),
    ...barAndWeek(s),
  };
}

/** Protein's share of importance among price / protein / taste (same three as the bar comparison). */
function proteinImportanceShare(imp: { price: number; protein: number; taste: number }) {
  const t = imp.price + imp.protein + imp.taste;
  return t ? imp.protein / t : 0;
}

function barAndWeek(s: SessionData) {
  let barProteinShare: number | null = null;
  let barProteinKept: number | null = null;
  if (s.bar) {
    const a = s.bar.alloc;
    const tri = (a.protein ?? 0) + (a.taste ?? 0) + (a.lowPrice ?? 0);
    barProteinShare = tri ? (a.protein ?? 0) / tri : null;
    barProteinKept = a.protein ? (s.bar.final.protein ?? 0) / a.protein : null;
  }
  let weekSnacks: number | null = null;
  let weekFunctionalShare: number | null = null;
  if (s.week) {
    const entries = Object.entries(s.week.freq);
    weekSnacks = entries.reduce((x, [, v]) => x + v, 0);
    weekFunctionalShare = weekSnacks ? entries.filter(([m]) => getMoment(m).context === "functional").reduce((x, [, v]) => x + v, 0) / weekSnacks : null;
  }
  return {
    barProteinShare,
    barProteinKept,
    designVsChoice: barProteinShare != null && s.posterior ? barProteinShare - proteinImportanceShare(s.posterior.importance) : null,
    weekSnacks,
    weekFunctionalShare,
  };
}
