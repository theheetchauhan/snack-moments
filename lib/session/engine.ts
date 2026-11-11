/**
 * Session engine: pure state transitions over SessionData.
 * Used by the API routes AND by the simulator, so demo data goes through the exact same logic.
 *
 * Flow: label (memory) → gut (swipe) → [PRE pick: 1 of peek | week] → rounds (adaptive triads + duels)
 *       → [POST pick: 2 of bid | shelf | bar] → crowd → bonus → reality → stated (1–5) → followup → done
 *
 * Order is deliberate: Label Detective runs first, before anything mentions protein, so it
 * measures what people notice unprompted. Gut Check comes before the considered rounds.
 * Optional games are chosen per player by lib/adaptive/rotation.ts (value + coverage + propensity).
 */
import { posteriorFor, predictive, summarise, type Observation, type PosteriorSummary } from "@/lib/model/choice";
import { selectNext, updateCusum } from "@/lib/adaptive/selector";
import { anomalyEvidence, closenessFromPredictive, expectedMs, residual, wordCount } from "@/lib/timing/expected";
import { getItem, getMoment, getSnack, PROTEIN_STUDY } from "@/lib/study/protein";
import { rngFrom, shuffle } from "@/lib/rng";
import { computeDivergence, computeNoise, engagementScore, qualityScore } from "@/lib/scoring/signals";
import { detectContradiction } from "@/lib/contradictions/detect";
import type { AnswerRecord, LabelQuestion, PeekAttr, RewardEvent, SessionData } from "./types";
import {
  decide,
  postValues,
  preValues,
  GAME_NAME,
  POST_GAMES,
  POST_PICK,
  PRE_GAMES,
  PRE_PICK,
  type Coverage,
  type OptionalGame,
} from "@/lib/adaptive/rotation";
import { MOMENTS } from "@/lib/study/protein";
import type { FramingArm, Item, Snack } from "@/lib/study/types";

export const SHELF_BUDGET = 300;
export const SQUEEZE_BUDGET = 200;
export const CROWD_ITEM = {
  momentId: "desk_430",
  options: [
    { snackId: "masala_chips", price: 20 },
    { snackId: "peanuts", price: 40 },
    { snackId: "protein_bar", price: 90 },
  ],
  targetSnackId: "protein_bar",
};
export const REALITY_CATEGORIES = [
  "Chips / namkeen",
  "Biscuits / cookies",
  "Chocolate / sweets",
  "Fruit / nuts",
  "Protein bar / protein snack",
  "Yogurt / dairy",
  "Something else",
];

export interface DisplayOption {
  position: number;
  snack: Snack;
  price: number;
}

export const LABEL_PEEK_MS = 8000; // time to look at the packs before the questions

export type Screen =
  | {
      kind: "label";
      packs: { snack: Snack; price: number }[];
      peekMs: number;
      questions: { kind: "price" | "protein"; snackId: string; prompt: string; options: number[]; unit: string }[];
    }
  | { kind: "gut"; cards: { snack: Snack; price: number }[] }
  | { kind: "peek"; moment: ReturnType<typeof getMoment>; snacks: { id: string; name: string; emoji: string }[]; attrs: PeekAttr[]; maxPeeks: number }
  | { kind: "bid"; coins: number; rounds: { momentId: string; moment: ReturnType<typeof getMoment>; snack: Snack; maxBid: number }[] }
  | {
      kind: "round";
      format: "triad" | "duel";
      round: number;
      maxRounds: number;
      converged: number;
      itemId: string;
      moment: ReturnType<typeof getMoment>;
      options: DisplayOption[];
      framing: FramingArm;
      reason: string;
    }
  | { kind: "shelf"; budget: number; squeezeBudget: number; items: { snack: Snack; price: number }[] }
  | { kind: "week"; moments: ReturnType<typeof getMoment>[]; bands: { label: string; value: number }[]; overallBands: { label: string; value: number }[] }
  | { kind: "bar"; attrs: typeof BAR_ATTRS; budget: number; squeeze: number; maxLevel: number }
  | {
      kind: "crowd";
      moment: ReturnType<typeof getMoment>;
      options: { snack: Snack; price: number }[];
      targetSnackId: string;
      /** the optional bonus questions, shown on the same screen (one step, not two) */
      bonus: { questions: { moment: ReturnType<typeof getMoment>; options: { snack: Snack; price: number }[] }[]; reward: number };
    }
  | { kind: "bonus"; questions: { moment: ReturnType<typeof getMoment>; options: { snack: Snack; price: number }[] }[]; reward: number }
  | { kind: "reality"; categories: string[] }
  | { kind: "stated"; question: string }
  | { kind: "followup"; question: string; options: string[] }
  | { kind: "done" };

