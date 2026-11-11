"use client";
/**
 * Patterns tab: are players tapping without looking, by screen position or in a rhythm?
 * Options are shuffled on every question, so a player who is really choosing spreads their taps
 * over all positions; someone tapping the same spot (or 1-2-3-1-2-3) isn't reading.
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars, QUALITY_LEGEND, pct } from "./charts";

export function PatternsSection({ data }: { data: AdminData }) {
  const p = data.patterns;
  const k = p.keys;

  const fav = p.favouriteSpot;
  const playersIn = (r: (typeof fav)[number]) => r.green + r.amber + r.red;
  const total = Math.max(1, fav.reduce((a, r) => a + playersIn(r), 0));
  // with only 4–10 questions (some of them 2-card duels), landing on the same spot up to ~65% of the time happens by chance
  const spread = playersIn(fav[0]) + playersIn(fav[1]);

  const pos = p.positionOverall.map((x) => ({ ...x, share: x.share ?? 0 }));
  const top = pos.reduce((m, x) => (x.share > m.share ? x : m), pos[0]);
  const fairGap = Math.abs((top?.share ?? 33.3) - 33.3);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber
          label="Players stuck on one spot"
          value={String(k.stuckPlayers)}
          explain={`Tapped the same screen position on 80%+ of questions, even though the options are shuffled every time. ${k.stuckRed} of them are low quality players.`}
        />
        <KeyNumber
          label="Players tapping in a rhythm"
          value={String(k.rhythmPlayers)}
          explain="Tapped in a repeating order like top, middle, bottom, top, middle, bottom. A weak sign on its own; it only counts when another warning sign agrees."
        />
        <KeyNumber
          label="Players who changed their mind"
          value={pct(k.changedMindShare)}
          explain="Tapped one snack, then switched before locking it in, at least once. A good sign: they were actually thinking."
        />
      </div>

      <ExplainedChart
        question="Do players pick by screen position instead of by snack?"
        howToRead="for each player we find the screen spot (top, middle or bottom) they tapped most, and how often they tapped it. Because the options are shuffled every question, someone really choosing spreads their taps; with only 4 to 10 questions, hitting the same spot up to about 65% of the time can happen by chance. 80% or more is a strong sign of tapping without reading. Each bar counts players; colours show how they were rated."
        legend={QUALITY_LEGEND}
        takeaway={
          <>
            {pct(spread / total)} of players spread their taps normally (favourite spot under 65% of the time). {k.stuckPlayers} player{k.stuckPlayers === 1 ? "" : "s"} tapped
            the same spot 80% of the time or more, and {k.stuckRed} of them are already rated low quality.
          </>
        }
      >
        <LabeledBars
          data={fav}
          x="share"
          stacked
          xLabel="How often the player tapped their most-used spot"
          yLabel="Players"
          tooltipLabel={(x) => `Favourite spot tapped ${x} of the time`}
          series={[
            { key: "green", name: "High quality players", color: C.good },
            { key: "amber", name: "Medium quality players", color: C.warn },
            { key: "red", name: "Low quality players", color: C.bad },
          ]}
        />
      </ExplainedChart>

      <ExplainedChart
        question="Is any screen position getting more taps than it should?"
        howToRead="all 3-card questions together. Since the snacks are shuffled, each position should get about a third of the taps (the dashed line). A bar far above the line means some players are tapping that spot without reading."
        takeaway={
          fairGap < 4 ? (
            <>All three positions get close to a fair third of taps, so the shuffling works and position isn&apos;t steering the overall results.</>
          ) : (
            <>
              <b>{top.position}</b> gets {top.share}% of taps instead of a fair 33%. That extra comes mostly from players stuck on one spot; their answers are already down-weighted
              or left out.
            </>
          )
        }
      >
        <LabeledBars
          data={pos}
          x="position"
          xLabel="Screen position of the snack card"
          yLabel="% of taps"
          unit="%"
          yMax={60}
          refLine={{ y: 33.3, label: "Fair share (33%)" }}
          tooltipLabel={(x) => `${x} card`}
          series={[{ key: "share", name: "Share of taps", color: C.s1 }]}
        />
      </ExplainedChart>
    </div>
  );
}
