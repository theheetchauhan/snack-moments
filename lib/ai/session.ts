import { z } from "zod";
import { aiObject } from "./client";
import type { Signal, Divergence, QualityResult } from "@/lib/scoring/signals";
import type { SessionData } from "@/lib/session/types";

/** Plain-English explanation of a session's score for a founder / reviewer. */
export function ruleExplanation(q: QualityResult, d: Divergence, s: SessionData): string {
  const fired = q.signals.filter((x) => x.severity >= 0.5 && (!x.weak || q.strongSignals > 0));
  const parts: string[] = [];
  if (!fired.length) parts.push(`Clean session: ${s.answers.length} choices, timing in a normal range, probes passed.`);
  else parts.push(`${q.band.toUpperCase()} (${q.score}/100): ` + fired.map((x) => x.detail).join("; ") + ".");
  if (d.sayDoGap != null && d.sayDoGap >= 1.5)
    parts.push(`Insight, not a penalty: rated protein ${d.stated}/5 but behaved like ${d.revealedIndex.toFixed(1)}/5.`);
  if (s.followup?.answer) parts.push(`When asked, they said: "${s.followup.answer}".`);
  return parts.join(" ");
}

export async function aiExplanation(q: QualityResult, d: Divergence, s: SessionData): Promise<string | null> {
  const payload = {
    band: q.band,
    score: q.score,
    signals: q.signals.filter((x: Signal) => x.severity > 0).map((x) => ({ label: x.label, severity: x.severity, detail: x.detail })),
    rounds: s.answers.length,
    divergence: d,
    driver: s.posterior?.driver,
    followup: s.followup?.answer ? { question: s.followup.question, answer: s.followup.answer } : null,
  };
  const r = await aiObject({
    role: "fast",
    schema: z.object({ explanation: z.string().max(400) }),
    system:
      "You explain consumer-research session quality to a busy founder. Two sentences max, plain English, no jargon. " +
      "Only use facts present in the JSON. Distinguish NOISE (careless answering, lowers quality) from DIVERGENCE (say-do gaps — an insight, never an accusation). Never call a person a liar.",
    prompt: JSON.stringify(payload),
  });
  return r?.value.explanation ?? null;
}

/** Open-text authenticity check on the optional "why" answer. */
export async function textVerdict(s: SessionData): Promise<{ lowEffort: number; reason: string } | null> {
  const r = s.reality;
  if (!r || !r.why.trim()) return null;
  const heuristic = (): { lowEffort: number; reason: string } => {
    const t = r.why.trim();
    if (r.pasted) return { lowEffort: 0.6, reason: "Pasted rather than typed" };
    if (/^(.)\1{3,}$/.test(t) || /^[^aeiou\s]{6,}$/i.test(t)) return { lowEffort: 0.9, reason: "Looks like keyboard mashing" };
    if (t.length > 20 && r.typingMs < t.length * 25) return { lowEffort: 0.7, reason: "Typed implausibly fast" };
    return { lowEffort: 0, reason: "Plausible typed answer" };
  };
  const h = heuristic();
  if (h.lowEffort > 0) return h;
  const ai = await aiObject({
    role: "fast",
    schema: z.object({ lowEffort: z.number().min(0).max(1), reason: z.string().max(120) }),
    system:
      "Rate whether a survey open-text answer is low-effort (gibberish, off-topic, copy-paste boilerplate, or AI-generated marketing text). 0 = genuine, 1 = clearly low effort. Short, casual, typo-filled answers are GENUINE.",
    prompt: JSON.stringify({ question: "Why did you buy your last snack?", category: r.category, answer: r.why }),
  });
  return ai?.value ?? h;
}