export function createSession(opts: {
  id: string;
  participantId: string;
  deviceHash: string;
  ipHash: string;
  segment: string;
  now: number;
  simulated?: boolean;
  archetype?: string | null;
}): SessionData {
  const rng = rngFrom(`arms:${opts.id}`);
  return {
    id: opts.id,
    studyId: PROTEIN_STUDY.id,
    participantId: opts.participantId,
    deviceHash: opts.deviceHash,
    ipHash: opts.ipHash,
    framing: rng() < 0.5 ? "health" : "taste",
    anchor: rng() < 0.5 ? "low" : "high",
    segment: opts.segment,
    startedAt: opts.now,
    completedAt: null,
    status: "in_progress",
    stage: "label",
    cusum: 0,
    pendingItemId: null,
    pendingOrder: null,
    pendingShownAt: null,
    pendingExpectedMs: null,
    pendingCloseness: null,
    pendingPredictive: null,
    pendingReason: null,
    pendingEig: null,
    answers: [],
    label: null,
    gut: null,
    peek: null,
    peekShownAt: null,
    bid: null,
    bonus: null,
    week: null,
    bar: null,
    rotation: { pre: null, post: null },
    rewards: [],
    shelf: null,
    crowd: null,
    reality: null,
    stated: null,
    followup: null,
    counters: { hidden: 0, idle: 0, nudges: 0, events: 0 },
    posterior: null,
    points: 0,
    simulated: !!opts.simulated,
    archetype: opts.archetype ?? null,
  };
}

const observations = (answers: AnswerRecord[]): Observation[] =>
  answers.map((a) => ({ itemId: a.itemId, item: getItem(a.itemId), chosenIndex: a.chosenIndex }));

export function currentPosterior(s: SessionData) {
  return posteriorFor(s.id, observations(s.answers));
}

function itemWords(item: Item): number {
  const m = getMoment(item.momentId);
  const text = [m.label, m.scene, ...item.options.map((o) => `${getSnack(o.snackId).name} ${o.price} ${getSnack(o.snackId).proteinG}g`)].join(" ");
  return wordCount(text);
}

function roundScreen(s: SessionData): Screen {
  const item = getItem(s.pendingItemId!);
  return {
    kind: "round",
    format: item.format,
    round: s.answers.length + 1,
    maxRounds: 10,
    converged: 0,
    itemId: item.id,
    moment: getMoment(item.momentId),
    options: s.pendingOrder!.map((canon, position) => ({
      position,
      snack: getSnack(item.options[canon].snackId),
      price: item.options[canon].price,
    })),
    framing: s.framing,
    reason: s.pendingReason ?? "",
  };
}

function shelfPrices(post: PosteriorSummary | null) {
  const wtp = post ? Math.max(0, post.wtpFunctional.median) : 2.5;
  const r5 = (x: number) => Math.round(x / 5) * 5;
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  // protein snacks priced near this player's own indifference point (warm start from game 1)
  return [
    { snackId: "masala_chips", price: 20 },
    { snackId: "choc_cookies", price: 30 },
    { snackId: "peanuts", price: 40 },
    { snackId: "protein_bar", price: r5(clamp(20 + wtp * 17, 40, 140)) },
    { snackId: "greek_yogurt", price: r5(clamp(20 + wtp * 9, 30, 100)) },
  ];
}

const HIGH_IDS = ["protein_bar", "protein_chips", "protein_cookie", "greek_yogurt", "protein_shake"];
const MID_IDS = ["roasted_chana", "peanuts", "boiled_eggs"];
const LOW_IDS = ["masala_chips", "choc_cookies", "ice_cream", "plain_makhana"];

function distractors(correct: number, step: number, rng: () => number): number[] {
  const set = new Set<number>([correct]);
  const deltas = shuffle([-2, -1, 1, 2, 3], rng);
  for (const d of deltas) {
    const v = correct + d * step;
    if (v > 0) set.add(v);
    if (set.size === 4) break;
  }
  return shuffle([...set], rng);
}

/** Deterministic Label Detective task for a session: 3 packs, one price + one protein question. */
export function buildLabelTask(sessionId: string): { packs: { snackId: string; price: number }[]; questions: Omit<LabelQuestion, "answer" | "ms">[] } {
  const rng = rngFrom(`label:${sessionId}`);
  const pickFrom = (arr: string[]) => arr[Math.floor(rng() * arr.length)];
  const packs = shuffle([pickFrom(HIGH_IDS), pickFrom(MID_IDS), pickFrom(LOW_IDS)], rng).map((id) => ({ snackId: id, price: getSnack(id).basePrice }));
  const proteinTarget = packs.find((p) => HIGH_IDS.includes(p.snackId))!;
  const priceTarget = packs.filter((p) => p !== proteinTarget)[Math.floor(rng() * 2)];
  const pg = getSnack(proteinTarget.snackId).proteinG;
  return {
    packs,
    questions: shuffle(
      [
        { kind: "protein" as const, snackId: proteinTarget.snackId, options: distractors(pg, pg >= 15 ? 5 : 3, rng), correct: pg },
        { kind: "price" as const, snackId: priceTarget.snackId, options: distractors(priceTarget.price, 10, rng), correct: priceTarget.price },
      ],
      rng,
    ),
  };
}

export function buildGutCards(sessionId: string) {
  const rng = rngFrom(`gut:${sessionId}`);
  const virt = shuffle(PROTEIN_STUDY.snacks.filter((x) => x.virtuous), rng).slice(0, 4);
  const non = shuffle(PROTEIN_STUDY.snacks.filter((x) => !x.virtuous), rng).slice(0, 4);
  return shuffle([...virt, ...non], rng).map((sn) => ({ snackId: sn.id, price: sn.basePrice }));
}

