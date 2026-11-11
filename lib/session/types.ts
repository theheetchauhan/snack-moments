import type { PosteriorSummary } from "@/lib/model/choice";
import type { AnchorArm, FramingArm, ProbeType } from "@/lib/study/types";
import type { RotationDecision } from "@/lib/adaptive/rotation";

export interface AnswerRecord {
  round: number;
  itemId: string;
  momentId: string;
  probe: ProbeType;
  /** screen order: order[position] = canonical option index */
  order: number[];
  chosenIndex: number; // canonical option index
  position: number; // screen position tapped (0 = top)
  latencyMs: number;
  expectedMs: number;
  residual: number;
  closeness: number;
  changes: number;
  focusCount: number;
  tapCancels: number;
  firstTouchMs: number | null;
  /** posterior predictive P(chosen) before this answer updated the model */
  predictiveChosen: number;
  /** P(chosen) under the final posterior (filled at completion) */
  fitProb?: number;
  eig?: number;
  selectReason?: string;
  cusumAfter: number;
}

/** Label Detective (memory challenge): does protein even get noticed on a pack? */
export interface LabelQuestion {
  kind: "price" | "protein";
  snackId: string;
  options: number[];
  correct: number;
  answer: number | null;
  ms: number;
}
export interface LabelData {
  packs: { snackId: string; price: number }[];
  questions: LabelQuestion[];
  peekMs: number;
}

/** Gut Check (swipe stack): fast, deliberately timed gut reactions. */
export interface GutSwipe {
  snackId: string;
  price: number;
  right: boolean;
  ms: number;
  reversals: number;
}
export interface GutData {
  swipes: GutSwipe[];
}

/** Peek & Pick (process tracing): hidden attributes, limited peeks, then a choice. */
export type PeekAttr = "price" | "protein" | "taste" | "sugar";
export interface PeekData {
  snacks: { snackId: string; price: number }[];
  reveals: { snackId: string; attr: PeekAttr; ms: number }[];
  choice: string | null;
  ms: number;
}

/** Bid It (BDM auction): max price per context; a random price decides if you "buy". */
export interface BidRound {
  momentId: string;
  snackId: string;
  bid: number;
  randomPrice: number;
  won: boolean;
  ms: number;
  adjustments: number;
}
export interface BidData {
  rounds: BidRound[];
  coins: number;
}

/**
 * Rewards ledger. Integrity rule: points NEVER depend on what you choose in preference games.
 * They come from progress, random gifts, skill (memory / predicting others) and careful play.
 */
export type RewardKind = "progress" | "gift" | "skill" | "bonus" | "quality" | "badge";
export interface RewardEvent {
  id: string;
  kind: RewardKind;
  label: string;
  points: number;
  emoji: string;
  at: string; // stage it was earned at
}

/** Optional bonus round: predict which snack more players picked (skill, skippable). */
export interface BonusData {
  questions: { momentId: string; options: { snackId: string; price: number }[]; guess: number | null; correctIdx: number | null }[];
  skipped: boolean;
  ms: number;
}

/** My Snack Week: how often each snack moment really happens (turns ₹/g into weekly demand). */
export interface WeekData {
  /** snacks per week at each moment (midpoint of the chosen band) */
  freq: Record<string, number>;
  /** answer to the separate "how many snacks in a whole week?" check */
  overall: number;
  /** sum of moments ÷ overall (≈1 = consistent; built-in probe) */
  consistency: number | null;
  changes: number;
  ms: number;
}

/** Build-a-Bar: spend 10 recipe points on a bar, then a cost squeeze takes 3 away. */
export interface BarData {
  alloc: Record<string, number>; // attr -> level 0..4 (sums to BAR_BUDGET)
  final: Record<string, number>; // after the squeeze (sums to BAR_SQUEEZE)
  /** order in which points were removed in the squeeze */
  cutOrder: string[];
  moves: number;
  name: string;
  ms: number;
}

export interface ShelfData {
  prices: { snackId: string; price: number }[];
  basket: Record<string, number>;
  budget: number;
  squeezeBudget: number;
  removed: { snackId: string; price: number; order: number }[];
  finalBasket: Record<string, number>;
  ms: number;
}

export interface CrowdData {
  itemId: string;
  targetSnackId: string;
  guessPct: number;
  actualPct: number | null;
  adjustments: number;
  ms: number;
}

export interface RealityData {
  category: string;
  why: string;
  typingMs: number;
  pasted: boolean;
  backspaces: number;
}

export interface FollowupData {
  type: ContradictionType;
  question: string;
  options: string[];
  answer: string | null;
  strength: number;
}

export type ContradictionType =
  | "stated_vs_revealed"
  | "context_switch"
  | "choice_vs_shelf"
  | "squeeze_protein_first"
  | "none";

export interface SessionCounters {
  hidden: number;
  idle: number;
  nudges: number;
  events: number;
}

export interface SessionData {
  id: string;
  studyId: string;
  participantId: string;
  deviceHash: string;
  ipHash: string;
  framing: FramingArm;
  anchor: AnchorArm;
  segment: string; // e.g. age band / gym-goer, self-reported at start
  startedAt: number;
  completedAt: number | null;
  status: "in_progress" | "completed" | "abandoned";
  stage: string;
  cusum: number;
  pendingItemId: string | null;
  pendingOrder: number[] | null;
  pendingShownAt: number | null;
  pendingExpectedMs: number | null;
  pendingCloseness: number | null;
  pendingPredictive: number[] | null;
  pendingReason: string | null;
  pendingEig: number | null;
  answers: AnswerRecord[];
  label: LabelData | null;
  gut: GutData | null;
  peek: PeekData | null;
  peekShownAt?: number | null;
  bid: BidData | null;
  bonus: BonusData | null;
  week: WeekData | null;
  bar: BarData | null;
  /** which optional games this player got, with scores and propensities */
  rotation: { pre: RotationDecision | null; post: RotationDecision | null };
  rewards: RewardEvent[];
  shelf: ShelfData | null;
  crowd: CrowdData | null;
  reality: RealityData | null;
  stated: number | null;
  followup: FollowupData | null;
  counters: SessionCounters;
  posterior: PosteriorSummary | null;
  /** why the adaptive engine stopped asking (converged / low information / max rounds) */
  stopReason?: string;
  points: number;
  simulated: boolean;
  archetype: string | null;
}
