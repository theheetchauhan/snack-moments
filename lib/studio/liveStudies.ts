/**
 * Library of live studies. Before designing anything new, the engine checks whether a live study
 * already answers this question. If it does, the engine reuses that proven design exactly (same
 * moments, same snack cards and prices from the live question bank, same hidden checks), so the
 * Lab's output is identical to what players actually play, and identical on every run.
 */
import { getMoment, getSnack, PROTEIN_STUDY } from "@/lib/study/protein";
import type { GameSpecT } from "./contract";

export interface LiveStudy {
  id: string;
  name: string;
  playHref: string;
  /** does this question/decision belong to the live study? */
  matches: (question: string, decision: string) => boolean;
  construct: "tradeoff";
  spec: () => GameSpecT;
}

const CART = "Which one goes in your cart?";
const DUEL = "Head to head: which one wins?";

/** The first live bank question for a moment, in the format the live game shows it. */
function liveRound(momentId: string, format: "triad" | "duel") {
  const item = PROTEIN_STUDY.items.find((i) => i.momentId === momentId && i.format === format && i.probe === "none")!;
  const m = getMoment(momentId);
  return {
    scene: m.label,
    emoji: m.emoji,
    prompt: `${m.scene} ${format === "duel" ? DUEL : CART}`,
    options: item.options.map((o) => {
      const s = getSnack(o.snackId);
      return { label: s.name, emoji: s.emoji, detail: `₹${o.price} · ${s.proteinG}g protein · ${s.tasteCue}` };
    }),
  };
}

export const LIVE_STUDIES: LiveStudy[] = [
  {
    id: "protein",
    name: "Snack Moments",
    playHref: "/play",
    matches: (q, d) => /protein/i.test(`${q} ${d}`) && /snack/i.test(`${q} ${d}`),
    construct: "tradeoff",
    spec: () => ({
      redesignedQuestion: `Pick a snack for everyday moments (4:30pm at your desk, after the gym, 11pm when you can't sleep…). ${CART}`,
      formatId: "snack_moments",
      formatWhy:
        "How much protein matters is really a trade-off between protein, price and taste, so it needs forced choices with no timer. Choice cards adapt to each player, picking the next question that teaches the most, and feed a choice model.",
      title: "Snack Moments",
      howToPlay: "Pick one snack for each moment. There are no right answers.",
      rounds: [liveRound("desk_430", "triad"), liveRound("late_night", "duel"), liveRound("post_gym", "triad")],
      budget: null,
      hiddenChecks: [
        { kind: "position_shuffle", how: "Card order is shuffled for every player and every question." },
        { kind: "repeat", how: "One question comes back later with the cards in a different order." },
        { kind: "dominated", how: "Sometimes the same snack appears twice at two prices; picking the pricier one signals inattention." },
        { kind: "timing", how: "Each answer's time is compared with how long the cards take to read." },
        { kind: "stated_last", how: "The original 1–5 rating is asked at the very end and compared with the choices made." },
      ],
      rewardBasis: "careful_play",
      timerSeconds: null,
      optionStyling: "identical",
      askOriginalLast: true,
      insight:
        "What 1g of protein is worth to each person in each moment (₹ per gram), what really drives their choices (price, taste or protein), and the gap between how much they say protein matters and how they actually choose.",
      rationale:
        "A 1–5 rating costs nothing, so almost everyone says protein matters. In the game, protein always costs money or taste. Card positions are shuffled, one question repeats, an overpriced twin checks attention, and the original rating comes last to measure say vs do.",
    }),
  },
];

export const findLiveStudy = (question: string, decision: string) => LIVE_STUDIES.find((s) => s.matches(question, decision)) ?? null;