// ---------------- Rewards (never tied to preference answers) ----------------
export const PROGRESS_POINTS: Record<string, { points: number; label: string; emoji: string }> = {
  label: { points: 15, label: "Finished Label Detective", emoji: "🔎" },
  gut: { points: 10, label: "Finished Gut Check", emoji: "⚡" },
  // every optional game is worth the same, so no rotation slate earns more than another
  peek: { points: 15, label: "Finished Peek & Pick", emoji: "👀" },
  week: { points: 15, label: "Mapped your snack week", emoji: "📅" },
  rounds: { points: 40, label: "Finished Snack Moments", emoji: "🍿" },
  bid: { points: 15, label: "Finished Bid It", emoji: "🔨" },
  shelf: { points: 15, label: "Stocked the shelf", emoji: "🛒" },
  bar: { points: 15, label: "Invented your bar", emoji: "🧪" },
  crowd: { points: 10, label: "Made a crowd guess", emoji: "👥" },
  complete: { points: 30, label: "Completed the study", emoji: "🏁" },
};
// ONE mystery gift per game, after Gut Check. Its size is random, which doubles as the
// gift-size experiment (does a bigger surprise change effort in the rounds that follow?).
export const GIFT_STAGES = ["gut"];
export const SNACK_PASS_MILESTONES = [50, 110, 170, 230];
/**
 * Cap on extra points over the whole game (gifts, skill, bonus round, quality).
 * Progress points for finishing games are never capped, so finishing always counts.
 */
export const BONUS_CAP = 100;
const BONUS_KINDS = new Set(["gift", "skill", "bonus", "quality"]);

export function bonusPoints(s: SessionData) {
  return (s.rewards ?? []).filter((r) => BONUS_KINDS.has(r.kind)).reduce((a, r) => a + r.points, 0);
}

export function totalPoints(s: SessionData) {
  return (s.rewards ?? []).reduce((a, r) => a + r.points, 0);
}

function award(s: SessionData, r: Omit<RewardEvent, "id">) {
  s.rewards = s.rewards ?? [];
  if (s.rewards.some((x) => x.label === r.label && x.at === r.at)) return;
  if (BONUS_KINDS.has(r.kind)) {
    const left = Math.max(0, BONUS_CAP - bonusPoints(s));
    if (left === 0) return; // bonus cap reached: no more extra points this game
    if (r.points > left) r = { ...r, points: left, label: `${r.label} (bonus cap reached)` };
  }
  s.rewards.push({ ...r, id: `${r.at}:${s.rewards.length}` });
  s.points = totalPoints(s);
}

/** Progress points + (for some stages) a mystery gift with a random value. */
function stageDone(s: SessionData, stage: string) {
  const p = PROGRESS_POINTS[stage];
  if (p) award(s, { kind: "progress", label: p.label, points: p.points, emoji: p.emoji, at: stage });
  if (GIFT_STAGES.includes(stage)) {
    const r = rngFrom(`gift:${s.id}:${stage}`)();
    const g =
      r < 0.55
        ? { label: "Mystery gift: a handful of points", points: 10, emoji: "🎁" }
        : r < 0.9
          ? { label: "Mystery gift: snack-sized bonus", points: 20, emoji: "🎁" }
          : { label: "Mystery gift: lucky jackpot!", points: 40, emoji: "💎" };
    award(s, { kind: "gift", ...g, at: stage });
  }
}

export const PEEK_ATTRS: PeekAttr[] = ["price", "protein", "taste", "sugar"];
export const MAX_PEEKS = 4;
export const BID_COINS = 150;
import { BID_SNACK } from "@/lib/model/price";
export { BID_SNACK };
export const BID_MOMENTS = ["post_gym", "late_night"];

export function buildPeekTask(sessionId: string) {
  const rng = rngFrom(`peek:${sessionId}`);
  const pickFrom = (arr: string[]) => arr[Math.floor(rng() * arr.length)];
  return shuffle([pickFrom(HIGH_IDS), pickFrom(MID_IDS), pickFrom(LOW_IDS)], rng).map((id) => ({ snackId: id, price: getSnack(id).basePrice }));
}

export const BONUS_ITEMS = [
  { momentId: "late_night", options: [{ snackId: "ice_cream", price: 50 }, { snackId: "protein_cookie", price: 75 }] },
  { momentId: "post_gym", options: [{ snackId: "peanuts", price: 40 }, { snackId: "protein_shake", price: 120 }] },
];
export const BONUS_POINTS = 25;

/** Value revealed for a peeked cell (server is the source of truth for hidden values). */
export function peekValue(snackId: string, attr: PeekAttr): string {
  const sn = getSnack(snackId);
  if (attr === "price") return `₹${sn.basePrice}`;
  if (attr === "protein") return `${sn.proteinG}g protein`;
  if (attr === "sugar") return `${sn.sugarG}g sugar`;
  return sn.tasteCue;
}

/** BDM random price: deterministic per session + round, uniform on [10, 150] in ₹5 steps. */
export function bdmPrice(sessionId: string, i: number) {
  const r = rngFrom(`bdm:${sessionId}:${i}`)();
  return 10 + Math.floor(r * 29) * 5;
}

// ---------------- My Snack Week ----------------
export const WEEK_BANDS = [
  { label: "Never", value: 0 },
  { label: "1–2× a week", value: 1.5 },
  { label: "3–4×", value: 3.5 },
  { label: "5+×", value: 6 },
];
export const WEEK_OVERALL = [
  { label: "0–3", value: 2 },
  { label: "4–7", value: 5.5 },
  { label: "8–14", value: 11 },
  { label: "15+", value: 18 },
];

