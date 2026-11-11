import { buildInsights } from "@/lib/insights/build";
import { ruleRecommendations } from "@/lib/ai/insights";
import { InsightsView } from "@/components/insights/InsightsView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brand HQ · Snack Moments" };

export default async function InsightsPage({ params, searchParams }: { params: Promise<{ studyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { studyId } = await params;
  const sp = await searchParams;
  const source = sp.source === "real" ? "real" : sp.source === "simulated" ? "simulated" : "all";
  const data = await buildInsights(studyId, source);
  return <InsightsView data={data} initialRecs={ruleRecommendations(data.evidence)} studyId={studyId} />;
}
