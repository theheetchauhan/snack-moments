/**
 * Blueprint vs live game. For the protein question, the live Snack Moments game is the finished
 * build of what the engine should design. This compares the engine's blueprint with the live game,
 * feature by feature, so the live game works as the benchmark the engine is scored against.
 */
import type { StudioResult } from "@/lib/ai/studio";

export interface LiveFeature {
  feature: string;
  where: string; // where to see it in the live game
  href: string;
  inBlueprint: boolean | null; // null = live-only (the engine doesn't generate this yet)
}

export const isLiveCase = (q: string) => /protein|snack/i.test(q);

export function liveMatch(res: StudioResult) {
  const s = res.final.spec;
  const checks = new Set(s.hiddenChecks.map((c) => c.kind));
  const cards = s.rounds.flatMap((r) => r.options.map((o) => `${o.label} ${o.detail}`));
  const features: LiveFeature[] = [
    { feature: "Choices in real snack moments (desk, gym, late night…)", where: "Snack Moments", href: "/play", inBlueprint: s.rounds.filter((r) => r.scene).length >= 2 },
    {
      feature: "Every card shows price and protein, so protein always costs something",
      where: "Snack Moments cards",
      href: "/play",
      inBlueprint: cards.length > 0 && cards.every((c) => /₹/.test(c) && /\d+\s?g\b/i.test(c)),
    },
    { feature: "Forced choice with no timer", where: "Snack Moments", href: "/play", inBlueprint: s.timerSeconds == null && res.understanding.construct === "tradeoff" },
    { feature: "All cards styled the same", where: "Snack Moments", href: "/play", inBlueprint: s.optionStyling === "identical" },
    { feature: "Card positions shuffled", where: "Patterns tab", href: "/admin/protein?tab=D", inBlueprint: checks.has("position_shuffle") },
    { feature: "A question comes back later (repeat check)", where: "Noise checks tab", href: "/admin/protein?tab=E", inBlueprint: checks.has("repeat") },
    { feature: "Overpriced-twin card (attention check)", where: "Noise checks tab", href: "/admin/protein?tab=E", inBlueprint: checks.has("dominated") },
    { feature: "Rushing detected against reading time", where: "Timing tab", href: "/admin/protein?tab=C", inBlueprint: checks.has("timing") },
    { feature: "The 1–5 rating asked last (say vs do)", where: "Divergence tab", href: "/admin/protein?tab=F", inBlueprint: s.askOriginalLast },
    { feature: "Guess the Crowd (the indirect version)", where: "Guess the Crowd", href: "/play", inBlueprint: res.candidates.some((c) => c.approach === "indirect") },
    {
      feature: "Points for careful play, never for a particular answer",
      where: "Rewards tab",
      href: "/admin/protein?tab=I",
      inBlueprint: s.rewardBasis === "careful_play" || s.rewardBasis === "accuracy",
    },
    // built in the live game, next for the engine to generate
    { feature: "Picks the next question for each player (adaptive)", where: "Item health tab", href: "/admin/protein?tab=L", inBlueprint: null },
    { feature: "A follow-up question when answers contradict", where: "Divergence tab", href: "/admin/protein?tab=F", inBlueprint: null },
    { feature: "Bonus games chosen per player", where: "Game rotation tab", href: "/admin/protein?tab=N", inBlueprint: null },
    { feature: "₹ per gram and snack personality for every player", where: "Brand HQ", href: "/insights/protein", inBlueprint: null },
  ];
  const scored = features.filter((f) => f.inBlueprint !== null);
  return { features, matched: scored.filter((f) => f.inBlueprint).length, total: scored.length };
}