// ---------------- Build-a-Bar (definitions shared with the client) ----------------
import { BAR_ATTRS, BAR_BUDGET, BAR_MAX_LEVEL, BAR_SQUEEZE, barName } from "@/lib/study/bar";
export { BAR_ATTRS, BAR_BUDGET, BAR_MAX_LEVEL, BAR_SQUEEZE, barName };

// ---------------- Rotation of optional games ----------------
export interface PlanStep {
  key: string; // a Screen kind ("round" for the adaptive rounds) or "mystery"
  label: string;
}
const PLAN_LABEL: Record<string, string> = {
  label: "Label detective",
  gut: "Gut check",
  peek: "Peek & pick",
  week: "My snack week",
  round: "Snack moments",
  bid: "Bid it",
  shelf: "Stock the shelf",
  bar: "Build-a-bar",
  crowd: "Guess the crowd",
  bonus: "Bonus round",
  reality: "Reality check",
  stated: "One quick rating",
  followup: "Last question",
  mystery: "🎲 Picked for you",
};

/** The player's journey, with not-yet-decided optional games shown as mystery slots. */
export function sessionPlan(s: SessionData): PlanStep[] {
  const rot = s.rotation ?? { pre: null, post: null };
  const pre: string[] = rot.pre ? rot.pre.picked : Array(PRE_PICK).fill("mystery");
  const post: string[] = rot.post ? POST_GAMES.filter((g) => rot.post!.picked.includes(g)) : Array(POST_PICK).fill("mystery");
  // the follow-up only counts as a step once we know there is a contradiction to ask about
  const followup = s.followup && s.followup.type !== "none" ? ["followup"] : [];
  const keys = ["label", "gut", ...pre, "round", ...post, "crowd", "reality", "stated", ...followup];
  return keys.map((k) => ({ key: k, label: PLAN_LABEL[k] ?? k }));
}

function preInputs(s: SessionData) {
  const sw = s.gut?.swipes ?? [];
  const virt = sw.filter((x) => getSnack(x.snackId).virtuous);
  const ms = sw.map((x) => x.ms).sort((a, b) => a - b);
  const lp = s.label?.questions.find((q) => q.kind === "protein");
  return {
    labelProteinCorrect: lp ? lp.answer === lp.correct : null,
    gutMedianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    gutProteinLikeRate: virt.length ? virt.filter((x) => x.right).length / virt.length : null,
    segment: s.segment,
  };
}

function ensureRotation(s: SessionData) {
  if (!s.rotation) s.rotation = { pre: null, post: null };
}

/** Moves on after an optional game: to the rounds (pre) or the next picked post game / crowd. */
function afterOptional(s: SessionData, game: OptionalGame) {
  ensureRotation(s);
  if (PRE_GAMES.includes(game)) {
    s.stage = "rounds";
    return;
  }
  const picked = POST_GAMES.filter((g) => s.rotation.post?.picked.includes(g) ?? true);
  const next = picked[picked.indexOf(game) + 1];
  if (next) s.stage = next;
  else {
    stageDone(s, "post");
    s.stage = "crowd";
  }
}

export interface EngineContext {
  /** population counts used to balance the rotation (from the DB, or the simulator's running tally) */
  coverage?: Coverage | null;
}

export { GAME_NAME };

