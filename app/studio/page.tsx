import StudioClient from "./StudioClient";
import { aiEnabled, MODELS } from "@/lib/ai/client";
import { buildAdmin } from "@/lib/admin/aggregate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question Lab · Snack Moments" };

export default async function StudioPage() {
  // the learning loop: live questions that Item health says need rewriting
  const admin = await buildAdmin("protein", { source: "all", segment: "all", framing: "all" }).catch(() => null);
  const queue = (admin?.itemHealth.items ?? [])
    .filter((i) => i.verdict.startsWith("Rewrite"))
    .map((i) => ({ itemId: i.id, label: i.label, moment: i.moment, verdict: i.verdict, shown: i.shown, proteinRate: i.proteinRate, rushedPct: i.rushedPct }));
  return <StudioClient aiOn={aiEnabled()} models={{ writer: MODELS.writer, critic: MODELS.critic, fast: MODELS.fast }} queue={queue} />;
}
