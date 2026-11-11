"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminData } from "@/lib/admin/aggregate";
import { RotationSection } from "./RotationSection";
import { SessionsSection } from "./SessionsSection";
import { EvidenceBoard } from "./EvidenceBoard";
import { OverviewSection } from "./OverviewSection";
import { FunnelSection } from "./FunnelSection";
import { TimingSection } from "./TimingSection";
import { PatternsSection } from "./PatternsSection";
import { NoiseChecksSection } from "./NoiseChecksSection";
import { DivergenceSection } from "./DivergenceSection";
import { ExperimentsSection } from "./ExperimentsSection";
import { GamesSection } from "./GamesSection";
import { RewardsSection } from "./RewardsSection";
import { FraudSection } from "./FraudSection";
import { ItemHealthSection } from "./ItemHealthSection";

/** Tabs, grouped so a new reader knows where to look. The letters are internal keys only. */
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Start here",
    items: [
      ["A", "Overview"],
      ["K", "Player Surveys"],
    ],
  },
  {
    title: "How is the game doing?",
    items: [
      ["B", "Funnel"],
      ["H", "Games & engagement"],
      ["I", "Rewards"],
      ["L", "Item health"],
      ["N", "Game rotation"],
    ],
  },
  {
    title: "What did we learn?",
    items: [
      ["F", "Divergence"],
      ["G", "Experiments"],
      ["M", "Evidence board"],
    ],
  },
  {
    title: "Can we trust the answers?",
    items: [
      ["C", "Timing"],
      ["D", "Patterns"],
      ["E", "Noise checks"],
      ["J", "Fraud"],
    ],
  },
];
const TAB_NAME: Record<string, string> = Object.fromEntries(GROUPS.flatMap((g) => g.items));

