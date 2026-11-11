import { z } from "zod";
import { aiObject } from "./client";
import type { Hypothesis } from "@/lib/insights/evidence";

export const Recommendation = z.object({
  headline: z.string().max(200),
  recommendations: z
    .array(
      z.object({
        action: z.string().max(220),
        why: z.string().max(300),
        evidence: z.array(z.string()).max(4), // hypothesis ids, e.g. ["H2","H9"]
        confidence: z.enum(["low", "medium", "high"]),
        validateNext: z.string().max(200),
      }),
    )
    .max(5),
});
export type Recs = z.infer<typeof Recommendation>;

/** Rule-based fallback: one recommendation per supported hypothesis. */
export function ruleRecommendations(h: Hypothesis[]): Recs {
  const by = new Map(h.map((x) => [x.id, x]));
  const recs: Recs["recommendations"] = [];
  const sup = (id: string) => by.get(id)?.status === "supported";
  if (sup("H2"))
    recs.push({ action: "Position protein snacks for desk and post-gym moments, not late-night indulgence.", why: "Protein wins far more often in functional moments.", evidence: ["H2"], confidence: by.get("H2")!.confidence, validateNext: by.get("H2")!.nextExperiment });
  if (sup("H9"))
    recs.push({ action: "Test a smaller, cheaper pack before adding more protein.", why: "People who say protein matters but skip it mostly blame price, not taste.", evidence: ["H9", "H1"], confidence: by.get("H9")!.confidence, validateNext: by.get("H9")!.nextExperiment });
  if (sup("H4"))
    recs.push({ action: "Put grams of protein next to the price on the front of pack.", why: "Price is noticed on a shelf glance; protein mostly is not.", evidence: ["H4"], confidence: by.get("H4")!.confidence, validateNext: by.get("H4")!.nextExperiment });
  if (sup("H3"))
    recs.push({ action: "Lead with the health / protein claim in listings.", why: "Health-led cards raised protein choices in a randomised test.", evidence: ["H3"], confidence: by.get("H3")!.confidence, validateNext: by.get("H3")!.nextExperiment });
  if (sup("H6"))
    recs.push({ action: "Don't price off stated willingness-to-pay surveys.", why: "Direct bids run above what choices imply.", evidence: ["H6", "H1"], confidence: by.get("H6")!.confidence, validateNext: by.get("H6")!.nextExperiment });
  if (sup("H10"))
    recs.push({ action: "Don't build the next bar straight from 'design your ideal bar' feedback.", why: "People ask for more protein when designing than their own choices reward.", evidence: ["H10", "H1"], confidence: by.get("H10")!.confidence, validateNext: by.get("H10")!.nextExperiment });
  if (sup("H11"))
    recs.push({ action: "Size the business on desk and post-gym occasions first.", why: "Most weekly snack moments are functional, where protein also wins more often.", evidence: ["H11", "H2"], confidence: by.get("H11")!.confidence, validateNext: by.get("H11")!.nextExperiment });
  return { headline: "What the evidence currently supports (rule-based summary; add an OpenRouter key for an AI synthesis).", recommendations: recs.slice(0, 6) };
}

export async function aiRecommendations(h: Hypothesis[], keyStats: unknown): Promise<{ recs: Recs; model: string | null }> {
  const r = await aiObject({
    role: "writer",
    schema: Recommendation,
    system:
      "You are a consumer-insights lead advising a protein-snack brand (Macros). Write decision-ready recommendations ONLY from the supplied hypotheses and statistics. " +
      "Every recommendation must cite hypothesis ids in `evidence`. Never invent numbers; never treat 'open' or 'contradicted' hypotheses as support. " +
      "Say what still needs validating (e.g. field tests), because the game measures hypothetical choices. Max 5 recommendations, plain English.",
    prompt: JSON.stringify({ hypotheses: h.map(({ id, statement, status, confidence, evidence, nextExperiment }) => ({ id, statement, status, confidence, evidence, nextExperiment })), keyStats }),
  });
  return r ? { recs: r.value, model: r.model } : { recs: ruleRecommendations(h), model: null };
}
