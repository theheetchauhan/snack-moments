/**
 * Smart rotation of the optional games ("planned missingness" with judgment).
 *
 * Every player plays the core games. On top of that each player gets 2 of the 5 optional games,
 * picked in two moments (kept to one each so a run stays short):
 *   - PRE  (after Gut Check, before the adaptive rounds): 1 of { Peek & Pick, My Snack Week }
 *   - POST (after the adaptive rounds):                   1 of { Bid It, Stock the Shelf, Build-a-Bar }
 *
 * Why not plain random? Some games tell us much more about some players. The model already knows
 * things about this player (what they missed in Label Detective, their gut swipes, how unsure the
 * choice model still is, their driver profile), so each game gets a VALUE score for this player.
 *
 * Why not plain "pick the highest score"? Then some games would only ever be played by one kind
 * of player, and population numbers for that game would be biased. So the final score adds a
 * COVERAGE term (games below their target share get a boost), and the pick is SAMPLED with a
 * floor (ε) so every game always has a real chance. The exact inclusion probability (propensity)
 * is stored, so the dashboard can re-weight results (inverse-propensity weighting) and stay unbiased.
 */
import type { PosteriorSummary } from "@/lib/model/choice";
import type { Rng } from "@/lib/rng";

export const ROTATION_VERSION = "rotation-v1";

export type OptionalGame = "peek" | "week" | "bid" | "shelf" | "bar";
export const PRE_GAMES: OptionalGame[] = ["peek", "week"];
export const POST_GAMES: OptionalGame[] = ["bid", "shelf", "bar"];
export const PRE_PICK = 1;
export const POST_PICK = 1; // one bonus game after the rounds keeps each run short
export const OPTIONAL_GAMES: OptionalGame[] = [...PRE_GAMES, ...POST_GAMES];

/** Target share of eligible players who should get each game. */
export const TARGET_SHARE: Record<OptionalGame, number> = {
  peek: PRE_PICK / PRE_GAMES.length,
  week: PRE_PICK / PRE_GAMES.length,
  bid: POST_PICK / POST_GAMES.length,
  shelf: POST_PICK / POST_GAMES.length,
  bar: POST_PICK / POST_GAMES.length,
};

export const GAME_NAME: Record<OptionalGame, string> = {
  peek: "Peek & Pick",
  week: "My Snack Week",
  bid: "Bid It",
  shelf: "Stock the Shelf",
  bar: "Build-a-Bar",
};

/** Reasons that LOWER a game's value start with this prefix. */
export const AGAINST = "Against: ";

const TEMPERATURE = 0.25; // softmax temperature over scores
const EPSILON = 0.2; // exploration floor: share of probability spread uniformly
const COVERAGE_GAIN = 2; // how hard we push games back towards their target share

/** Population counts so far: how many eligible players were offered each game. */
export type Coverage = Record<OptionalGame, { assigned: number; eligible: number }>;

export const emptyCoverage = (): Coverage =>
  Object.fromEntries(OPTIONAL_GAMES.map((g) => [g, { assigned: 0, eligible: 0 }])) as Coverage;

export interface GameScore {
  game: OptionalGame;
  value: number; // information value for THIS player (0..1-ish)
  coverage: number; // population balancing term
  total: number;
  prob: number; // exact probability this game is included (the propensity)
  picked: boolean;
  reasons: string[];
}

export interface RotationDecision {
  phase: "pre" | "post";
  version: string;
  scores: GameScore[];
  picked: OptionalGame[];
}

export interface PreInputs {
  labelProteinCorrect: boolean | null;
  gutMedianMs: number | null;
  gutProteinLikeRate: number | null; // share of protein-rich snacks swiped right
  segment: string;
}

export interface PostInputs {
  posterior: PosteriorSummary | null;
  cusum: number;
}

interface Valued {
  game: OptionalGame;
  value: number;
  reasons: string[];
}

export function preValues(x: PreInputs): Valued[] {
  const peek: Valued = { game: "peek", value: 0.3, reasons: ["Base value: shows what people check first"] };
  if (x.labelProteinCorrect === false) {
    peek.value += 0.35;
    peek.reasons.push("Missed the protein detail in Label Detective: Peek & Pick tells us if they don't notice protein or don't care");
  }
  if (x.gutMedianMs != null && x.gutMedianMs < 900) {
    peek.value += 0.15;
    peek.reasons.push("Swiped on instinct: Peek & Pick shows what they look at when they slow down");
  }
  const week: Valued = { game: "week", value: 0.3, reasons: ["Base value: turns ₹ per gram into weekly demand"] };
  if (x.gutProteinLikeRate != null) {
    week.value += 0.35 * x.gutProteinLikeRate;
    if (x.gutProteinLikeRate >= 0.5) week.reasons.push("Liked protein snacks in Gut Check: how often they snack decides how much they are worth to a brand");
  }
  if (/gym/i.test(x.segment)) {
    week.value += 0.15;
    week.reasons.push("Gym-goer: likely many functional snack moments a week");
  }
  return [peek, week];
}