/** Returns the screen the player should see now, advancing adaptive state if needed. */
export function nextScreen(s: SessionData, now: number, ctx: EngineContext = {}): Screen {
  if (s.stage === "pick_pre") {
    ensureRotation(s);
    s.rotation.pre = decide("pre", preValues(preInputs(s)), PRE_PICK, ctx.coverage ?? null, rngFrom(`rot-pre:${s.id}`));
    s.stage = s.rotation.pre.picked[0];
    return nextScreen(s, now, ctx);
  }
  if (s.stage === "pick_post") {
    ensureRotation(s);
    s.rotation.post = decide("post", postValues({ posterior: s.posterior, cusum: s.cusum }), POST_PICK, ctx.coverage ?? null, rngFrom(`rot-post:${s.id}`));
    s.stage = POST_GAMES.find((g) => s.rotation.post!.picked.includes(g))!;
    return nextScreen(s, now, ctx);
  }
  if (s.stage === "week") {
    return { kind: "week", moments: MOMENTS, bands: WEEK_BANDS, overallBands: WEEK_OVERALL };
  }
  if (s.stage === "bar") {
    return { kind: "bar", attrs: BAR_ATTRS, budget: BAR_BUDGET, squeeze: BAR_SQUEEZE, maxLevel: BAR_MAX_LEVEL };
  }
  if (s.stage === "label") {
    const t = buildLabelTask(s.id);
    return {
      kind: "label",
      packs: t.packs.map((p) => ({ snack: getSnack(p.snackId), price: p.price })),
      peekMs: LABEL_PEEK_MS,
      questions: t.questions.map((q) => ({
        kind: q.kind,
        snackId: q.snackId,
        prompt: q.kind === "price" ? `What was the price of the ${getSnack(q.snackId).name.toLowerCase()}?` : `How much protein did the ${getSnack(q.snackId).name.toLowerCase()} have?`,
        options: q.options,
        unit: q.kind === "price" ? "₹" : "g",
      })),
    };
  }
  if (s.stage === "gut") {
    return { kind: "gut", cards: buildGutCards(s.id).map((c) => ({ snack: getSnack(c.snackId), price: c.price })) };
  }
  if (s.stage === "peek") {
    const t = buildPeekTask(s.id);
    if (!s.peekShownAt) s.peekShownAt = now;
    if (!s.peek) s.peek = { snacks: t, reveals: [], choice: null, ms: 0 };
    return {
      kind: "peek",
      moment: getMoment("desk_430"),
      snacks: t.map((x) => {
        const sn = getSnack(x.snackId);
        return { id: sn.id, name: sn.name, emoji: sn.emoji };
      }),
      attrs: PEEK_ATTRS,
      maxPeeks: MAX_PEEKS,
    };
  }
  if (s.stage === "bid") {
    return {
      kind: "bid",
      coins: BID_COINS,
      rounds: BID_MOMENTS.map((m) => ({ momentId: m, moment: getMoment(m), snack: getSnack(BID_SNACK), maxBid: BID_COINS })),
    };
  }
  if (s.stage === "rounds") {
    if (s.pendingItemId) return roundScreen(s);
    const particles = currentPosterior(s);
    const rng = rngFrom(`select:${s.id}:${s.answers.length}`);
    const res = selectNext({
      particles,
      answered: s.answers.map((a) => ({ itemId: a.itemId, momentId: a.momentId, probe: a.probe })),
      cusum: s.cusum,
      anchorArm: s.anchor,
      rng,
    });
    if (res.item) {
      const pred = predictive(particles, res.item);
      const closeness = closenessFromPredictive(pred);
      s.pendingItemId = res.item.id;
      s.pendingOrder = shuffle(
        res.item.options.map((_, i) => i),
        rngFrom(`order:${s.id}:${s.answers.length}`),
      );
      // the repeat probe shows the same options in reversed screen order vs the original
      if (res.item.probe === "repeat") {
        const orig = s.answers.find((a) => a.itemId === res.item!.repeatOf);
        if (orig) s.pendingOrder = orig.order.slice().reverse();
      }
      s.pendingShownAt = now;
      s.pendingCloseness = closeness;
      s.pendingPredictive = pred;
      s.pendingExpectedMs = expectedMs(itemWords(res.item), res.item.options.length, closeness);
      s.pendingReason = res.reason;
      s.pendingEig = res.eig ?? null;
      const scr = roundScreen(s) as Extract<Screen, { kind: "round" }>;
      scr.converged = res.converged;
      return scr;
    }
    s.posterior = summarise(particles, rngFrom(`sum:${s.id}`));
    s.stopReason = res.reason;
    stageDone(s, "rounds");
    s.stage = "pick_post";
    return nextScreen(s, now, ctx);
  }
  if (s.stage === "shelf") {
    const prices = shelfPrices(s.posterior);
    return {
      kind: "shelf",
      budget: SHELF_BUDGET,
      squeezeBudget: SQUEEZE_BUDGET,
      items: prices.map((p) => ({ snack: getSnack(p.snackId), price: p.price })),
    };
  }
  if (s.stage === "crowd") {
    return {
      kind: "crowd",
      moment: getMoment(CROWD_ITEM.momentId),
      options: CROWD_ITEM.options.map((o) => ({ snack: getSnack(o.snackId), price: o.price })),
      targetSnackId: CROWD_ITEM.targetSnackId,
      bonus: {
        reward: BONUS_POINTS,
        questions: BONUS_ITEMS.map((b) => ({ moment: getMoment(b.momentId), options: b.options.map((o) => ({ snack: getSnack(o.snackId), price: o.price })) })),
      },
    };
  }
  if (s.stage === "bonus") {
    return {
      kind: "bonus",
      reward: BONUS_POINTS,
      questions: BONUS_ITEMS.map((b) => ({ moment: getMoment(b.momentId), options: b.options.map((o) => ({ snack: getSnack(o.snackId), price: o.price })) })),
    };
  }
  if (s.stage === "reality") return { kind: "reality", categories: REALITY_CATEGORIES };
  if (s.stage === "stated") return { kind: "stated", question: PROTEIN_STUDY.originalQuestion.replace(" (1–5)", "") };
  if (s.stage === "followup" && s.followup) return { kind: "followup", question: s.followup.question, options: s.followup.options };
  return { kind: "done" };
}

export function submitLabel(s: SessionData, input: { answers: { value: number; ms: number }[]; peekMs: number }) {
  if (s.stage !== "label") throw new Error("not at label");
  const t = buildLabelTask(s.id);
  s.label = {
    packs: t.packs,
    peekMs: Math.round(input.peekMs),
    questions: t.questions.map((q, i) => ({ ...q, answer: input.answers[i]?.value ?? null, ms: Math.round(input.answers[i]?.ms ?? 0) })),
  };
  stageDone(s, "label");
  // skill bonus is awarded only AFTER the unprompted measurement is complete
  const right = s.label.questions.filter((q) => q.answer === q.correct).length;
  if (right > 0) award(s, { kind: "skill", label: `Sharp eyes: ${right}/2 details remembered`, points: right * 10, emoji: "🦅", at: "label" });
  if (right === 2) award(s, { kind: "badge", label: "Badge: Label Hawk", points: 0, emoji: "🏅", at: "label" });
  s.stage = "gut";
}

export function submitGut(s: SessionData, input: { swipes: { snackId: string; right: boolean; ms: number; reversals: number }[] }) {
  if (s.stage !== "gut") throw new Error("not at gut");
  const cards = buildGutCards(s.id);
  const bySnack = new Map(input.swipes.map((x) => [x.snackId, x]));
  s.gut = {
    swipes: cards
      .filter((c) => bySnack.has(c.snackId))
      .map((c) => {
        const x = bySnack.get(c.snackId)!;
        return { snackId: c.snackId, price: c.price, right: !!x.right, ms: Math.round(x.ms), reversals: x.reversals };
      }),
  };
  stageDone(s, "gut");
  s.stage = "pick_pre";
}

