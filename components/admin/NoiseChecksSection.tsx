"use client";
/**
 * Noise checks tab: which warning signs of careless or fake play show up, and do the hidden
 * check questions actually separate careful players from careless ones?
 * (Warning signs only lower the quality score; honest contradictions never do.)
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { SIGN } from "@/lib/scoring/plain";
import { C, ExplainedChart, KeyNumber, LabeledBars, QUALITY_LEGEND, pct } from "./charts";

/** Plain-English name and meaning for each warning sign. */

export function NoiseChecksSection({ data }: { data: AdminData }) {
  const n = data.noise;
  const signs = n.signalByBand.filter((s) => s.total > 0);
  const max = Math.max(1, ...signs.map((s) => s.total));
  const top = signs[0];
  const twin = n.probeByBand[0];
  const rep = n.probeByBand[1];

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber
          label="Passed the overpriced-twin check"
          value={n.dominatedFail != null ? pct(1 - n.dominatedFail) : "–"}
          explain={`The same snack appeared twice, one copy more expensive. ${n.dominatedN} players saw it; anyone paying attention picks the cheaper one.`}
        />
        <KeyNumber
          label="Passed the repeat check"
          value={n.repeatN ? `${n.repeatPass}%` : "–"}
          explain={`An earlier question came back with the cards in a new order (${n.repeatN} players). Passing means the same answer, or changing only a close call; flipping a clear choice fails.`}
        />
        <KeyNumber
          label="Extra checks slipped in mid-game"
          value={String(n.cusumFired)}
          explain="The suspicion meter adds up small warning signs while someone plays. When it crosses its line, an extra check question is slipped in straight away."
        />
      </div>

      <ExplainedChart
        question="Which warning signs show up most?"
        howToRead="each row is one warning sign of careless or fake play. The bar shows how many finished players showed it clearly, coloured by the quality group they ended up in. Weak signs only count when another sign agrees, so a weak sign alone never lowers a rating much."
        legend={QUALITY_LEGEND}
        takeaway={
          top ? (
            <>
              The most common sign is <b>{SIGN[top.key]?.name ?? top.key}</b> ({top.total} players). Signs shown mostly by low quality players are the ones doing the real work;
              signs spread across all groups are small slips that happen to careful players too, which is why one sign alone never makes anyone low quality.
            </>
          ) : (
            "No warning signs have fired yet."
          )
        }
      >
        <div className="mb-2 flex justify-between text-xs font-semibold text-muted">
          <span>Warning sign</span>
          <span>Players who showed it</span>
        </div>
        <ul className="grid gap-3">
          {signs.map((s) => (
            <li key={s.key} className="grid gap-1 sm:grid-cols-[16rem_1fr_3rem] sm:items-center sm:gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {SIGN[s.key]?.name ?? s.key}
                  {s.weak && <span className="ml-1.5 rounded bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">weak</span>}
                </p>
                <p className="text-xs text-muted">{SIGN[s.key]?.meaning}</p>
              </div>
              <div className="flex h-6 overflow-hidden rounded-md bg-line/50" style={{ width: `${Math.max(4, (s.total / max) * 100)}%` }} title={`${s.green} high · ${s.amber} medium · ${s.red} low quality players`}>
                {[
                  [s.green, C.good],
                  [s.amber, C.warn],
                  [s.red, C.bad],
                ].map(([v, color], i) =>
                  Number(v) > 0 ? <div key={i} style={{ width: `${(Number(v) / s.total) * 100}%`, background: String(color) }} className="border-r-2 border-white last:border-r-0" /> : null,
                )}
              </div>
              <span className="text-right text-sm font-semibold tabular-nums">{s.total}</span>
            </li>
          ))}
        </ul>
      </ExplainedChart>

      <ExplainedChart
        question="Do the hidden check questions catch careless players?"
        howToRead="two check questions are slipped into the game without looking like tests: the overpriced twin, and a repeat of an earlier question (passing = same answer, or only a close call changed). Each bar is the share of players in a quality group who passed. A good check is passed by almost every careful player and failed often by careless ones."
        legend={QUALITY_LEGEND}
        takeaway={
          <>
            Overpriced twin: {twin.green}% of high quality players passed against {twin.red}% of low quality players
            {twin.green - twin.red >= 15 ? ", a clear gap" : ", only a small gap"}. Repeat question: {rep.green}% against {rep.red}%
            {rep.green - rep.red >= 15
              ? ", also a clear gap"
              : rep.green - rep.red >= 5
                ? ", a smaller gap"
                : ". That is about the same for both, which is expected: it only counts a flip when the earlier choice was clear, and careless players rarely make clear choices, so this check mainly catches careful players who lose focus"}
            .
          </>
        }
      >
        <LabeledBars
          data={n.probeByBand}
          x="check"
          xLabel="Hidden check question"
          yLabel="% of players who passed"
          unit="%"
          yMax={100}
          tooltipLabel={(x) => x}
          series={[
            { key: "green", name: "High quality players", color: C.good },
            { key: "amber", name: "Medium quality players", color: C.warn },
            { key: "red", name: "Low quality players", color: C.bad },
          ]}
        />
      </ExplainedChart>
    </div>
  );
}
