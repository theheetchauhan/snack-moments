"use client";
/**
 * Divergence tab: the gap between what people SAY about protein and what they DO.
 * These gaps are findings, never penalties: someone who says protein matters and then picks chips
 * is an honest player telling us something useful. Only usable (high + medium quality) players count.
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars, pct } from "./charts";

const ATTR: Record<string, string> = { price: "the price", protein: "protein", taste: "the taste", sugar: "sugar" };

export function DivergenceSection({ data }: { data: AdminData }) {
  const d = data.divergence;

  // 1. said vs did, grouped by the rating people gave
  const groups = [1, 2, 3, 4, 5]
    .map((rating) => {
      const xs = d.statedVsRevealed.filter((p) => p.stated === rating);
      const did = xs.length ? xs.reduce((a, p) => a + (p.revealed ?? 0), 0) / xs.length : 0;
      // axis label carries the group size, so nobody has to hover to see how many players it covers
      return { rating: String(rating), label: `Rated ${rating}/5 (${xs.length} player${xs.length === 1 ? "" : "s"})`, said: rating, did: Math.round(did * 10) / 10, n: xs.length };
    })
    // a group of 1–4 players is too small to say anything, so it isn't drawn
    .filter((g) => g.n >= MIN_GROUP);
  const hidden = [1, 2, 3, 4, 5].filter((r) => {
    const n = d.statedVsRevealed.filter((p) => p.stated === r).length;
    return n > 0 && n < MIN_GROUP;
  });
  const top = groups.find((g) => g.rating === "5") ?? groups[groups.length - 1];
  const gap = d.sayDoMean.estimate;

  // 2. saying → spending ladder
  const ladder = d.ladder.filter((s) => s.n > 0);
  const first = ladder[0];
  const last = ladder[ladder.length - 1];

  // 3. why they skipped protein
  const reasons = d.skipReasons;
  const reasonTotal = Math.max(1, reasons.reduce((a, r) => a + r.count, 0));
  const reasonMax = Math.max(1, ...reasons.map((r) => r.count));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KeyNumber label="Say it matters more than they show" value={pct(d.overstateShare)} explain="Players whose 1–5 rating was at least a full point higher than what their choices showed." />
        <KeyNumber
          label="Typical say–do gap"
          value={Number.isFinite(gap) ? `${gap >= 0 ? "+" : ""}${gap.toFixed(1)} pts` : "–"}
          explain="On the 1–5 scale: the rating people gave minus the rating their choices point to. Positive = they overstate protein."
        />
        <KeyNumber
          label="Noticed protein on a pack"
          value={pct(d.labelRecall.protein)}
          explain={`In Label Detective, before protein was ever mentioned, vs ${pct(d.labelRecall.price)} who remembered the price.`}
        />
        <KeyNumber
          label={d.peekFirstShare ? `Checked ${ATTR[d.peekFirstShare.attr] ?? d.peekFirstShare.attr} first` : "What people check first"}
          value={d.peekFirstShare ? pct(d.peekFirstShare.share) : "–"}
          explain="In Peek & Pick, where all details start hidden: the first thing people chose to uncover shows what they really care about."
        />
      </div>

      <ExplainedChart
        question="Do people do what they say?"
        howToRead={`gaps between what people say and do are findings, never penalties, so this uses only high and medium quality players (${data.usableN}). Players are grouped by the 1–5 rating they gave for 'how important is protein'. For each group, the grey bar is what they said and the blue bar is how important protein looked from their actual choices, on the same 1–5 scale. Equal bars mean they do what they say. Ratings given by fewer than 5 players are left out, because a handful of people can't show a pattern.`}
        legend={[
          { color: GREY_SAID, label: "What they said", note: "1–5 rating, asked at the very end" },
          { color: C.s1, label: "What their choices showed", note: "same 1–5 scale" },
        ]}
        takeaway={
          top ? (
            <>
              Players who rated protein {top.rating}/5 chose like someone who would rate it {top.did}/5. On average people say protein matters{" "}
              {Number.isFinite(gap) ? `${gap.toFixed(1)} points` : "more"} more than their choices show, and {pct(d.overstateShare)} overstate it by a full point or more. This is
              why the original 1–5 question alone gives the wrong answer.
              {hidden.length > 0 && ` (Not shown: rating${hidden.length === 1 ? "" : "s"} ${hidden.map((r) => `${r}/5`).join(", ")}, given by fewer than ${MIN_GROUP} players.)`}
            </>
          ) : (
            "No ratings yet."
          )
        }
      >
        <LabeledBars
          data={groups}
          x="label"
          xLabel="Rating they gave for protein (1–5)"
          yLabel="Protein importance (1–5)"
          yMax={5}
          tooltipLabel={(x) => x.replace(/^Rated/, "Players who rated protein")}
          series={[
            { key: "said", name: "What they said", color: GREY_SAID },
            { key: "did", name: "What their choices showed", color: C.s1 },
          ]}
        />
      </ExplainedChart>

      <div className="grid gap-5 lg:grid-cols-2">
        <ExplainedChart
          question="From saying to choosing: where does protein interest drop?"
          howToRead="the same players, measured three ways, from words to a real trade-off. Each bar is a 0–100% score: how strongly they said protein matters (a 5/5 rating = 100%), how often they swiped 'yes' on protein snacks in Gut Check, and how often they picked the highest-protein option in Snack Moments, where protein cost more money or taste."
          takeaway={
            first && last ? (
              <>
                Protein scores {first.value}% when people talk about it, but only {last.value}% when choosing it actually costs them something. The closer a question gets to a
                real trade-off, the less protein wins.
              </>
            ) : (
              "Not enough data yet."
            )
          }
        >
          <ol className="grid gap-3">
            {ladder.map((s, i) => (
              <li key={s.step} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="text-muted">{i + 1}.</span> {s.step}
                  </p>
                  <p className="text-xs text-muted">
                    {s.where} · {s.n} players
                  </p>
                  <div className="mt-1 h-5 rounded-md bg-line/60">
                    <div className="h-5 rounded-md" style={{ width: `${Math.max(2, s.value)}%`, background: i === 0 ? GREY_SAID : C.s1 }} />
                  </div>
                </div>
                <span className="text-right font-display text-lg font-bold tabular-nums">{s.value}%</span>
              </li>
            ))}
          </ol>
        </ExplainedChart>

        <ExplainedChart
          question="Why do people skip protein when they say it matters?"
          howToRead="players who rated protein highly but mostly picked other snacks got one follow-up question: what usually decides it for you? Each bar is how many picked that answer."
          takeaway={
            reasons.length ? (
              <>
                The most common reason is <b>&ldquo;{reasons[0].reason}&rdquo;</b> ({pct(reasons[0].count / reasonTotal)} of answers). This tells the brand what to fix first.
              </>
            ) : (
              "No follow-up answers yet."
            )
          }
        >
          <ul className="grid gap-2.5">
            {reasons.map((r) => (
              <li key={r.reason} className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm">{r.reason}</p>
                  <div className="mt-1 h-4 rounded bg-line/60">
                    <div className="h-4 rounded" style={{ width: `${(r.count / reasonMax) * 100}%`, background: C.s2 }} />
                  </div>
                </div>
                <span className="text-right text-sm font-semibold tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        </ExplainedChart>
      </div>
    </div>
  );
}

const GREY_SAID = "#a8a79f";
const MIN_GROUP = 5;