/** Server-side reveal: a hidden value only leaves the server when a peek is spent. */
export function revealPeek(s: SessionData, input: { snackId: string; attr: PeekAttr }, now: number): { value: string; left: number } {
  if (s.stage !== "peek") throw new Error("not at peek");
  const t = buildPeekTask(s.id);
  if (!s.peek) s.peek = { snacks: t, reveals: [], choice: null, ms: 0 };
  if (!t.some((x) => x.snackId === input.snackId) || !PEEK_ATTRS.includes(input.attr)) throw new Error("bad cell");
  const already = s.peek.reveals.some((r) => r.snackId === input.snackId && r.attr === input.attr);
  if (!already) {
    if (s.peek.reveals.length >= MAX_PEEKS) throw new Error("no peeks left");
    s.peek.reveals.push({ snackId: input.snackId, attr: input.attr, ms: Math.round(now - (s.peekShownAt ?? now)) });
  }
  return { value: peekValue(input.snackId, input.attr), left: MAX_PEEKS - s.peek.reveals.length };
}

export function submitPeek(s: SessionData, input: { choice: string; ms: number }) {
  if (s.stage !== "peek") throw new Error("not at peek");
  const t = buildPeekTask(s.id);
  if (!s.peek) s.peek = { snacks: t, reveals: [], choice: null, ms: 0 };
  s.peek.choice = t.some((x) => x.snackId === input.choice) ? input.choice : null;
  s.peek.ms = Math.round(input.ms);
  stageDone(s, "peek");
  afterOptional(s, "peek");
}

export function submitBid(s: SessionData, input: { bids: { momentId: string; bid: number; ms: number; adjustments: number }[] }) {
  if (s.stage !== "bid") throw new Error("not at bid");
  let coins = BID_COINS;
  s.bid = {
    rounds: BID_MOMENTS.map((m, i) => {
      const b = input.bids.find((x) => x.momentId === m);
      const bid = Math.max(0, Math.min(BID_COINS, Math.round(b?.bid ?? 0)));
      const randomPrice = bdmPrice(s.id, i);
      const won = randomPrice <= bid;
      return { momentId: m, snackId: BID_SNACK, bid, randomPrice, won, ms: Math.round(b?.ms ?? 0), adjustments: b?.adjustments ?? 0 };
    }),
    coins: 0,
  };
  // only one round "counts" for the coin outcome (standard BDM: pay the random price if you win)
  const counted = s.bid.rounds[rngFrom(`bdmcount:${s.id}`)() < 0.5 ? 0 : 1];
  coins -= counted.won ? counted.randomPrice : 0;
  s.bid.coins = coins;
  stageDone(s, "bid");
  // Coins kept convert to points. Under BDM, bidding your true value is the best strategy.
  award(s, { kind: "skill", label: `Bid It: kept ${coins} of ${BID_COINS} coins`, points: Math.round(coins / 5), emoji: "🪙", at: "bid" });
  if (s.bid.rounds.some((r) => r.won)) award(s, { kind: "badge", label: "Badge: Deal Hunter", points: 0, emoji: "🏷️", at: "bid" });
  afterOptional(s, "bid");
}

export { modelImpliedPrice } from "@/lib/model/price";

export interface AnswerInput {
  itemId: string;
  position: number;
  latencyMs: number;
  changes: number;
  focusCount: number;
  tapCancels: number;
  firstTouchMs: number | null;
}

export function submitAnswer(s: SessionData, a: AnswerInput): { nudge: boolean } {
  if (s.stage !== "rounds" || !s.pendingItemId || a.itemId !== s.pendingItemId) throw new Error("no matching pending item");
  const item = getItem(s.pendingItemId);
  const order = s.pendingOrder!;
  if (a.position < 0 || a.position >= order.length) throw new Error("bad position");
  const chosenIndex = order[a.position];
  const expected = s.pendingExpectedMs!;
  const res = residual(a.latencyMs, expected);
  const prev = s.answers[s.answers.length - 1];
  const predChosen = s.pendingPredictive?.[chosenIndex] ?? 1 / order.length;
  const ev = anomalyEvidence({
    residual: res,
    samePositionAsPrevious: !!prev && prev.position === a.position,
    chosenPredictiveProb: predChosen,
    nOptions: order.length,
  });
  s.cusum = updateCusum(s.cusum, ev);
  s.answers.push({
    round: s.answers.length + 1,
    itemId: item.id,
    momentId: item.momentId,
    probe: item.probe,
    order,
    chosenIndex,
    position: a.position,
    latencyMs: Math.round(a.latencyMs),
    expectedMs: Math.round(expected),
    residual: Number(res.toFixed(3)),
    closeness: Number((s.pendingCloseness ?? 0).toFixed(3)),
    changes: a.changes,
    focusCount: a.focusCount,
    tapCancels: a.tapCancels,
    firstTouchMs: a.firstTouchMs,
    predictiveChosen: Number(predChosen.toFixed(3)),
    eig: s.pendingEig ?? undefined,
    selectReason: s.pendingReason ?? undefined,
    cusumAfter: Number(s.cusum.toFixed(3)),
  });
  s.pendingItemId = null;
  s.pendingOrder = null;
  s.pendingPredictive = null;
  // pacing nudge: two rushed answers in a row → gentle "take your time" (no penalty shown)
  const last2 = s.answers.slice(-2);
  const nudge = last2.length === 2 && last2.every((x) => x.residual < Math.log(0.35));
  if (nudge) s.counters.nudges++;
  return { nudge };
}

