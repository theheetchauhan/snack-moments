/**
 * Construct-first format registry. A format is chosen because it can MEASURE the construct,
 * not because it looks fun. Each entry declares what it measures, the biases it is exposed to,
 * whether timing is valid, and which probes it needs. The AI studio may only pick from here.
 */
export type ConstructKind =
  | "tradeoff"
  | "gut_reaction"
  | "attention"
  | "priority_allocation"
  | "projective"
  | "wtp"
  | "recall_behaviour"
  | "information_search"
  | "frequency";

export interface FormatSpec {
  id: string;
  name: string;
  measures: ConstructKind[];
  timingValid: boolean; // may a timer / speed be part of the measurement?
  biasRisks: string[];
  probes: string[];
  improvesOn: string; // generic mechanic it builds on, and how we changed it
  output: string;
}

export const FORMATS: FormatSpec[] = [
  {
    id: "snack_moments",
    name: "Snack Moments (adaptive 3-card choice)",
    measures: ["tradeoff"],
    timingValid: false,
    biasRisks: ["position bias", "anchoring from first item", "framing"],
    probes: ["repeat item (flipped)", "dominated option", "CUSUM-triggered probe"],
    improvesOn: "Tap-select choice → adaptive item selection (expected information gain), shuffled positions, framing arm randomised",
    output: "Per-person Bayesian choice model: ₹/g protein by context, driver profile",
  },
  {
    id: "showdown",
    name: "Showdown (head-to-head duel)",
    measures: ["tradeoff"],
    timingValid: false,
    biasRisks: ["left/right bias"],
    probes: ["position balance"],
    improvesOn: "Head-to-head knockout → duels are served by the same adaptive engine and feed the same model, so formats can be compared",
    output: "Same model; duel vs triad comparison",
  },
  {
    id: "gut_check",
    name: "Gut Check (swipe)",
    measures: ["gut_reaction"],
    timingValid: true,
    biasRisks: ["straight-lining", "speed-running"],
    probes: ["too-fast-to-read check", "all-same-direction check"],
    improvesOn: "Swipe stack → timed on purpose (gut reactions), compared against considered choices (gut vs considered gap)",
    output: "Gut appeal of protein vs indulgent snacks",
  },
  {
    id: "label_detective",
    name: "Label Detective (memory)",
    measures: ["attention"],
    timingValid: true,
    biasRisks: ["priming if run after protein is mentioned"],
    probes: ["answer-speed check"],
    improvesOn: "Memory challenge → runs FIRST so it measures unprompted attention to price vs protein on a pack",
    output: "What gets noticed on a pack",
  },
  {
    id: "peek_pick",
    name: "Peek & Pick (process tracing)",
    measures: ["information_search", "tradeoff"],
    timingValid: false,
    biasRisks: ["order of attribute rows"],
    probes: ["zero-peek pick"],
    improvesOn: "Mystery reveal → limited peeks make attention a scarce resource; reveal order = real priority (Mouselab-style)",
    output: "First attribute checked, whether protein is ever checked",
  },
  {
    id: "bid_it",
    name: "Bid It (BDM auction)",
    measures: ["wtp"],
    timingValid: false,
    biasRisks: ["hypothetical bias without real payout"],
    probes: ["bid vs model-implied price"],
    improvesOn: "Slider → Becker–DeGroot–Marschak mechanism where bidding your true value is optimal; real vouchers make it incentive-compatible",
    output: "Direct WTP per context, checked against the choice model",
  },
  {
    id: "stock_shelf",
    name: "Stock the Shelf + budget squeeze",
    measures: ["priority_allocation"],
    timingValid: false,
    biasRisks: ["variety-seeking", "budget anchoring"],
    probes: ["choice vs shelf consistency"],
    improvesOn: "Budget allocation → prices warm-started at the player's indifference point, then a squeeze: what is cut first",
    output: "Staples vs nice-to-haves under constraint",
  },
  {
    id: "guess_crowd",
    name: "Guess the Crowd + bonus round",
    measures: ["projective"],
    timingValid: false,
    biasRisks: ["false consensus"],
    probes: ["prediction accuracy"],
    improvesOn: "Others' perspective framing → paired with own choices to compute a self-vs-crowd desirability index; reward for accuracy only",
    output: "Desirability index, 'surprisingly popular' signal",
  },
  {
    id: "build_bar",
    name: "Build-a-Bar (design + cost squeeze)",
    measures: ["priority_allocation"],
    timingValid: false,
    biasRisks: ["social desirability (designing a 'healthy' bar)", "default spreading (2 points everywhere)"],
    probes: ["cost squeeze (what is protected)", "design vs choice gap"],
    improvesOn: "Budget-allocation slider → points buy concrete recipe levels (grams, ₹), then a squeeze removes 3; compared with the player's own choices",
    output: "Ideal-product priorities, must-haves vs nice-to-haves, design-vs-choice gap",
  },
  {
    id: "snack_week",
    name: "My Snack Week (frequency map)",
    measures: ["frequency"],
    timingValid: false,
    biasRisks: ["recall bias", "over-reporting 'healthy' moments"],
    probes: ["whole-week total asked first, checked against the moment-by-moment sum"],
    improvesOn: "Frequency grid → asked by real snack moment and cross-checked, then multiplied with ₹/g to turn preferences into weekly volume",
    output: "Snack moments per week by context; weekly demand in the brand simulator",
  },
  {
    id: "reality_check",
    name: "Reality check (last purchase)",
    measures: ["recall_behaviour"],
    timingValid: false,
    biasRisks: ["recall bias"],
    probes: ["AI open-text authenticity check"],
    improvesOn: "Open text → short, optional, checked for paste / gibberish / AI text",
    output: "Real-world anchor for the game choices",
  },
];

export function formatsFor(kind: ConstructKind) {
  return FORMATS.filter((f) => f.measures.includes(kind));
}
