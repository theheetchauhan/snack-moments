/**
 * The measurement contract: rules every generated game must pass so that gamifying a question
 * never changes what it measures. This is plain code, not AI: the AI proposes a game, these rules
 * check it, and anything that breaks a rule is fixed automatically (and reported).
 */
import { z } from "zod";
import { FORMATS, type ConstructKind } from "@/lib/registry/formats";

export const CONSTRUCTS: ConstructKind[] = [
  "tradeoff",
  "gut_reaction",
  "attention",
  "priority_allocation",
  "projective",
  "wtp",
  "recall_behaviour",
  "information_search",
  "frequency",
];

/** Which on-screen mechanic renders each registry format in the preview. */
export const MECHANIC: Record<string, Mechanic> = {
  snack_moments: "choice_cards",
  showdown: "choice_cards",
  reality_check: "choice_cards",
  label_detective: "choice_cards",
  peek_pick: "peek",
  gut_check: "swipe",
  bid_it: "bid",
  stock_shelf: "budget",
  build_bar: "budget",
  guess_crowd: "crowd_guess",
  snack_week: "frequency",
};
export type Mechanic = "choice_cards" | "peek" | "swipe" | "bid" | "budget" | "crowd_guess" | "frequency";

/** Plain names for the format families, so other categories don't see snack-specific names. */
export const FORMAT_FAMILY: Record<string, string> = {
  snack_moments: "Adaptive choice cards",
  showdown: "Head-to-head duel",
  reality_check: "Last-purchase recall",
  label_detective: "Glance & recall",
  peek_pick: "Peek & pick (hidden details)",
  gut_check: "Gut-reaction swipe",
  bid_it: "Bid what it's worth",
  stock_shelf: "Budget shelf + squeeze",
  build_bar: "Design it + cost squeeze",
  guess_crowd: "Guess the crowd",
  snack_week: "Frequency map",
};

export const CHECK_KINDS = ["repeat", "dominated", "attention", "timing", "position_shuffle", "stated_last"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];
export const CHECK_NAME: Record<CheckKind, string> = {
  repeat: "A question comes back later (consistency)",
  dominated: "One option is clearly worse (attention)",
  attention: "An instructed-response check",
  timing: "Expected-time check (catches rushing, no visible timer)",
  position_shuffle: "Option positions shuffled",
  stated_last: "The original question asked last (say vs do)",
};

export const GameSpec = z.object({
  redesignedQuestion: z.string(),
  formatId: z.string(),
  formatWhy: z.string(),
  title: z.string(),
  howToPlay: z.string(),
  rounds: z
    .array(
      z.object({
        scene: z.string(),
        emoji: z.string(),
        prompt: z.string(),
        options: z.array(z.object({ label: z.string(), emoji: z.string(), detail: z.string() })),
      }),
    )
    ,
  budget: z.number().nullable(),
  hiddenChecks: z.array(z.object({ kind: z.enum(CHECK_KINDS), how: z.string() })),
  rewardBasis: z.enum(["careful_play", "accuracy", "completion", "specific_answer"]),
  timerSeconds: z.number().nullable(),
  optionStyling: z.enum(["identical", "varied"]),
  askOriginalLast: z.boolean(),
  insight: z.string(),
  rationale: z.string(),
});
export type GameSpecT = z.infer<typeof GameSpec>;

export interface ContractCheck {
  rule: string;
  why: string;
  status: "pass" | "fixed" | "fail";
  note?: string;
}

const LEADING = /\b(healthy choice|healthier choice|best|smart|smarter|recommended|guilt[- ]free|perfect|responsible|right choice)\b/gi;