export function submitShelf(
  s: SessionData,
  input: { basket: Record<string, number>; removed: { snackId: string; price: number; order: number }[]; finalBasket: Record<string, number>; ms: number },
) {
  if (s.stage !== "shelf") throw new Error("not at shelf");
  s.shelf = {
    prices: shelfPrices(s.posterior),
    basket: input.basket,
    budget: SHELF_BUDGET,
    squeezeBudget: SQUEEZE_BUDGET,
    removed: input.removed,
    finalBasket: input.finalBasket,
    ms: input.ms,
  };
  stageDone(s, "shelf");
  afterOptional(s, "shelf");
}

export function submitWeek(s: SessionData, input: { freq: Record<string, number>; overall: number; changes: number; ms: number }) {
  if (s.stage !== "week") throw new Error("not at week");
  const allowed = new Set(WEEK_BANDS.map((b) => b.value));
  const freq: Record<string, number> = {};
  for (const m of MOMENTS) {
    const v = input.freq[m.id];
    freq[m.id] = allowed.has(v) ? v : 0;
  }
  const overall = WEEK_OVERALL.some((b) => b.value === input.overall) ? input.overall : WEEK_OVERALL[0].value;
  const sum = Object.values(freq).reduce((a, b) => a + b, 0);
  s.week = { freq, overall, consistency: overall ? Number((sum / overall).toFixed(2)) : null, changes: input.changes, ms: Math.round(input.ms) };
  stageDone(s, "week");
  afterOptional(s, "week");
}

export function submitBar(s: SessionData, input: { alloc: Record<string, number>; final: Record<string, number>; cutOrder: string[]; moves: number; ms: number }) {
  if (s.stage !== "bar") throw new Error("not at bar");
  const keys = BAR_ATTRS.map((a) => a.key as string);
  const clean = (r: Record<string, number>) => Object.fromEntries(keys.map((k) => [k, Math.max(0, Math.min(BAR_MAX_LEVEL, Math.round(r[k] ?? 0)))]));
  const alloc = clean(input.alloc);
  const final = clean(input.final);
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  if (sum(alloc) !== BAR_BUDGET) throw new Error(`spend exactly ${BAR_BUDGET} points`);
  if (sum(final) !== BAR_SQUEEZE || keys.some((k) => final[k] > alloc[k])) throw new Error(`the squeeze must remove ${BAR_BUDGET - BAR_SQUEEZE} points`);
  const name = barName(final);
  s.bar = { alloc, final, cutOrder: input.cutOrder.filter((k) => keys.includes(k)).slice(0, BAR_BUDGET), moves: input.moves, name, ms: Math.round(input.ms) };
  stageDone(s, "bar");
  award(s, { kind: "badge", label: `Badge: Inventor of ${name}`, points: 0, emoji: "🧪", at: "bar" });
  afterOptional(s, "bar");
}

export function submitCrowd(
  s: SessionData,
  input: { guessPct: number; adjustments: number; ms: number; bonus?: { guesses: (number | null)[]; skipped: boolean; ms: number } },
) {
  if (s.stage !== "crowd") throw new Error("not at crowd");
  s.crowd = {
    itemId: "crowd:desk_430",
    targetSnackId: CROWD_ITEM.targetSnackId,
    guessPct: Math.max(0, Math.min(100, Math.round(input.guessPct))),
    actualPct: null,
    adjustments: input.adjustments,
    ms: input.ms,
  };
  stageDone(s, "crowd");
  s.stage = "bonus";
  // bonus questions answered on the same screen → record them and skip the separate bonus step
  if (input.bonus) submitBonus(s, input.bonus);
}

/** Optional bonus round (skippable): predict which snack more players picked. Scored at the end. */
export function submitBonus(s: SessionData, input: { guesses: (number | null)[]; skipped: boolean; ms: number }) {
  if (s.stage !== "bonus") throw new Error("not at bonus");
  s.bonus = {
    questions: BONUS_ITEMS.map((b, i) => ({ momentId: b.momentId, options: b.options, guess: input.skipped ? null : (input.guesses[i] ?? null), correctIdx: null })),
    skipped: input.skipped,
    ms: Math.round(input.ms),
  };
  s.stage = "reality";
}

export function submitReality(s: SessionData, input: { category: string; why: string; typingMs: number; pasted: boolean; backspaces: number }) {
  if (s.stage !== "reality") throw new Error("not at reality");
  s.reality = { ...input, why: input.why.slice(0, 280) };
  s.stage = "stated";
}

export function submitStated(s: SessionData, value: number) {
  if (s.stage !== "stated") throw new Error("not at stated");
  s.stated = Math.max(1, Math.min(5, Math.round(value)));
  finaliseModel(s);
  const div = computeDivergence(s);
  const f = detectContradiction(div);
  s.followup = f;
  s.stage = f.type === "none" ? "done" : "followup";
  if (s.stage === "done") complete(s, Date.now());
}

