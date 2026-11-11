"use client";
/**
 * Overview tab of the response-intelligence dashboard, written for someone seeing it for the first time:
 * 4 key numbers (each explained), what needs attention, and 2 charts that
 * each answer one question and end with what they say.
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars, QUALITY_LEGEND, pct } from "./charts";

const GREY = "#c3c2b7";
const LEVEL = {
  high: { icon: "●", word: "Act now", color: C.bad },
  medium: { icon: "▲", word: "Check", color: "#b07d00" },
  low: { icon: "■", word: "Good to know", color: C.s1 },
} as const;

export function OverviewSection({ data, go }: { data: AdminData; go: (tab: string) => void }) {
  const o = data.overview;
  const count = (b: string) => o.bands.find((x) => x.band === b)?.count ?? 0;
  const green = count("green");
  const amber = count("amber");
  const red = count("red");
  const finished = Math.max(1, o.completed);

  // quality chart: one bar per 10-point score range, coloured by the band it falls in
  const hist = o.qualityHist.map((h) => ({
    range: h.from >= 90 ? "90–100" : `${h.from}–${h.from + 9}`,
    sessions: h.count,
    band: h.from >= 70 ? "green" : h.from >= 40 ? "amber" : "red",
  }));

  // daily chart takeaway: does any day have unusually many careless sessions?
  const redShare = red / finished;
  const worstDay = o.perDay
    .map((d) => ({ ...d, share: d.completed ? d.red / d.completed : 0 }))
    .filter((d) => d.red >= 3 && d.share > Math.max(0.1, redShare * 1.8))
    .sort((a, b) => b.share - a.share)[0];
  const tenths = Math.round(o.completionRate * 10);

  return (
    <div className="grid gap-5">
      {/* 2. four key numbers, each explained */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KeyNumber
          label="Finished the game"
          value={pct(o.completionRate)}
          explain={`${o.completed} of ${o.started} people who started made it to the end. If this drops, the game is too long or confusing.`}
        />
        <KeyNumber
          label="Answers you can use"
          value={pct(o.usableShare)}
          explain={`${data.usableN} finished sessions feed the brand results: high quality counts fully, medium quality counts less, low quality is left out.`}
        />
        <KeyNumber
          label="Typical play time"
          value={o.medianMinutes != null ? `${o.medianMinutes.toFixed(1)} min` : "–"}
          explain="Half of players finish faster than this. The game is designed to take about 3 minutes."
        />
        <KeyNumber
          label="Waiting for a person to check"
          value={String(o.needsReview)}
          explain="Low-quality sessions (2 or more signs of careless or fake play) that no one has reviewed yet. Nobody is banned automatically."
          action={o.needsReview > 0 ? { label: "Review them →", onClick: () => go("K") } : undefined}
          tone={o.needsReview > 0 ? "warn" : undefined}
        />
      </div>

      {/* 3. what needs attention */}
      <section className="card p-5">
        <h3 className="font-display text-lg font-bold">What needs your attention</h3>
        <p className="mt-1 text-sm text-muted">Problems found automatically, most urgent first. Each one links to the tab with the details.</p>
        {data.alerts.length ? (
          <ul className="mt-3 divide-y divide-line">
            {data.alerts.map((a) => (
              <li key={a.text} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-28 shrink-0 text-xs font-bold" style={{ color: LEVEL[a.level].color }}>
                  {LEVEL[a.level].icon} {LEVEL[a.level].word}
                </span>
                <span className="min-w-0 flex-1 text-sm">{a.text}</span>
                <button onClick={() => go(a.tab)} className="rounded-lg border border-line px-3 py-1 text-xs font-semibold hover:border-ink">
                  {a.action} →
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm">✓ All clear. Nothing needs attention right now.</p>
        )}
      </section>

      {/* 4. the two charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ExplainedChart
          question="How trustworthy are the answers?"
          howToRead="each bar is a range of quality scores. The taller the bar, the more finished sessions scored in that range. Most bars should sit on the right (green)."
          legend={[
            ...QUALITY_LEGEND,
          ]}
          takeaway={
            <>
              {green} of {o.completed} finished sessions ({pct(green / finished)}) are high quality and count fully, {amber} ({pct(amber / finished)}) are medium quality and
              count with less weight, and {red} ({pct(red / finished)}) are low quality (careless or fake) and are left out until a person checks them.
            </>
          }
        >
          <LabeledBars
            data={hist}
            x="range"
            xLabel="Quality score (0 = careless, 100 = careful)"
            yLabel="Finished sessions"
            series={[{ key: "sessions", name: "Sessions", color: C.good }]}
            colorBy={(d) => (d.band === "green" ? C.good : d.band === "amber" ? C.warn : C.bad)}
            tooltipLabel={(x) => `Quality score ${x}`}
          />
        </ExplainedChart>

        <ExplainedChart
          question="How did each day's sessions turn out?"
          howToRead="one bar per day. The full height is everyone who started that day, split by what happened: high, medium or low quality, or didn't finish."
          legend={[
            ...QUALITY_LEGEND,
            { color: GREY, label: "Didn't finish" },
          ]}
          takeaway={
            <>
              About {tenths} in 10 people who start finish.{" "}
              {worstDay
                ? `Watch ${worstDay.label}: ${worstDay.red} low quality players that day, more than usual. Check the fraud tab for a burst of fake players.`
                : "No day stands out: the share of careless sessions stays about the same every day."}
            </>
          }
        >
          <LabeledBars
            data={o.perDay}
            x="label"
            stacked
            xLabel="Day the session started"
            yLabel="Sessions started"
            series={[
              { key: "green", name: "High quality players", color: C.good },
              { key: "amber", name: "Medium quality players", color: C.warn },
              { key: "red", name: "Low quality players", color: C.bad },
              { key: "unfinished", name: "Didn't finish", color: GREY },
            ]}
          />
        </ExplainedChart>
      </div>
    </div>
  );
}
