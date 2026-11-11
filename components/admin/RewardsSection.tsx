"use client";
/**
 * Rewards tab: where points come from, whether careful players earn more, and whether the
 * "take your time" message cuts rushing. The golden rule: points never depend on WHICH snacks
 * someone picks, only on finishing, luck, skill and careful play.
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars, pct } from "./charts";

const KIND_NAME: Record<string, string> = {
  progress: "Finishing games",
  gift: "Mystery gift",
  skill: "Skill (memory, crowd guess, bids)",
  bonus: "Bonus questions",
  quality: "Careful-play bonus",
};

export function RewardsSection({ data }: { data: AdminData }) {
  const rw = data.rewards;
  const kinds = rw.pointsByKind.map((k) => ({ kind: KIND_NAME[k.kind] ?? k.kind, avg: k.avg ?? 0 }));
  const biggest = kinds.reduce((m, k) => (k.avg > m.avg ? k : m), kinds[0]);
  const byBand = rw.pointsByBand;
  const hi = byBand.find((b) => b.band === "green")?.avg ?? 0;
  const lo = byBand.find((b) => b.band === "red")?.avg ?? 0;
  const nudge = rw.nudgeRush;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber
          label="Average points per player"
          value={rw.avgPoints != null ? String(rw.avgPoints) : "–"}
          explain="Never for which snacks someone picks: only for finishing games, the mystery gift, skill and careful play. So points can't push answers in any direction."
        />
        <KeyNumber
          label="Reached the bonus limit"
          value={pct(rw.capShare)}
          explain="Extra points (gift, skill, bonus questions, careful play) stop at 100 per game, so nobody can farm points."
        />
        <KeyNumber
          label="Skipped the bonus questions"
          value={pct(rw.bonusSkipRate)}
          explain="The bonus questions on the Guess the Crowd screen are optional. Skipping them is fine; it just shows how keen players are by then."
        />
      </div>

      <ExplainedChart
        question="What are players rewarded for?"
        howToRead="points are there to keep people playing to the end. Each bar is one way to earn points, and its height is how many points the average player got that way. None of them depend on which snacks someone picks, so points can't push answers in any direction."
        takeaway={
          biggest ? (
            <>
              Most points ({biggest.avg} of {rw.avgPoints} on average) are simply for <b>{biggest.kind.toLowerCase()}</b>, so points mainly keep people playing to the end. The
              smaller extras reward luck, skill and careful play, never a particular answer.
            </>
          ) : (
            "No points earned yet."
          )
        }
      >
        <LabeledBars
          data={kinds}
          x="kind"
          xLabel="Type of reward"
          yLabel="Average points per player"
          tooltipLabel={(x) => x}
          series={[{ key: "avg", name: "Average points", color: C.s1 }]}
        />
      </ExplainedChart>

      <div className="grid gap-5 lg:grid-cols-2">
        <ExplainedChart
          question="Do careful players earn more points?"
          howToRead="average points per player in each quality group. Careful play should pay a little more (through the careful-play bonus), so players have a reason to take their time."
          takeaway={
            <>
              High quality players earn {hi} points on average against {lo} for low quality players
              {hi > lo ? ", so careful play is rewarded." : ". Careful play isn't paying more yet."}
            </>
          }
        >
          <LabeledBars
            data={byBand}
            x="group"
            xLabel="Quality group"
            yLabel="Average points"
            tooltipLabel={(x) => x}
            series={[{ key: "avg", name: "Average points", color: C.s1 }]}
            colorBy={(d) => (d.band === "green" ? C.good : d.band === "amber" ? C.warn : C.bad)}
          />
        </ExplainedChart>

        <ExplainedChart
          question="Did the 'take your time' message reduce rushing?"
          howToRead="when a player rushes two questions in a row, a friendly 'take your time' message pops up. Bars compare how many of their answers were rushed before and after seeing it."
          takeaway={
            nudge ? (
              nudge.after < nudge.before ? (
                <>
                  After the message, rushed answers dropped from {nudge.before}% to {nudge.after}% ({nudge.n} players saw it). A gentle nudge works without any penalty.
                </>
              ) : (
                <>
                  Rushing didn&apos;t drop after the message ({nudge.before}% before, {nudge.after}% after, {nudge.n} players). Players who rush this much are usually not really
                  playing, which the quality score already handles.
                </>
              )
            ) : (
              "No player has needed the message yet."
            )
          }
        >
          <LabeledBars
            data={
              nudge
                ? [
                    { when: "Before the message", rushed: nudge.before },
                    { when: "After the message", rushed: nudge.after },
                  ]
                : []
            }
            x="when"
            xLabel=""
            yLabel="% of answers rushed"
            unit="%"
            yMax={100}
            tooltipLabel={(x) => x}
            series={[{ key: "rushed", name: "Answers rushed", color: C.s2 }]}
          />
        </ExplainedChart>
      </div>
    </div>
  );
}