export function submitFollowup(s: SessionData, answer: string, now: number) {
  if (s.stage !== "followup" || !s.followup) throw new Error("not at followup");
  s.followup.answer = answer;
  s.stage = "done";
  complete(s, now);
}

/** Final posterior + in-sample fit of every answer. */
export function finaliseModel(s: SessionData) {
  const particles = currentPosterior(s);
  s.posterior = summarise(particles, rngFrom(`sum:${s.id}`));
  for (const a of s.answers) a.fitProb = Number(predictive(particles, getItem(a.itemId))[a.chosenIndex].toFixed(3));
}

export function complete(s: SessionData, now: number) {
  s.status = "completed";
  s.completedAt = now;
  stageDone(s, "complete");
}

/**
 * End-of-study settlement of skill and quality bonuses, once the population model is known.
 * Crowd and bonus-round predictions are scored against the model-based population share.
 */
export function settleRewards(s: SessionData, pop: { crowdShare: number | null; bonusShares: (number | null)[] }, qualityBand: string | null) {
  s.rewards = (s.rewards ?? []).filter((r) => r.at !== "settle");
  // settled first so the bonus cap never squeezes out the reward for careful play
  if (qualityBand === "green") award(s, { kind: "quality", label: "Thoughtful player bonus", points: 30, emoji: "🧠", at: "settle" });
  if (s.crowd && pop.crowdShare != null) {
    s.crowd.actualPct = pop.crowdShare;
    const err = Math.abs(s.crowd.guessPct - pop.crowdShare);
    const pts = Math.max(0, 50 - err);
    if (pts > 0) award(s, { kind: "skill", label: `Crowd guess within ${err} points`, points: pts, emoji: "🎯", at: "settle" });
    if (err <= 10) award(s, { kind: "badge", label: "Badge: Crowd Whisperer", points: 0, emoji: "🔮", at: "settle" });
  }
  if (s.bonus && !s.bonus.skipped) {
    let right = 0;
    s.bonus.questions.forEach((q, i) => {
      const share = pop.bonusShares[i];
      if (share == null) return;
      q.correctIdx = share >= 50 ? 1 : 0; // share = % of players picking option index 1
      if (q.guess === q.correctIdx) right++;
    });
    if (right) award(s, { kind: "bonus", label: `Bonus round: ${right}/${s.bonus.questions.length} right`, points: right * BONUS_POINTS, emoji: "⭐", at: "settle" });
  }
  s.points = totalPoints(s);
}

/** Model-based population share (%) choosing option `target` for a fixed item. */
export function populationShare(posteriors: PosteriorSummary[], momentId: string, options: { snackId: string; price: number }[], target: number): number | null {
  if (!posteriors.length) return null;
  const ctx = getMoment(momentId).context;
  const feats = options.map((o) => {
    const sn = getSnack(o.snackId);
    return { price: o.price, protein: sn.proteinG, indulgence: sn.indulgence };
  });
  let sum = 0;
  for (const p of posteriors) {
    const m = p.mean;
    const b = ctx === "functional" ? m.bF : m.bC;
    const u = feats.map((f) => -m.a * (f.price / 10) + b * (f.protein / 10) + m.c * f.indulgence);
    const mx = Math.max(...u);
    const e = u.map((x) => Math.exp(x - mx));
    sum += e[target] / e.reduce((a, c) => a + c, 0);
  }
  return Math.round((sum / posteriors.length) * 100);
}

/** All population shares needed to settle rewards. */
export function populationShares(posteriors: PosteriorSummary[]) {
  return {
    crowdShare: populationShare(posteriors, CROWD_ITEM.momentId, CROWD_ITEM.options, CROWD_ITEM.options.findIndex((o) => o.snackId === CROWD_ITEM.targetSnackId)),
    bonusShares: BONUS_ITEMS.map((b) => populationShare(posteriors, b.momentId, b.options, 1)),
  };
}

/** Population share for the crowd item, from each participant's posterior (model-based). */
export function crowdShareFromPosteriors(posteriors: PosteriorSummary[]): number | null {
  if (!posteriors.length) return null;
  const feats = CROWD_ITEM.options.map((o) => {
    const sn = getSnack(o.snackId);
    return { price: o.price, protein: sn.proteinG, indulgence: sn.indulgence };
  });
  const target = CROWD_ITEM.options.findIndex((o) => o.snackId === CROWD_ITEM.targetSnackId);
  let sum = 0;
  for (const p of posteriors) {
    const m = p.mean;
    const u = feats.map((f) => -m.a * (f.price / 10) + m.bF * (f.protein / 10) + m.c * f.indulgence);
    const mx = Math.max(...u);
    const e = u.map((x) => Math.exp(x - mx));
    sum += e[target] / e.reduce((a, b) => a + b, 0);
  }
  return Math.round((sum / posteriors.length) * 100);
}

/** Live (provisional) quality while playing — powers the demo panel. */
export function liveQuality(s: SessionData) {
  const q = qualityScore(computeNoise(s));
  return { score: q.score, band: q.band, cusum: Number(s.cusum.toFixed(2)), signals: q.signals.filter((x) => x.severity > 0).map((x) => x.label) };
}

export function fullScores(s: SessionData, textVerdict?: { lowEffort: number; reason: string } | null) {
  const q = qualityScore(computeNoise(s, textVerdict));
  const e = engagementScore(s);
  const d = computeDivergence(s);
  return { quality: q, engagement: e, divergence: d };
}