export function AdminDashboard({ data, studyId, initialTab }: { data: AdminData; studyId: string; initialTab?: string }) {
  const [tab, setTab] = useState<string>(initialTab && initialTab in TAB_NAME ? initialTab : "A");
  const [menu, setMenu] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const router = useRouter();
  const f = data.filters;
  const q = (patch: Partial<typeof f>) => {
    const n = { ...f, ...patch };
    return `?source=${n.source}&segment=${encodeURIComponent(n.segment)}&framing=${n.framing}&tab=${tab}`;
  };
  const open = (t: string) => {
    setTab(t);
    setMenu(false);
    window.scrollTo({ top: 0 });
  };

  const simulate = async () => {
    setSimBusy(true);
    await fetch(`/api/admin/${studyId}/simulate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: 300, reset: true }) });
    setSimBusy(false);
    router.refresh();
  };

  const empty = data.overview.completed === 0;
  const filtered = f.framing !== "all" || f.segment !== "all";

  const sidebar = (
    <div className="flex min-h-full flex-col gap-4">
      <Link href="/" className="hidden items-center gap-2.5 lg:flex" aria-label="Snack Moments home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-10 w-10" />
        <span className="leading-tight">
          <span className="block font-display text-base font-extrabold">Snack Moments</span>
          <span className="block text-xs text-muted">Response intelligence</span>
        </span>
      </Link>

      <nav className="grid gap-3" aria-label="Dashboard sections">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-2 text-sm font-bold text-ink">{g.title}</p>
            <ul className="mt-1 grid gap-0.5">
              {g.items.map(([k, label]) => (
                <li key={k}>
                  <button
                    onClick={() => open(k)}
                    aria-current={tab === k ? "page" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm ${tab === k ? "bg-ink font-semibold text-white" : "text-muted hover:bg-bg hover:text-ink"}`}
                  >
                    <span>{label}</span>
                    {k === "K" && data.overview.needsReview > 0 && (
                      <span title="Surveys waiting for review" className="rounded-full bg-bad px-1.5 text-[11px] font-bold tabular-nums text-white">
                        {data.overview.needsReview}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="grid gap-3 border-t border-line pt-4 text-sm">
        <p className="px-2 text-sm font-bold text-ink">Filter players</p>
        <FilterGroup
          label="Card wording they saw"
          value={f.framing}
          options={["all", "health", "taste"]}
          names={{ all: "All", health: "Protein", taste: "Taste" }}
          href={(v) => q({ framing: v as typeof f.framing })}
        />
        <label className="grid gap-1 px-2">
          <span className="text-xs text-muted">Player group</span>
          <select className="rounded-lg border border-line bg-surface px-2 py-1.5" value={f.segment} onChange={(e) => router.push(q({ segment: e.target.value }))}>
            <option value="all">Everyone</option>
            {data.segments.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {filtered && (
          <Link href={`?tab=${tab}`} className="px-2 text-xs font-semibold underline">
            Clear filters
          </Link>
        )}
      </div>

      <div className="mt-auto grid gap-2 border-t border-line pt-4 text-sm">
        <Link href={`/insights/${studyId}`} className="rounded-lg border border-line px-3 py-2 font-semibold hover:bg-bg">
          Brand HQ →
        </Link>
        <Link href="/studio" className="rounded-lg border border-line px-3 py-2 font-semibold hover:bg-bg">
          Question Lab →
        </Link>
      </div>
    </div>
  );

  return (
    <div className="theme-admin min-h-dvh bg-bg lg:flex">
      {/* phone: slim top bar with a menu button */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link href="/" aria-label="Snack Moments home" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-8 w-8" />
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{TAB_NAME[tab]}</span>
        <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold">
          {menu ? "✕ Close" : "☰ Sections"}
        </button>
      </header>
      {menu && <div className="fixed inset-x-0 bottom-0 top-[53px] z-20 overflow-y-auto bg-surface p-4 lg:hidden">{sidebar}</div>}

      {/* desktop: left sidebar that stays in place while the page scrolls */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-r border-line bg-surface p-4 lg:block">{sidebar}</aside>

      <main className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-6xl">
          <h1 className="mb-4 hidden font-display text-2xl font-bold lg:block">{TAB_NAME[tab]}</h1>
          {empty ? (
            <div className="card p-8 text-center">
              <p className="font-display text-xl font-bold">No completed sessions yet</p>
              <p className="mt-1 text-sm text-muted">Play a round at /play, or generate 300 sample sessions to explore the dashboard.</p>
              <button onClick={simulate} disabled={simBusy} className="btn btn-primary mt-4">
                {simBusy ? "Generating…" : "Generate 300 sample sessions"}
              </button>
            </div>
          ) : (
            <Section tab={tab} data={data} studyId={studyId} go={open} />
          )}
        </div>
      </main>
    </div>
  );
}

function FilterGroup({ label, value, options, names, href }: { label: string; value: string; options: string[]; names: Record<string, string>; href: (v: string) => string }) {
  return (
    <div className="grid gap-1 px-2" role="group" aria-label={label}>
      <span className="text-xs text-muted">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <Link key={o} href={href(o)} className={`flex-1 rounded-md px-2 py-1 text-center ${o === value ? "bg-ink text-white" : "border border-line bg-surface hover:bg-bg"}`}>
            {names[o] ?? o}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Section({ tab, data, studyId, go }: { tab: string; data: AdminData; studyId: string; go: (tab: string) => void }) {
  switch (tab) {
    case "A":
      return <OverviewSection data={data} go={go} />;
    case "B":
      return <FunnelSection data={data} />;
    case "C":
      return <TimingSection data={data} />;
    case "D":
      return <PatternsSection data={data} />;
    case "E":
      return <NoiseChecksSection data={data} />;
    case "F":
      return <DivergenceSection data={data} />;
    case "G":
      return <ExperimentsSection data={data} />;
    case "H":
      return <GamesSection data={data} />;
    case "I":
      return <RewardsSection data={data} />;
    case "J":
      return <FraudSection data={data} />;
    case "K":
      return <SessionsSection data={data} studyId={studyId} />;
    case "L":
      return <ItemHealthSection data={data} />;
    case "M":
      return <EvidenceBoard hypotheses={data.evidence} />;
    case "N":
      return <RotationSection data={data} />;
  }
  return null;
}
