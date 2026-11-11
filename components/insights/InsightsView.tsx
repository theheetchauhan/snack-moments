"use client";
/**
 * Brand HQ: what a snack brand needs to know about its consumers, in plain words.
 * One audience switch drives the whole page. Sections answer, in order: the three things to know,
 * who the consumers are, when to show up, what they'll pay, a product what-if, say vs do,
 * their ideal product, how they read a pack, and what to do next.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AudienceData, InsightsData } from "@/lib/insights/build";
import type { Recs } from "@/lib/ai/insights";
import type { Hypothesis } from "@/lib/insights/evidence";
import { C, ExplainedChart, LegendRow } from "@/components/admin/charts";
import { DRIVER } from "@/lib/scoring/plain";

const COMPETITORS = [
  { name: "Masala chips", price: 20, protein: 3, ind: 0.9 },
  { name: "Masala peanuts", price: 40, protein: 8, ind: 0.55 },
];
const PITCH: Record<string, string> = {
  "price-led": "Win them with value: smaller packs, combo deals, and protein per rupee on the pack.",
  "taste-led": "Lead with flavour. Protein is a bonus they accept, not a reason to buy.",
  "protein-led": "Your core buyer. Big protein claims, gym and desk moments.",
  "context-switcher": "Sell protein for the desk and the gym; don't fight comfort food at night.",
  undecided: "Easy to sway: a clear label and a fair price tip them towards protein.",
};
const SURE: Record<string, string> = { high: "Very sure", medium: "Fairly sure", low: "Early signal" };
const ATTR_NAME: Record<string, string> = { price: "Price", protein: "Protein", taste: "Taste", sugar: "Sugar" };

type Draw = { a: number; bF: number; bC: number; c: number };
type Product = { price: number; protein: number; ind: number };

/** Share of people who would pick this product over chips and peanuts, from each player's preference model. */
function shareFor(pop: InsightsData["population"], product: Product, ctx: "functional" | "craving", seg: string) {
  const people = seg === "Everyone" ? pop : pop.filter((p) => p.segment === seg);
  if (!people.length) return { mid: 0, lo: 0, hi: 0 };
  const nDraw = Math.min(...people.map((p) => p.draws.length), 10);
  const shares: number[] = [];
  for (let d = 0; d < nDraw; d++) {
    let num = 0;
    let den = 0;
    for (const p of people) {
      const t: Draw = p.draws[d];
      const b = ctx === "functional" ? t.bF : t.bC;
      const u = (x: Product) => -t.a * (x.price / 10) + b * (x.protein / 10) + t.c * x.ind;
      const us = [u(product), ...COMPETITORS.map(u)];
      const m = Math.max(...us);
      const e = us.map((x) => Math.exp(x - m));
      num += p.w * (e[0] / e.reduce((a, c) => a + c, 0));
      den += p.w;
    }
    shares.push(den ? num / den : 0);
  }
  shares.sort((a, b) => a - b);
  const q = (x: number) => shares[Math.min(shares.length - 1, Math.max(0, Math.round(x * (shares.length - 1))))] ?? 0;
  return { mid: q(0.5), lo: q(0.1), hi: q(0.9) };
}