export function postValues(x: PostInputs): Valued[] {
  const p = x.posterior;
  const bid: Valued = { game: "bid", value: 0.3, reasons: ["Base value: a direct price check on the model"] };
  const shelf: Valued = { game: "shelf", value: 0.3, reasons: ["Base value: priorities under a real budget"] };
  const bar: Valued = { game: "bar", value: 0.3, reasons: ["Base value: what their ideal product looks like"] };
  if (p) {
    const width = p.wtpFunctional.hi - p.wtpFunctional.lo;
    const u = Math.max(0, Math.min(1, width / 4));
    bid.value += 0.4 * u;
    if (u >= 0.5) bid.reasons.push("Model still unsure of their ₹ per gram: a direct bid narrows it");
    if (p.driver === "context-switcher" || p.driver === "protein-led") {
      shelf.value += 0.35;
      shelf.reasons.push(`Looks ${p.driver}: the budget squeeze tests whether protein survives a cut`);
    }
    if (p.pContextSwitch > 0.35 && p.pContextSwitch < 0.75) {
      shelf.value += 0.15;
      shelf.reasons.push("Unclear if protein matters more at work than at night: the shelf covers both");
    }
    if (p.driver === "undecided") {
      bar.value += 0.35;
      bar.reasons.push("No clear driver yet: forcing design trade-offs separates price, protein and taste");
    }
    if (p.driver === "protein-led") {
      bar.value += 0.2;
      bar.reasons.push("Protein-led: the brand's core buyer, so their ideal bar matters most");
    }
  }
  if (x.cusum > 1) {
    bid.value -= 0.3;
    bid.reasons.push(`${AGAINST}Signs of rushing so far: an auction answer would likely be noise`);
  }
  return [bid, shelf, bar];
}

function coverageTerm(game: OptionalGame, cov: Coverage | null): number {
  if (!cov) return 0;
  const c = cov[game];
  // smoothed share, so the first few sessions don't swing wildly
  const share = (c.assigned + 2 * TARGET_SHARE[game]) / (c.eligible + 2);
  return COVERAGE_GAIN * (TARGET_SHARE[game] - share);
}

function softmax(xs: number[], tau: number): number[] {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp((x - m) / tau));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / z);
}

/**
 * Picks `k` games out of `vals`. For k = n-1 we sample the game to DROP, which gives exact
 * inclusion probabilities: P(include g) = 1 − P(drop g). For k = 1 we sample the game to keep.
 */
export function decide(phase: "pre" | "post", vals: Valued[], k: number, cov: Coverage | null, rng: Rng): RotationDecision {
  const n = vals.length;
  if (k !== 1 && k !== n - 1) throw new Error("rotation supports picking 1 or n−1 games");
  const totals = vals.map((v) => v.value + coverageTerm(v.game, cov));
  const uniform = 1 / n;
  let incl: number[];
  let picked: OptionalGame[];
  const draw = (probs: number[]) => {
    let u = rng();
    for (let i = 0; i < probs.length; i++) if ((u -= probs[i]) <= 0) return i;
    return probs.length - 1;
  };
  if (k === 1) {
    const p = softmax(totals, TEMPERATURE).map((x) => (1 - EPSILON) * x + EPSILON * uniform);
    const i = draw(p);
    incl = p;
    picked = [vals[i].game];
  } else {
    const q = softmax(totals.map((t) => -t), TEMPERATURE).map((x) => (1 - EPSILON) * x + EPSILON * uniform);
    const drop = draw(q);
    incl = q.map((x) => 1 - x);
    picked = vals.filter((_, i) => i !== drop).map((v) => v.game);
  }
  return {
    phase,
    version: ROTATION_VERSION,
    picked,
    scores: vals.map((v, i) => ({
      game: v.game,
      value: Number(v.value.toFixed(3)),
      coverage: Number((totals[i] - v.value).toFixed(3)),
      total: Number(totals[i].toFixed(3)),
      prob: Number(incl[i].toFixed(4)),
      picked: picked.includes(v.game),
      reasons: v.reasons,
    })),
  };
}

/** Adds one session's decisions to running coverage counts. */
export function addToCoverage(cov: Coverage, decisions: (RotationDecision | null | undefined)[]) {
  for (const d of decisions) {
    if (!d) continue;
    for (const sc of d.scores) {
      cov[sc.game].eligible++;
      if (sc.picked) cov[sc.game].assigned++;
    }
  }
  return cov;
}
