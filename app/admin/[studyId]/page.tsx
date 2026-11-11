import { buildAdmin, type Filters } from "@/lib/admin/aggregate";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Snack Moments" };

export default async function AdminPage({ params, searchParams }: { params: Promise<{ studyId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { studyId } = await params;
  const sp = await searchParams;
  const filters: Filters = {
    source: (["all", "real", "simulated"].includes(sp.source ?? "") ? sp.source : "all") as Filters["source"],
    segment: sp.segment ?? "all",
    framing: (["all", "health", "taste"].includes(sp.framing ?? "") ? sp.framing : "all") as Filters["framing"],
  };
  const data = await buildAdmin(studyId, filters);
  return <AdminDashboard data={data} studyId={studyId} initialTab={sp.tab} />;
}
