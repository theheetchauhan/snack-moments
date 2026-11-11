"use client";
/**
 * Game rotation tab: every player plays the main games plus 2 bonus games, chosen by judgment
 * (what we already know about the player) with a fair-share balance and a guaranteed chance for
 * every game. This tab checks two things:
 *   1. games really go to the players they suit,
 *   2. choosing by judgment doesn't skew the results (and how we correct for it).
 * The results of the bonus games themselves live on Brand HQ and the Evidence board.
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars } from "./charts";

/** Who each bonus game suits: a plain summary of the rules in lib/adaptive/rotation.ts. */
const SUITS: Record<string, string> = {
  peek: "missed the protein in Label Detective, or swiped very fast in Gut Check",
  week: "liked protein snacks in Gut Check, or go to the gym",
  bid: "still leave the game unsure what protein is worth to them (held back from players who rush)",
  shelf: "lean towards protein, or choose differently depending on the moment",
  bar: "show no clear reason behind their choices yet, or lean towards protein",
};

export function RotationSection({ data }: { data: AdminData }) {
  const rt = data.rotation;
  const least = [...rt.perGame].sort((a, b) => a.players - b.players)[0];
  const minChance = Math.min(...rt.perGame.map((g) => g.minProb ?? 1));

  const suits = rt.suits.filter((g) => g.suited != null && g.other != null);
  const working = suits.filter((g) => g.suited! > g.other!);
  const best = [...suits].sort((a, b) => b.suited! - b.other! - (a.suited! - a.other!))[0];

  const checks = rt.checks.filter((c) => Number.isFinite(c.naive.estimate) && Number.isFinite(c.ipw.estimate));
  const changed = checks.filter((c) => c.naive.estimate < c.ipw.lo || c.naive.estimate > c.ipw.hi);
  const fmt = (v: number, unit: string) => (unit === "%" ? `${v.toFixed(0)}%` : unit === "₹" ? `₹${v.toFixed(0)}` : v.toFixed(1));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber
          label="Players given bonus games"
          value={String(rt.decided)}
          explain="Besides the main games, each player gets 2 bonus games: 1 of 2 before Snack Moments and 1 of 3 after. This keeps a run short."
        />
        <KeyNumber
          label="Least-played bonus game"
          value={least ? `${least.players} players` : "–"}
          explain={least ? `${least.game}. A fair-share balance keeps every bonus game close to an even split, so even the least-played one has enough players to measure.` : "No bonus games given yet."}
        />
        <KeyNumber
          label="Lowest chance any player had"
          value={Number.isFinite(minChance) ? `${Math.round(minChance * 100)}%` : "–"}
          explain="No player ever has zero chance of a bonus game. That's what lets us correct the results at the bottom of this page."
        />
      </div>

      <ExplainedChart
        question="Do games go to the players they suit?"
        howToRead={
          <>
            bonus games aren&apos;t handed out at random. Using what it already knows about a player, the game works out which bonus game fits them best (would teach us the
            most). The blue bar is how often players got a game when it was their best fit; the grey bar is how often they got it when another game fitted better. Blue higher
            than grey means the choice is working. Grey never drops to zero, so every kind of player still plays every game. When each game fits best is listed under the chart.
          </>
        }
        legend={[
          { color: C.s1, label: "It was their best fit" },
          { color: "#c3c2b7", label: "Another game fitted better" },
        ]}
        takeaway={
          best ? (
            <>
              {working.length === suits.length ? "For every game" : `For ${working.length} of ${suits.length} games`}, players get a game more often when it is their best fit. The
              clearest is {best.game}: {best.suited}% of players it fitted best got it, against {best.other}% of the rest.
              {working.length < suits.length && (
                <>
                  {" "}
                  {suits
                    .filter((g) => g.suited! <= g.other!)
                    .map((g) => g.game)
                    .join(", ")}{" "}
                  {suits.length - working.length === 1 ? "shows" : "show"} no difference yet: the fair-share balance is outweighing the fit.
                </>
              )}
            </>
          ) : (
            "Not enough players yet to check."
          )
        }
      >
        <LabeledBars
          data={rt.suits.map((g) => ({ ...g, suited: g.suited ?? 0, other: g.other ?? 0 }))}
          x="game"
          xLabel="Bonus game"
          yLabel="% of players given it"
          unit="%"
          yMax={100}
          series={[
            { key: "suited", name: "It was their best fit", color: C.s1 },
            { key: "other", name: "Another game fitted better", color: "#c3c2b7" },
          ]}
          height={260}
        />
        <dl className="mt-3 grid gap-1 text-sm">
          {rt.suits.map((g) => (
            <div key={g.key} className="sm:flex sm:gap-2">
              <dt className="font-semibold sm:shrink-0">{g.game} fits best for players who:</dt>
              <dd className="text-muted">{SUITS[g.key]}</dd>
            </div>
          ))}
        </dl>
      </ExplainedChart>

      <section className="card min-w-0 p-5">
        <h3 className="font-display text-lg font-bold">Would random hand-out give the same results?</h3>
        <p className="mt-1 text-sm text-muted">
          Bonus games go to the players they suit, not at random. So we work out what each result would have been if games had been handed out at random. If it&apos;s about
          the same, choosing by fit isn&apos;t bending the results.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2">Game · what it measures</th>
                <th className="text-right">What we saw</th>
                <th className="text-right">If handed out at random</th>
                <th className="pl-4">Same answer?</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => {
                const big = changed.includes(c);
                return (
                  <tr key={c.game} className="border-t border-line">
                    <td className="py-2">
                      <span className="font-medium">{c.game}</span> <span className="text-muted">· {c.metric}</span>
                    </td>
                    <td className="text-right tabular-nums">{fmt(c.naive.estimate, c.unit)}</td>
                    <td className="text-right font-semibold tabular-nums">{fmt(c.ipw.estimate, c.unit)}</td>
                    <td className="pl-4">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${big ? "bg-warn/20 text-[#8a6200]" : "bg-good/10 text-good"}`}>
                        {big ? "! No: use the random one" : "✓ Yes"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 rounded-xl bg-bg px-3 py-2 text-sm">
          <span className="font-semibold">💡 What it says: </span>
          {changed.length ? (
            <>
              {changed.map((c) => c.game).join(", ")} would come out differently with random hand-out, so the brand pages use the &ldquo;if handed out at random&rdquo; number.
            </>
          ) : (
            <>Every game gives about the same answer either way (small gaps are just chance), so choosing games by fit doesn&apos;t bias what we learn.</>
          )}
        </p>
      </section>
    </div>
  );
}
