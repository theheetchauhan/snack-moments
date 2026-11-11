"use client";
/**
 * Timing tab: are people rushing, which players are careless vs simply decisive, and do people
 * slow down on harder choices? Everything is counted in players, and "rushed" is defined in
 * seconds against the time each question needs to read (never one fixed cut-off for all questions).
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars, QUALITY_LEGEND, QuadrantScatter, pct } from "./charts";

export function TimingSection({ data }: { data: AdminData }) {
  const t = data.timing;
  const k = t.keys;
  const need = k.medianNeededSeconds ?? 0;
  const limit = k.rushLimitSeconds ?? 0;

  // 1. players by number of rushed answers
  const rp = t.rushedPerPlayer;
  const players = (r: (typeof rp)[number]) => r.green + r.amber + r.red;
  const totalPlayers = Math.max(1, rp.reduce((a, r) => a + players(r), 0));
  const never = players(rp[0]);
  const once = players(rp[1]);
  const repeat = rp.slice(2);
  const repeatN = repeat.reduce((a, r) => a + players(r), 0);
  const repeatRed = repeat.reduce((a, r) => a + r.red, 0);

  // 2. per-session speed vs consistency
  const points = t.speedConsistency.map((p) => ({
    ...p,
    speedPct: Math.min(250, Math.round(Math.exp(p.speed ?? 0) * 100)),
    fit: Math.min(3, Number(p.consistency) || 0),
  }));
  const careless = points.filter((p) => p.speedPct < 35 && p.fit < 1.15);
  const carelessRed = careless.filter((p) => p.band === "red").length;
  const decisive = points.filter((p) => p.speedPct < 35 && p.fit >= 1.15).length;
  const group = (band: string, name: string, color: string) => ({ name, color, data: points.filter((p) => p.band === band) });

  // 3. share of players who slow down on hard choices
  const sd = t.slowDownByBand;
  const sdOf = (b: string) => sd.find((x) => x.band === b);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber
          label="Players who never rushed"
          value={pct(never / totalPlayers)}
          explain={`Answered every question in a believable time. A typical question needs about ${need}s to read; "rushed" means under about ${limit}s.`}
        />
        <KeyNumber label="Typical time per choice" value={k.medianSeconds != null ? `${k.medianSeconds}s` : "–"} explain="Half of all Snack Moments answers took less than this." />
        <KeyNumber
          label="Players who rushed 2+ questions"
          value={String(repeatN)}
          explain={`${repeatRed} of them are rated low quality. Rushing once is normal and never lowers anyone's rating on its own.`}
        />
      </div>

      <ExplainedChart
        question="How many questions did each player rush?"
        howToRead={`each bar is a number of rushed questions (0 to 4 or more). Its height is how many players rushed that many. A question counts as rushed when it was answered in under about a third of the time it takes to read; for a typical question that's under ${limit}s instead of about ${need}s. Colours show how the player was rated overall.`}
        legend={QUALITY_LEGEND}
        takeaway={
          <>
            {pct(never / totalPlayers)} of players never rushed and {pct(once / totalPlayers)} rushed just once, which is normal. {repeatN} players rushed 2 or more questions, and{" "}
            {repeatRed} of them ({pct(repeatRed / Math.max(1, repeatN))}) are rated low quality: the more questions someone rushes, the more likely they weren&apos;t really
            playing.
          </>
        }
      >
        <LabeledBars
          data={rp}
          x="rushed"
          stacked
          xLabel="Questions rushed by the player"
          yLabel="Players"
          tooltipLabel={(x) => `Rushed ${x} question${x === "1" ? "" : "s"}`}
          series={[
            { key: "green", name: "High quality players", color: C.good },
            { key: "amber", name: "Medium quality players", color: C.warn },
            { key: "red", name: "Low quality players", color: C.bad },
          ]}
        />
      </ExplainedChart>

      <div className="grid gap-5 lg:grid-cols-2">
        <ExplainedChart
          question="Who is careless, and who is just quick?"
          howToRead="one dot per player. Left = they usually answered faster than the questions need; up = their choices follow a consistent pattern (1× = no better than random). Being fast is fine if the choices still make sense; fast and random is careless."
          legend={QUALITY_LEGEND}
          takeaway={
            <>
              {careless.length} player{careless.length === 1 ? "" : "s"} sit in the careless corner (fast and random), and {carelessRed} of them are already rated low quality. {decisive} quick but consistent player{decisive === 1 ? " is" : "s are"} treated as decisive, not careless.
            </>
          }
        >
          <QuadrantScatter
            groups={[group("green", "High quality players", C.good), group("amber", "Medium quality players", C.warn), group("red", "Low quality players", C.bad)]}
            x="speedPct"
            y="fit"
            xLabel="Typical speed, % of the time questions need"
            yLabel="Consistency (× random)"
            xDomain={[0, 250]}
            yDomain={[0, 3]}
            splitX={35}
            splitY={1.15}
            quadrants={{ topLeft: "Quick & consistent: decisive", topRight: "Careful", bottomLeft: "Fast & random: careless", bottomRight: "Slow & random: unsure" }}
            pointLabel={(d) => `Usually took ${d.speedPct}% of the time needed · consistency ${Number(d.fit).toFixed(2)}×`}
          />
        </ExplainedChart>

        <ExplainedChart
          question="Do players slow down on harder choices?"
          howToRead="a choice is 'hard' when the options are almost equally good for that player, and 'easy' when one clearly wins. Each bar is the share of players in that group who took noticeably longer (10%+) on their hard choices than on their easy ones. Real people slow down; people clicking without reading don't."
          legend={QUALITY_LEGEND}
          takeaway={
            <>
              {sdOf("green")?.pct ?? 0}% of high-quality players slowed down on hard choices, against {sdOf("red")?.pct ?? 0}% of low-quality players. Not slowing
              down is a sign the player isn&apos;t weighing the options, so it is one of the warning signs in the quality score.
            </>
          }
        >
          <LabeledBars
            data={sd}
            x="group"
            xLabel="How the player was rated"
            yLabel="% of players who slowed down"
            unit="%"
            yMax={100}
            tooltipLabel={(x) => x}
            series={[{ key: "pct", name: "Slowed down on hard choices", color: C.s1 }]}
            colorBy={(d) => (d.band === "green" ? C.good : d.band === "amber" ? C.warn : C.bad)}
          />
        </ExplainedChart>
      </div>
    </div>
  );
}