export function InsightsView({ data, initialRecs, studyId }: { data: InsightsData; initialRecs: Recs; studyId: string }) {
  const [seg, setSeg] = useState("Everyone");
  const [recs, setRecs] = useState(initialRecs);
  const [recModel, setRecModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const A = data.audiences[seg] ?? data.audiences.Everyone;
  const audienceName = seg === "Everyone" ? "players" : seg;
  const H = useMemo(() => new Map(data.evidence.map((h) => [h.id, h])), [data.evidence]);

  const askAi = async () => {
    setBusy(true);
    const r = await fetch(`/api/ai/insights/${studyId}`, { method: "POST" });
    const j = await r.json();
    if (j.recs) {
      setRecs(j.recs);
      setRecModel(j.model);
    }
    setBusy(false);
  };

  return (
    <div className="theme-admin min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Snack Moments home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <span className="leading-tight">
              <span className="block font-display text-base font-extrabold">Brand HQ</span>
              <span className="block text-xs text-muted">Know your snack consumer</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-1.5 text-sm sm:ml-auto" role="group" aria-label="Audience">
            <span className="mr-1 text-xs font-semibold text-muted">Who are you looking at?</span>
            {Object.keys(data.audiences).map((k) => (
              <button
                key={k}
                onClick={() => setSeg(k)}
                className={`rounded-full px-3 py-1 ${seg === k ? "bg-ink font-semibold text-white" : "border border-line bg-surface hover:bg-bg"}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-6">
        <p className="text-sm text-muted">
          Based on <span className="font-semibold text-ink">{A.n} players</span>
          {seg === "Everyone" ? "" : ` in the ${seg} group`} who played carefully. Careless and fake players are left out.
        </p>

        <Headlines A={A} H={H} />
        <Personas A={A} audienceName={audienceName} />
        <Moments A={A} />
        <Pricing A={A} H={H} />
        <Simulator data={data} A={A} seg={seg} />
        <SayDo A={A} />
        <IdealBar A={A} />
        <Shelf A={A} />

        <Block title="What should you do next?" sub="Actions the evidence supports. Each says how sure we are and what to test before betting on it.">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">{recModel ? `Written by AI (${recModel}) from the study's numbers.` : "Written from the proven findings."}</p>
            <button onClick={askAi} disabled={busy} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold">
              {busy ? "Thinking…" : "✨ Rewrite with AI"}
            </button>
          </div>
          {recs.recommendations.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {recs.recommendations.map((r, i) => (
                <div key={i} className="card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-base font-bold leading-snug">{r.action}</p>
                    <span className="shrink-0 rounded-full bg-good/10 px-2 py-0.5 text-xs font-semibold text-good">{SURE[r.confidence] ?? r.confidence}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-semibold text-ink">Why: </span>
                    {r.why}
                  </p>
                  <p className="mt-2 flex-1 rounded-lg bg-bg px-3 py-2 text-sm">
                    <span className="font-semibold">Test before acting: </span>
                    {r.validateNext}
                  </p>
                  <Link href={`/admin/${studyId}?tab=M`} className="mt-2 text-xs font-semibold underline">
                    See the proof ({r.evidence.map((e) => `statement #${e.replace(/\D/g, "")}`).join(", ")}) →
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm">Nothing is proven strongly enough yet to act on. More players will sharpen this.</p>
          )}
        </Block>
      </main>
    </div>
  );
}

/* ---------- 1. headlines ---------- */

function Headlines({ A, H }: { A: AudienceData; H: Map<string, Hypothesis> }) {
  const price = A.skipReasons.find((r) => r.reason === "Price")?.count ?? 0;
  const taste = A.skipReasons.find((r) => r.reason === "Taste")?.count ?? 0;
  const skipTotal = A.skipReasons.reduce((a, r) => a + r.count, 0);
  const perWeek = A.moments.filter((m) => m.perWeek != null);
  const workWeek = perWeek.filter((m) => m.context === "functional").reduce((a, m) => a + (m.perWeek ?? 0), 0);
  const allWeek = perWeek.reduce((a, m) => a + (m.perWeek ?? 0), 0);
  const est = (id: string) => H.get(id)?.ci.estimate ?? NaN;

  const candidates: { id: string; title: string; detail: string | null }[] = [
    {
      id: "H2",
      title: "Protein sells at work and the gym, not late at night",
      detail:
        A.proteinWinsWork != null && A.proteinWinsFun != null
          ? `Protein wins ${A.proteinWinsWork}% of choices at the desk, gym or before a meeting, but ${A.proteinWinsFun}% late at night, at movies or on road trips.`
          : null,
    },
    {
      id: "H1",
      title: "They say protein matters more than they act on it",
      detail: Number.isFinite(A.sayDo.said) ? `They rate protein ${A.sayDo.said}/5, but their choices point to ${A.sayDo.did}/5.` : null,
    },
    {
      id: "H9",
      title: "Price, not taste, is why they skip protein",
      detail: skipTotal
        ? `Of those who rated protein high but skipped it, ${Math.round((price / skipTotal) * 100)}% blamed price and ${Math.round((taste / skipTotal) * 100)}% taste.`
        : null,
    },
    {
      id: "H4",
      title: "On a pack, price gets noticed before protein",
      detail: A.shelf.priceRecall != null ? `${A.shelf.priceRecall}% remembered the price after a glance, only ${A.shelf.proteinRecall}% the protein.` : null,
    },
    {
      id: "H6",
      title: "Ask what they'd pay, and they overstate it",
      detail: Number.isFinite(est("H6")) ? `Direct bids ran about ₹${Math.abs(est("H6")).toFixed(0)} above what their choices show.` : null,
    },
    { id: "H10", title: "Their dream bar has more protein than they actually buy", detail: "Designing a bar, they ask for more protein than their own choices reward." },
    {
      id: "H11",
      title: "Most snack moments happen at work or the gym",
      detail: allWeek ? `${Math.round((workWeek / allWeek) * 100)}% of their weekly snack moments are at the desk, gym or before a meeting.` : null,
    },
    {
      id: "H3",
      title: "Protein-first packs lift protein picks",
      detail: Number.isFinite(est("H3")) ? `Cards that led with protein raised protein picks by ${est("H3").toFixed(0)} in every 100 choices.` : null,
    },
  ];
  const proven = candidates.filter((c) => H.get(c.id)?.status === "supported" && c.detail);
  const shown = proven.slice(0, 3);

  return (
    <section>
      <h2 className="font-display text-2xl font-bold">Three things to know</h2>
      {shown.length ? (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {shown.map((c, i) => (
            <div key={c.id} className="card flex flex-col p-5">
              <span className="font-display text-3xl font-extrabold text-muted/40">{i + 1}</span>
              <p className="mt-1 font-display text-lg font-bold leading-snug">{c.title}</p>
              <p className="mt-2 flex-1 text-sm text-muted">{c.detail}</p>
              <span className="mt-3 w-fit rounded-full bg-good/10 px-2 py-0.5 text-xs font-semibold text-good">✓ Proven</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Nothing is proven yet. Come back when more players have played.</p>
      )}
    </section>
  );
}

/* ---------- 2. personas ---------- */

function Personas({ A, audienceName }: { A: AudienceData; audienceName: string }) {
  const ps = [...A.personas].filter((p) => p.players > 0).sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
  return (
    <Block
      title="Meet your consumers"
      sub={`Every player falls into one of five snack personalities, based on what really drove their choices. Sorted by how common each is among ${audienceName}.`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ps.map((p) => {
          const d = DRIVER[p.driver];
          return (
            <div key={p.driver} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg font-bold">
                  {d.emoji} {d.title}
                </p>
                <span className="font-display text-2xl font-extrabold tabular-nums">{p.share}%</span>
              </div>
              <p className="text-xs text-muted">of {audienceName}</p>
              <p className="mt-2 text-sm">{d.line}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">1g protein worth</dt>
                <dd className="font-semibold">
                  {fmtRs(p.wtpWork)} at work · {fmtRs(p.wtpFun)} at night
                </dd>
                <dt className="text-muted">Picks protein</dt>
                <dd className="font-semibold">{p.proteinWins != null ? `${p.proteinWins}% of the time` : "–"}</dd>
                {p.bestMoment && (
                  <>
                    <dt className="text-muted">Best moment</dt>
                    <dd className="font-semibold">{p.bestMoment}</dd>
                  </>
                )}
              </dl>
              <p className="mt-3 flex-1 rounded-lg bg-bg px-3 py-2 text-sm">
                <span className="font-semibold">How to win them: </span>
                {PITCH[p.driver]}
              </p>
            </div>
          );
        })}
      </div>
    </Block>
  );
}

/* ---------- 3. moments ---------- */

function Moments({ A }: { A: AudienceData }) {
  // protein picks per week = how often the moment happens × how often protein wins in it
  const ms = A.moments
    .filter((m) => m.proteinWins != null && m.perWeek != null)
    .map((m) => ({ ...m, picks: Math.round((m.perWeek ?? 0) * (m.proteinWins ?? 0)) / 100 }))
    .sort((a, b) => b.picks - a.picks);
  const bets = ms.slice(0, 2);
  const maxWeek = Math.max(1, ...ms.map((m) => m.perWeek ?? 0));
  const total = ms.reduce((a, m) => a + m.picks, 0);
  if (!ms.length) return null;
  return (
    <ExplainedChart
      question="When should you show up?"
      howToRead="one row per snack moment, biggest opportunity first. The blue bar is how many times a week a typical player snacks in that moment; the green bar is how often protein wins when they do. Together they give the protein snacks bought in that moment each week."
      legend={[
        { color: C.s1, label: "Times a week" },
        { color: C.good, label: "Protein wins (% of choices)" },
      ]}
      takeaway={
        <>
          Your biggest openings are {bets.map((m) => `${m.emoji} ${m.label.toLowerCase()}`).join(" and ")}: together about{" "}
          {Math.round((bets.reduce((a, m) => a + m.picks, 0) / Math.max(0.01, total)) * 100)}% of all the protein snacks a player picks in a week.
        </>
      }
    >
      <div className="grid gap-3">
        {ms.map((m, i) => (
          <div key={m.id} className="grid gap-1 sm:grid-cols-[15rem_1fr] sm:items-center sm:gap-3">
            <div>
              <p className="text-sm font-semibold">
                {m.emoji} {m.label}
                {i < 2 && <span className="ml-2 rounded-full bg-good/10 px-2 py-0.5 text-xs text-good">Best bet</span>}
              </p>
              <p className="text-xs text-muted">≈ {m.picks.toFixed(1)} protein snacks a week</p>
            </div>
            <div className="grid gap-1">
              <MiniBar value={m.perWeek ?? 0} max={maxWeek} color={C.s1} label={`${m.perWeek} times a week`} />
              <MiniBar value={m.proteinWins ?? 0} max={100} color={C.good} label={`protein wins ${m.proteinWins}%`} />
            </div>
          </div>
        ))}
      </div>
    </ExplainedChart>
  );
}

/* ---------- 4. pricing ---------- */

function Pricing({ A, H }: { A: AudienceData; H: Map<string, Hypothesis> }) {
  const bid = H.get("H6");
  const extra = (wtp: number | null) => (wtp != null && Number.isFinite(wtp) ? Math.max(0, Math.round((20 - 3) * wtp)) : null);
  return (
    <Block title="What will they pay for protein?" sub="Worked out from the trade-offs players made between price and protein, not from asking them.">
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { title: "💻 🏋️ At work or the gym", wtp: A.wtpWork },
          { title: "🌙 🎬 Late night or fun", wtp: A.wtpFun },
        ].map((x) => (
          <div key={x.title} className="card p-5">
            <p className="text-sm font-semibold">{x.title}</p>
            <p className="mt-1 font-display text-3xl font-extrabold">{fmtRs(x.wtp)} per gram</p>
            <p className="mt-2 text-sm text-muted">
              {extra(x.wtp)
                ? `A 20g protein bar can cost about ₹${extra(x.wtp)} more than a pack of chips (3g protein) and still feel worth it.`
                : "Protein adds almost no value here: price and taste decide."}
            </p>
          </div>
        ))}
      </div>
      {bid?.status === "supported" && Number.isFinite(bid.ci.estimate) && (
        <p className="mt-3 rounded-xl border border-warn bg-warn/10 px-4 py-3 text-sm">
          <span className="font-semibold">⚠ Don&apos;t price from surveys. </span>
          When asked straight out what they&apos;d pay, people bid about ₹{Math.abs(bid.ci.estimate).toFixed(0)} more than their choices show.
        </p>
      )}
    </Block>
  );
}

/* ---------- 5. simulator ---------- */

function Simulator({ data, A, seg }: { data: InsightsData; A: AudienceData; seg: string }) {
  const [price, setPrice] = useState(70);
  const [protein, setProtein] = useState(15);
  const [ind, setInd] = useState(0.6);
  const [ctx, setCtx] = useState<"functional" | "craving">("functional");
  const now = useMemo(() => shareFor(data.population, { price, protein, ind }, ctx, seg), [data.population, price, protein, ind, ctx, seg]);
  const weekly = useMemo(() => {
    const f = shareFor(data.population, { price, protein, ind }, "functional", seg).mid;
    const c = shareFor(data.population, { price, protein, ind }, "craving", seg).mid;
    const sum = (k: string) => A.moments.filter((m) => m.context === k).reduce((a, m) => a + (m.perWeek ?? 0), 0);
    return Math.round(100 * (sum("functional") * f + sum("craving") * c));
  }, [data.population, price, protein, ind, seg, A.moments]);
  const curve = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const p = 20 + i * 10;
        const s = shareFor(data.population, { price: p, protein, ind }, ctx, seg);
        return { price: p, share: Math.round(s.mid * 100), band: [Math.round(s.lo * 100), Math.round(s.hi * 100)], revenue: p * s.mid };
      }),
    [data.population, protein, ind, ctx, seg],
  );
  const sweet = curve.reduce((a, b) => (b.revenue > a.revenue ? b : a), curve[0]);

  return (
    <Block
      title="Try a product idea"
      sub="Set up a snack and see how many people would pick it over masala chips (₹20) and masala peanuts (₹40). Predictions come from each player's own choices."
    >
      <div className="card grid gap-6 p-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4 text-sm">
          <Slider label="Price" value={price} min={20} max={150} step={5} fmt={(v) => `₹${v}`} onChange={setPrice} />
          <Slider label="Protein" value={protein} min={0} max={30} step={1} fmt={(v) => `${v}g`} onChange={setProtein} />
          <Slider label="Taste" value={ind} min={0} max={1} step={0.05} fmt={(v) => (v < 0.35 ? "Plain" : v < 0.7 ? "Tasty" : "Indulgent")} onChange={setInd} />
          <div>
            <p className="text-xs text-muted">Moment</p>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {(
                [
                  ["functional", "💻 Work or gym"],
                  ["craving", "🌙 Night or fun"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} onClick={() => setCtx(k)} className={`rounded-lg border px-2 py-1.5 text-xs ${ctx === k ? "border-ink bg-ink text-white" : "border-line"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-bg p-3">
            <p className="text-xs text-muted">Out of 100 people, this many pick yours</p>
            <p className="font-display text-4xl font-extrabold">{Math.round(now.mid * 100)}</p>
            <p className="text-xs text-muted">
              Likely between {Math.round(now.lo * 100)} and {Math.round(now.hi * 100)}
            </p>
          </div>
          {A.moments.some((m) => m.perWeek != null) && (
            <div className="rounded-xl bg-bg p-3">
              <p className="text-xs text-muted">Packs bought per 100 people, per week</p>
              <p className="font-display text-3xl font-extrabold">{weekly}</p>
              <p className="text-xs text-muted">Across all their snack moments, at work, gym, night and fun.</p>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">How price changes the number of people who pick it</p>
          <div className="mt-2">
            <LegendRow
              items={[
                { color: C.s1, label: "People out of 100" },
                { color: C.seq[1], label: "Likely range" },
                { color: C.good, label: "Best price for revenue" },
                { color: C.s2, label: "Your price" },
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={curve} margin={{ left: 4, right: 12, top: 12, bottom: 18 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis
                dataKey="price"
                stroke={C.axis}
                fontSize={11}
                tickFormatter={(v) => `₹${v}`}
                label={{ value: "Price", position: "insideBottom", offset: -10, fill: C.ink2, fontSize: 12, fontWeight: 600 }}
              />
              <YAxis
                stroke={C.axis}
                fontSize={11}
                domain={[0, 100]}
                label={{ value: "People out of 100", angle: -90, position: "insideLeft", fill: C.ink2, fontSize: 12, fontWeight: 600, dy: 50 }}
              />
              <Tooltip formatter={(v, name) => (Array.isArray(v) ? [`${v[0]}–${v[1]}`, "Likely range"] : [v, name])} labelFormatter={(v) => `At ₹${v}`} />
              <Area isAnimationActive={false} dataKey="band" stroke="none" fill={C.seq[1]} name="Likely range" />
              <Line isAnimationActive={false} dataKey="share" stroke={C.s1} strokeWidth={2} dot={false} name="People out of 100" />
              <ReferenceLine
                x={Math.min(150, Math.max(20, Math.round(price / 10) * 10))}
                stroke={C.s2}
                strokeDasharray="2 3"
                label={{ value: `You: ₹${price}`, position: "insideTopRight", fill: C.s2, fontSize: 11, fontWeight: 700 }}
              />
              <ReferenceLine
                x={sweet.price}
                stroke={C.good}
                strokeDasharray="4 3"
                label={{ value: `Best: ₹${sweet.price}`, position: "top", fill: C.good, fontSize: 11, fontWeight: 700 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-2 rounded-xl bg-bg px-3 py-2 text-sm">
            <span className="font-semibold">💡 What it says: </span>
            Fewer people pick it as the price rises, but each sale earns more. Around ₹{sweet.price}, about {sweet.share} in 100 pick it, which brings in the most money (before
            costs) for this recipe. These are choices in a game: confirm with a real price test before launch.
          </p>
        </div>
      </div>
    </Block>
  );
}

/* ---------- 6. say vs do ---------- */

function SayDo({ A }: { A: AudienceData }) {
  const total = A.skipReasons.reduce((a, r) => a + r.count, 0);
  const top = [...A.skipReasons].sort((a, b) => b.count - a.count)[0];
  return (
    <Block title="What they say vs what they do" sub="Asking 'how important is protein?' gives a flattering answer. Their choices tell the real story.">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <div className="card grid grid-cols-2 gap-3 p-5">
          <div>
            <p className="text-xs text-muted">They say protein matters</p>
            <p className="font-display text-3xl font-extrabold">{fmtNum(A.sayDo.said)}/5</p>
          </div>
          <div>
            <p className="text-xs text-muted">Their choices show</p>
            <p className="font-display text-3xl font-extrabold" style={{ color: C.s1 }}>
              {fmtNum(A.sayDo.did)}/5
            </p>
          </div>
          <p className="col-span-2 text-sm text-muted">
            {Number.isFinite(A.sayDo.said) && A.sayDo.said - A.sayDo.did >= 0.5
              ? "A big gap: a survey alone would overestimate demand for protein."
              : "Words and choices are close for this group."}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold">Why they skip protein, in their own words</p>
          <p className="text-xs text-muted">Players who rated protein highly but chose other snacks were asked why. {total} answered.</p>
          <div className="mt-3 grid gap-2">
            {A.skipReasons.map((r) => (
              <div key={r.reason} className="grid grid-cols-[minmax(0,12rem)_1fr] items-center gap-3 text-sm" title={r.full}>
                <span className="truncate">{r.reason}</span>
                <MiniBar value={r.count} max={Math.max(1, total)} color={r === top ? C.s2 : C.seq[2]} label={total ? `${Math.round((r.count / total) * 100)}%` : "–"} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Block>
  );
}

/* ---------- 7. ideal bar ---------- */

function IdealBar({ A }: { A: AudienceData }) {
  const b = A.idealBar;
  if (!b.players) return null;
  const survivor = [...b.attrs].sort((x, y) => (y.keptPct ?? 0) - (x.keptPct ?? 0))[0];
  const loser = [...b.attrs].sort((x, y) => (x.keptPct ?? 0) - (y.keptPct ?? 0))[0];
  return (
    <ExplainedChart
      question="What does their ideal product look like?"
      howToRead={`${b.players} players designed a bar with 10 points to spend on five features (up to 4 each). Then costs went up and they had to cut back to 7 points. Light bars show what they asked for; dark bars show what they kept. What survives the cut is what they really value.`}
      legend={[
        { color: C.seq[1], label: "Asked for (out of 4)" },
        { color: C.s1, label: "Kept after costs went up" },
      ]}
      takeaway={
        <>
          {survivor.emoji} {survivor.attr} is the last thing they give up ({survivor.keptPct}% kept); {loser.emoji} {loser.attr.toLowerCase()} goes first ({loser.keptPct}% kept).
        </>
      }
    >
      <div className="grid gap-3">
        {b.attrs.map((a) => (
          <div key={a.attr} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-3">
            <p className="text-sm font-semibold">
              {a.emoji} {a.attr}
            </p>
            <div className="grid gap-1">
              <MiniBar value={a.asked ?? 0} max={4} color={C.seq[1]} label={`asked ${a.asked}`} />
              <MiniBar value={a.kept ?? 0} max={4} color={C.s1} label={`kept ${a.kept}`} />
            </div>
          </div>
        ))}
      </div>
    </ExplainedChart>
  );
}

/* ---------- 8. shelf ---------- */

function Shelf({ A }: { A: AudienceData }) {
  const s = A.shelf;
  const first = [...s.firstLook].sort((a, b) => b.pct - a.pct);
  return (
    <Block
      title="How do they read a pack?"
      sub="From two games: a quick glance at packs (Label Detective) and a hidden-details game where they choose what to uncover (Peek & Pick)."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-5">
          <p className="text-sm font-semibold">What they remember after a 3-second glance</p>
          <div className="mt-3 grid gap-2">
            <Recall label="💰 The price" value={s.priceRecall} color={C.s2} />
            <Recall label="💪 The protein" value={s.proteinRecall} color={C.s1} />
          </div>
          <p className="mt-3 text-sm text-muted">
            {s.priceRecall != null && s.proteinRecall != null && s.priceRecall - s.proteinRecall >= 10
              ? "Protein is easy to miss. Put the grams big, next to the price, on the front of the pack."
              : "They notice protein about as well as price."}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold">What they check first when details are hidden</p>
          <div className="mt-3 grid gap-2">
            {first.map((f) => (
              <div key={f.attr} className="grid grid-cols-[5rem_1fr] items-center gap-3 text-sm">
                <span>{ATTR_NAME[f.attr]}</span>
                <MiniBar value={f.pct} max={100} color={f === first[0] ? C.s1 : C.seq[2]} label={`${f.pct}%`} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">{first[0] ? `${ATTR_NAME[first[0].attr]} is the first thing most people look for.` : ""}</p>
        </div>
      </div>
    </Block>
  );
}

/* ---------- small pieces ---------- */

function Block({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{sub}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MiniBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3.5 flex-1 rounded bg-line/60">
        <div className="h-3.5 rounded" style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`, background: color }} />
      </div>
      <span className="w-32 shrink-0 text-xs tabular-nums text-muted">{label}</span>
    </div>
  );
}

function Recall({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 text-sm">
      <span>{label}</span>
      <MiniBar value={value ?? 0} max={100} color={color} label={value != null ? `${value}% remembered` : "–"} />
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <b>{fmt(value)}</b>
      </span>
      <input type="range" className="mt-1 w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const fmtRs = (x: number | null) => (x == null || !Number.isFinite(x) ? "–" : x <= 0.05 ? "₹0" : `₹${x.toFixed(1)}`);
const fmtNum = (x: number | null) => (x != null && Number.isFinite(x) ? x.toFixed(1) : "–");
