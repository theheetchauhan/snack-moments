/**
 * The learning loop: a live question that Item health flags as weak comes back to the Lab and is
 * rewritten using its own evidence (how it performed with real players). The AI proposes new
 * options; code checks every snack and price is valid. Without a key, transparent rules rewrite it.
 */
import { z } from "zod";
import { aiObject } from "@/lib/ai/client";
import { getItem, getMoment, getSnack, SNACKS } from "@/lib/study/protein";

export interface ItemEvidence {
  itemId: string;
  verdict: string;
  shown: number;
  proteinRate: number | null;
  rushedPct: number | null;
}

const Rewrite = z.object({
  options: z.array(z.object({ snackId: z.string(), price: z.number() })).max(4),
  why: z.string().max(400),
  expected: z.string().max(240),
});

export type CardView = { emoji: string; name: string; price: number; protein: number };
const view = (o: { snackId: string; price: number }): CardView => {
  const s = getSnack(o.snackId);
  return { emoji: s.emoji, name: s.name, price: o.price, protein: s.proteinG };
};

export async function rewriteItem(ev: ItemEvidence) {
  const item = getItem(ev.itemId);
  const moment = getMoment(item.momentId);
  const before = item.options.map(view);
  const random = ev.verdict.includes("random");

  const ai = await aiObject({
    role: "writer",
    schema: Rewrite,
    system:
      "You fix weak questions in a live adaptive choice game about snacks. Each question shows one moment and 2–3 snack cards (price and protein). A good question is a clear, fair trade-off: the higher-protein option costs more, so the choice reveals how much protein is worth to the player. Use ONLY snack ids from the list. Prices are whole rupees between 10 and 250.",
    prompt: `Moment: ${moment.label}\nCurrent options: ${item.options.map((o) => `${o.snackId} at ₹${o.price} (${getSnack(o.snackId).proteinG}g protein)`).join("; ")}\nEvidence from ${ev.shown} real answers: ${ev.verdict}; high-protein option picked ${ev.proteinRate ?? "?"}% of the time; ${ev.rushedPct ?? "?"}% of answers rushed.\nAvailable snacks: ${SNACKS.map((s) => `${s.id} (${s.proteinG}g, usual ₹${s.basePrice})`).join(", ")}\n\nRewrite the options to fix the problem. Explain why in plain English, and say what you expect to change.`,
  });
  const valid = ai?.value.options
    .filter((o) => SNACKS.some((s) => s.id === o.snackId))
    .map((o) => ({ snackId: o.snackId, price: Math.round(Math.min(250, Math.max(10, o.price))) }));
  if (ai && valid && valid.length >= 2 && new Set(valid.map((o) => o.snackId)).size === valid.length) {
    return { by: "ai" as const, model: ai.model, moment: `${moment.emoji} ${moment.label}`, before, after: valid.map(view), why: ai.value.why, expected: ai.value.expected };
  }

  // rule-based rewrite
  const sorted = [...item.options].sort((a, b) => getSnack(a.snackId).proteinG - getSnack(b.snackId).proteinG);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  let after: { snackId: string; price: number }[];
  let why: string;
  let expected: string;
  if (random || item.options.length <= 2) {
    // a clear, fair premium: about ₹2.5 per extra gram of protein
    const premium = Math.round(((getSnack(high.snackId).proteinG - getSnack(low.snackId).proteinG) * 2.5) / 5) * 5;
    after = sorted.map((o) => (o === high ? { ...o, price: low.price + Math.max(10, premium) } : o));
    why = random
      ? "Answers looked random, which usually means the cards were too close to call or the price gap made no sense. The protein option now costs a clear, fair premium over the cheapest one, so each choice says something about the player."
      : "Often rushed, even with only two cards: the price gap was so large the answer felt obvious, so people stopped reading. A fair premium makes it a real decision again.";
    expected = "Choices should line up with each player's other answers, so the question tells players apart again.";
  } else {
    after = [low, high];
    why = "Often rushed: three cards with similar details take long to read, so people skim. Two cards with one clear difference (price vs protein) are quick to read properly.";
    expected = "Fewer rushed answers, and the same trade-off measured with less reading.";
  }
  return { by: "rules" as const, model: null, moment: `${moment.emoji} ${moment.label}`, before, after: after.map(view), why, expected };
}
