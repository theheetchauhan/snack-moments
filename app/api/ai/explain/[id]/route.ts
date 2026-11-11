import { NextResponse } from "next/server";
import { loadSession, setAiExplanation } from "@/lib/session/repo";
import { fullScores } from "@/lib/session/engine";
import { aiExplanation, ruleExplanation } from "@/lib/ai/session";
import { aiEnabled, MODELS } from "@/lib/ai/client";

/** Re-explains one session for a reviewer. Only signal summaries are sent to the LLM (no ids, device or IP). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await loadSession(id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  const sc = fullScores(s);
  const ai = await aiExplanation(sc.quality, sc.divergence, s);
  const explanation = ai ?? ruleExplanation(sc.quality, sc.divergence, s);
  await setAiExplanation(id, explanation);
  return NextResponse.json({ explanation: ai ? `${explanation}  (AI · ${MODELS.fast})` : `${explanation}  (rule-based: ${aiEnabled() ? "AI call failed" : "no OPENROUTER_API_KEY set"})` });
}
