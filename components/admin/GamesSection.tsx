"use client";
/**
 * Games & engagement tab: which games work (players finish them and answer with care),
 * and do players get tired or distracted as the session goes on?
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars, pct } from "./charts";

/** Plain names: the registry/format labels carry technical suffixes. */
const GAME_NAME: Record<string, string> = {
  "Label Detective (memory)": "Label Detective",
  "Gut Check (swipe)": "Gut Check",
  "Snack Moments (3-card)": "Snack Moments: 3-card choices",
  "Showdown (duel)": "Snack Moments: 2-card duels",
  "Stock the Shelf (budget)": "Stock the Shelf",
  "Peek & Pick (process tracing)": "Peek & Pick",
  "Bid It (BDM auction)": "Bid It",
  "My Snack Week (frequency)": "My Snack Week",
  "Build-a-Bar (design + squeeze)": "Build-a-Bar",
  "Guess the Crowd (projective)": "Guess the Crowd",
};

export function GamesSection({ data }: { data: AdminData }) {
  const en = data.engagement;
  const games = en.formats.map((g) => {
    const completion = g.completion ?? null;
    const rushed = g.rushedPct ?? 0;
    const verdict =
      completion != null && completion < 0.85
        ? { text: "Watch: players quit here", tone: "warn" }
        : rushed > 25
          ? { text: "Watch: many rushed answers", tone: "warn" }
          : { text: "Works well", tone: "good" };
    return { name: GAME_NAME[g.format] ?? g.format, players: g.n, completion, time: g.medianSec, rushed, verdict };
  });
  const watch = games.filter((g) => g.verdict.tone === "warn");

  const rq = en.rushByQuestion;
  const firstThree = rq.slice(0, 3);
  const lastThree = rq.slice(-3);
  const avg = (xs: { rushed: number }[]) => (xs.length ? Math.round(xs.reduce((a, x) => a + x.rushed, 0) / xs.length) : 0);
  const early = avg(firstThree);
  const late = avg(lastThree);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-1/2 lg:grid-cols-1">
        <KeyNumber
          label="Switched to another app mid-game"
          value={pct(en.distractionRate)}
          explain="Players who left the game at least once (another tab, a message) and came back. Normal on phones; not a penalty, but it explains some slow answers."
        />
      </div>

      <section className="card min-w-0 p-5">
        <h3 className="font-display text-lg font-bold">Which games work well?</h3>
        <p className="mt-1 text-sm text-muted">
          <span className="font-semibold text-ink">How to read it: </span>one row per game. &ldquo;Finished&rdquo; is the share of players who started the game and completed it;
          &ldquo;typical time&rdquo; and &ldquo;rushed answers&rdquo; (given faster than anyone could read) count only high and medium quality players, so a game isn&apos;t blamed
          for careless players. A game is fun but useless if people race through it.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2">Game</th>
                <th className="text-right">Players</th>
                <th className="text-right">Finished</th>
                <th className="text-right">Typical time</th>
                <th className="text-right">Rushed answers</th>
                <th className="pl-4">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.name} className="border-t border-line">
                  <td className="py-2 font-medium">{g.name}</td>
                  <td className="text-right tabular-nums">{g.players}</td>
                  <td className="text-right tabular-nums">{g.completion != null ? pct(g.completion) : "–"}</td>
                  <td className="text-right tabular-nums">{g.time != null ? `${g.time}s` : "–"}</td>
                  <td className="text-right tabular-nums">{`${g.rushed}%`}</td>
                  <td className="pl-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${g.verdict.tone === "good" ? "bg-good/10 text-good" : "bg-warn/20 text-[#8a6200]"}`}>
                      {g.verdict.tone === "good" ? "✓ " : "! "}
                      {g.verdict.text}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 rounded-xl bg-bg px-3 py-2 text-sm">
          <span className="font-semibold">💡 What it says: </span>
          {watch.length
            ? `Worth a look: ${watch.map((g) => `${g.name} (${g.verdict.text.replace("Watch: ", "")})`).join(", ")}. The other games are finished by most players and answered with care.`
            : "Every game is finished by most players and answered with care."}
        </p>
      </section>

      <ExplainedChart
        question="Do players rush more as Snack Moments goes on?"
        howToRead="each bar is a question number in Snack Moments (the adaptive game asks 4 to 10). Its height is the share of answers to that question that were rushed, counting high and medium quality players only. Bars rising towards the end would mean players are getting tired or bored."
        takeaway={
          rq.length >= 4 ? (
            late > early + 5 ? (
              <>
                Rushing rises from {early}% on the first questions to {late}% on the last ones, so players tire towards the end. Stopping the game earlier, or making late questions
                quicker, would help.
              </>
            ) : (
              <>
                Rushing stays about the same from the first questions ({early}%) to the last ({late}%), so players aren&apos;t tiring: the adaptive game is a good length.
              </>
            )
          ) : (
            "Not enough answers yet."
          )
        }
      >
        <LabeledBars
          data={rq}
          x="question"
          xLabel="Question number in Snack Moments"
          yLabel="% of answers rushed"
          unit="%"
          tooltipLabel={(x) => `Question ${x}`}
          series={[{ key: "rushed", name: "Answers rushed", color: C.s2 }]}
        />
      </ExplainedChart>
    </div>
  );
}