/** Checks a game against the contract; returns the repaired game and what happened to each rule. */
export function enforceContract(input: GameSpecT, construct: ConstructKind): { spec: GameSpecT; checks: ContractCheck[] } {
  const spec: GameSpecT = JSON.parse(JSON.stringify(input));
  spec.rounds = spec.rounds.slice(0, 4).map((r) => ({ ...r, options: r.options.slice(0, 6) }));
  spec.hiddenChecks = spec.hiddenChecks.slice(0, 8);
  const checks: ContractCheck[] = [];
  const add = (rule: string, why: string, ok: boolean, fix: () => string | void) => {
    if (ok) return checks.push({ rule, why, status: "pass" });
    const note = fix() || undefined;
    checks.push({ rule, why, status: "fixed", note });
  };

  let format = FORMATS.find((f) => f.id === spec.formatId);
  add(
    "The game measures what the question needs",
    "A format is only allowed if it is built to measure this kind of behaviour.",
    !!format && format.measures.includes(construct),
    () => {
      const alt = FORMATS.find((f) => f.measures.includes(construct)) ?? FORMATS[0];
      const was = format ? (FORMAT_FAMILY[format.id] ?? format.name) : spec.formatId;
      spec.formatId = alt.id;
      format = alt;
      return `Switched from “${was}” to “${FORMAT_FAMILY[alt.id]}”.`;
    },
  );
  add(
    "No timer on a considered choice",
    "A countdown turns a thoughtful trade-off into a reflex test, which changes what is measured.",
    !(format && !format.timingValid && spec.timerSeconds),
    () => {
      spec.timerSeconds = null;
      return "Removed the countdown.";
    },
  );
  add(
    "Points never depend on which answer is picked",
    "If one answer earns more, players chase points instead of telling the truth.",
    spec.rewardBasis !== "specific_answer" && spec.rewardBasis !== "completion",
    () => {
      const was = spec.rewardBasis;
      spec.rewardBasis = "careful_play";
      return was === "completion" ? "Points for finishing reward rushing; now points reward careful play." : "Points now reward careful play, not a particular answer.";
    },
  );
  add("Every option looks the same", "A highlighted or nicer-looking option pulls choices towards it.", spec.optionStyling === "identical", () => {
    spec.optionStyling = "identical";
    return "All options now share one card style.";
  });
  const leading = spec.rounds
    .flatMap((r) => r.options.map((o) => `${o.label} ${o.detail}`))
    .join(" ")
    .match(LEADING);
  add("Neutral option wording", "Words like “healthy choice” or “smart pick” tell players which answer looks good.", !leading, () => {
    for (const r of spec.rounds)
      for (const o of r.options) {
        o.label = o.label
          .replace(LEADING, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        o.detail = o.detail
          .replace(LEADING, "")
          .replace(/\s{2,}/g, " ")
          .trim();
      }
    return `Removed: ${[...new Set(leading!.map((w) => w.toLowerCase()))].join(", ")}.`;
  });
  const has = (k: CheckKind) => spec.hiddenChecks.some((c) => c.kind === k);
  add("A built-in consistency check", "Asking something twice (or adding a clearly worse option) shows who answers at random.", has("repeat") || has("dominated"), () => {
    spec.hiddenChecks.push({ kind: "repeat", how: "One round comes back later with the options in a different order." });
    return "Added a repeated round.";
  });
  add("Inattentive players are caught", "A clearly worse option, or a round that asks for a specific pick, shows who isn't really looking.", has("dominated") || has("attention"), () => {
    spec.hiddenChecks.push({ kind: "attention", how: "One round asks the player to pick a specific option; picking anything else shows they weren't reading." });
    return "Added an attention check.";
  });
  add("Option positions are shuffled", "Without shuffling, people who always tap the same spot look like they have a preference.", has("position_shuffle"), () => {
    spec.hiddenChecks.push({ kind: "position_shuffle", how: "Option order is randomised for every player and every round." });
    return "Shuffled option order.";
  });
  add("Rushing is detected without a visible timer", "Each answer is compared with the time needed to read it.", has("timing"), () => {
    spec.hiddenChecks.push({ kind: "timing", how: "Each answer's time is compared with how long it takes to read the round." });
    return "Added an expected-time check.";
  });
  add("The original question is asked last", "Asking it after the game shows the gap between what people say and what they did.", spec.askOriginalLast, () => {
    spec.askOriginalLast = true;
    if (!has("stated_last")) spec.hiddenChecks.push({ kind: "stated_last", how: "The original question is asked at the very end and compared with the choices made." });
    return "Moved the original question to the end.";
  });
  if (spec.askOriginalLast && !has("stated_last"))
    spec.hiddenChecks.push({ kind: "stated_last", how: "The original question is asked at the very end and compared with the choices made." });
  return { spec, checks };
}

/** Which kinds of bad answering the game's hidden checks would catch. */
export function badActorCoverage(spec: GameSpecT) {
  const has = (k: CheckKind) => spec.hiddenChecks.some((c) => c.kind === k);
  return [
    { who: "Rusher", does: "taps through without reading", caughtBy: has("timing") ? CHECK_NAME.timing : null },
    { who: "Same-spot tapper", does: "always taps the same position", caughtBy: has("position_shuffle") ? CHECK_NAME.position_shuffle : null },
    { who: "Random clicker", does: "answers at random", caughtBy: has("repeat") ? CHECK_NAME.repeat : has("dominated") ? CHECK_NAME.dominated : null },
    { who: "Image-conscious answerer", does: "says what looks good", caughtBy: has("stated_last") ? CHECK_NAME.stated_last : null },
    { who: "Inattentive player", does: "isn't really looking", caughtBy: has("dominated") ? CHECK_NAME.dominated : has("attention") ? CHECK_NAME.attention : null },
  ];
}
