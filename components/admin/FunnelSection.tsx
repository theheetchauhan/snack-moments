"use client";
/**
 * Funnel tab: where players stop, how many adaptive questions they needed (and why the game
 * stopped asking), where inside those questions people quit, and whether bonus games get finished.
 * Every chart says how to read it and what it shows.
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars, pct } from "./charts";

const GREY = "#c3c2b7";

export function FunnelSection({ data }: { data: AdminData }) {
  const steps = data.funnel.steps;
  const started = Math.max(1, steps[0]?.count ?? 1);
  const rows = steps.map((s, i) => ({ ...s, share: s.count / started, lost: i ? Math.max(0, steps[i - 1].count - s.count) : 0 }));
  const worst = rows.reduce((w, r) => (r.lost > w.lost ? r : w), rows[0]);
  const worstIdx = rows.indexOf(worst);
  const finished = rows[rows.length - 1]?.count ?? 0;

  const byReason = data.funnel.roundsByReason;
  const tot = (k: "confident" | "noMoreToLearn" | "limit" | "other") => byReason.reduce((a, r) => a + r[k], 0);
  // "confident" and "nothing more to learn" both mean the game had learned enough about the player
  const byOutcome = byReason.map((r) => ({ questions: r.questions, enough: r.confident + r.noMoreToLearn, limit: r.limit, other: r.other }));
  const allRounds = byReason.reduce((a, r) => a + r.confident + r.noMoreToLearn + r.limit + r.other, 0) || 1;
  const short = byReason.filter((r) => Number(r.questions) <= 6).reduce((a, r) => a + r.confident + r.noMoreToLearn + r.limit + r.other, 0);
  const medianQ = data.overview.medianRounds;

  const quits = data.funnel.quitByQuestion;
  const quitTotal = quits.reduce((a, q) => a + q.quit, 0);
  const quitPeak = quits.reduce((m, q) => (q.quit > m.quit ? q : m), quits[0]);

  const bonus = data.rotation.perGame.map((g) => ({ game: g.game, finished: g.finished ?? 0, given: g.eligible ? Math.round(((g.assigned ?? 0) / 100) * g.eligible) : 0 }));
  const weakest = bonus.filter((b) => b.given > 0).sort((a, b) => a.finished - b.finished)[0];

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber label="Finished, out of everyone who started" value={pct(finished / started)} explain={`${finished} of ${started} players made it from the first screen to the end.`} />
        <KeyNumber
          label="Step where most players quit"
          value={worst.lost ? worst.step : "None"}
          explain={worst.lost ? `${worst.lost} players quit during this step. Making it shorter or easier would keep the most players.` : "Nobody stopped part-way."}
        />
        <KeyNumber
          label="Typical number of Snack Moments questions"
          value={medianQ != null ? String(medianQ) : "–"}
          explain="The main game adapts: it asks 4 to 10 questions and stops as soon as it understands the player."
        />
      </div>

      {/* 1. the step-by-step funnel */}
      <ExplainedChart
        question="Where do players stop?"
        howToRead="each row is one step of the game, in order. The bar shows how many players got through that step, and what share of everyone who started that is. The red number is how many players quit during that step and never reached the next one. A bonus game counts as part of the step that comes after it."
        takeaway={
          worst.lost ? (
            <>
              {pct(finished / started)} of players finish. Most players quit during <b>{worst.step}</b> ({worst.lost} players), so that is the first step to make shorter
              or easier. Bonus games don&apos;t get their own row because each player gets different ones; see the last chart.
            </>
          ) : (
            "Everyone who started finished."
          )
        }
      >
        <div className="mb-2 flex justify-between text-xs font-semibold text-muted">
          <span>Step</span>
          <span>Players who got through it (share of starters)</span>
        </div>
        <ol className="grid gap-2" aria-label="Funnel steps">
          {rows.map((r, i) => (
            <li key={r.step} className="grid grid-cols-[minmax(0,9rem)_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_5rem]">
              <span className="truncate">
                <span className="text-muted">{i + 1}.</span> {r.step}
              </span>
              <div className="h-7 rounded-md bg-line/60">
                <div
                  className="flex h-7 items-center rounded-md px-2 text-xs font-semibold text-white"
                  style={{ width: `${Math.max(8, r.share * 100)}%`, background: i === worstIdx && r.lost ? C.s2 : C.s1 }}
                >
                  {r.count} · {pct(r.share)}
                </div>
              </div>
              <span className={`text-right text-xs font-semibold ${r.lost ? "text-bad" : "text-muted"}`}>{r.lost ? `${r.lost} quit here` : "–"}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted">
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: C.s2 }} /> Orange bar = the step where most players quit.
        </p>
      </ExplainedChart>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 2. adaptive length and why it stopped */}
        <ExplainedChart
          question="How many questions did Snack Moments need?"
          howToRead="each bar is a number of questions (4 to 10). Its height is how many finished players needed that many. The colour says why the game stopped asking."
          legend={[
            { color: C.good, label: "Learned enough", note: "more questions wouldn't change the result" },
            { color: C.s2, label: "Hit the limit", note: "stopped at the 10-question maximum" },
          ]}
          takeaway={
            <>
              {pct(short / allRounds)} of players were done in 6 questions or fewer. For {pct((tot("confident") + tot("noMoreToLearn")) / allRounds)} the game stopped because it
              had learned enough; only {pct(tot("limit") / allRounds)} needed all 10 questions (usually players whose choices are hard to read).
            </>
          }
        >
          <LabeledBars
            data={byOutcome}
            x="questions"
            stacked
            xLabel="Questions asked in Snack Moments"
            yLabel="Finished players"
            tooltipLabel={(x) => `${x} questions`}
            series={[
              { key: "enough", name: "Learned enough", color: C.good },
              { key: "limit", name: "Hit the limit", color: C.s2 },
              { key: "other", name: "Other", color: GREY },
            ]}
          />
        </ExplainedChart>

        {/* 3. quitting inside the adaptive game */}
        <ExplainedChart
          question="Where in Snack Moments do people quit?"
          howToRead="each bar is a question number. Its height is how many players left the game while on that question."
          takeaway={
            quitTotal ? (
              <>
                {quitTotal} players quit during Snack Moments, most often at question {quitPeak.question} ({quitPeak.quit} players). If quitting piles up on late questions, the game
                feels too long.
              </>
            ) : (
              "Nobody quit during Snack Moments."
            )
          }
        >
          <LabeledBars
            data={quits}
            x="question"
            xLabel="Question number in Snack Moments"
            yLabel="Players who quit"
            tooltipLabel={(x) => `Question ${x}`}
            series={[{ key: "quit", name: "Players who quit", color: C.s2 }]}
          />
        </ExplainedChart>
      </div>

      {/* 4. bonus games */}
      <ExplainedChart
        question="Do players finish the bonus game they're given?"
        howToRead="each player gets 2 of these 5 bonus games. Each bar shows, out of the players given that game, the share who finished it."
        takeaway={
          weakest && weakest.finished >= 99 ? (
            "Everyone who was given a bonus game finished it, so none of them is putting players off."
          ) : weakest ? (
            <>
              The bonus game finished least often is <b>{weakest.game}</b> ({weakest.finished}% of players given it). A low number here means that game is confusing or too long.
            </>
          ) : (
            "No bonus games have been played yet."
          )
        }
      >
        <LabeledBars
          data={bonus}
          x="game"
          xLabel="Bonus game"
          yLabel="% who finished it"
          tooltipLabel={(x) => x}
          series={[{ key: "finished", name: "% finished", color: C.s3 }]}
        />
      </ExplainedChart>
    </div>
  );
}
