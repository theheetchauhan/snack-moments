import { NextResponse } from "next/server";
import { buildInsights } from "@/lib/insights/build";
import { aiRecommendations } from "@/lib/ai/insights";

/** AI synthesis over AGGREGATED statistics only. The LLM must cite hypothesis ids; it never sees raw sessions. */
export async function POST(_req: Request, { params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  const data = await buildInsights(studyId, "all");
  const r = await aiRecommendations(data.evidence, data.keyStats);
  return NextResponse.json(r);
}
