"use client";
import { motion } from "framer-motion";
import type { Results } from "./types";

/**
 * End-of-game results card: driver profile, ₹ per gram by moment, say vs do,
 * bonus-game highlights (bid, bar, snack week) and points earned.
 */
const DRIVER_COPY: Record<string, { title: string; emoji: string; line: string }> = {
  "price-led": { title: "The Smart Spender", emoji: "🪙", line: "Price is your main filter. Protein wins only when it's a good deal." },
  "taste-led": { title: "The Flavour Hunter", emoji: "😋", line: "Taste comes first. Protein is a bonus, not the reason." },
  "protein-led": { title: "The Protein Loyalist", emoji: "💪", line: "You genuinely pay for protein, in almost every moment." },
  "context-switcher": { title: "The Context Switcher", emoji: "🔀", line: "Protein matters at your desk and the gym, but late at night comfort wins." },
  undecided: { title: "The Balancer", emoji: "⚖️", line: "No single thing drives you. Price, taste and protein all pull a bit." },
};

const fmt = (x: number) => (x <= 0.05 ? "₹0" : `₹${x.toFixed(1)}`);

const BAR_LABEL: Record<string, string> = { protein: "protein", lowSugar: "less sugar", taste: "taste", lowPrice: "a lower price", size: "size" };
const WEEK_LABEL: Record<string, string> = {
  desk_430: "💻 4:30pm at your desk",
  post_gym: "🏋️ after the gym",
  pre_meeting: "📋 before a meeting",
  late_night: "🌙 late night",
  movie_night: "🎬 movie night",
  road_trip: "🚗 road trips",
};
const GAME_LABEL: Record<string, string> = { peek: "Peek & Pick", week: "My Snack Week", bid: "Bid It", shelf: "Stock the Shelf", bar: "Build-a-Bar" };

export function ResultsCard({ r, onAgain }: { r: Results; onAgain: () => void }) {
  const d = DRIVER_COPY[r.posterior?.driver ?? "undecided"] ?? DRIVER_COPY.undecided;
  const revealed = r.divergence.revealedIndex;
  return (
    <div className="flex flex-col gap-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card overflow-hidden">
        <div className="bg-ink p-6 text-white">
          <p className="text-xs uppercase tracking-wider opacity-70">Your snack personality</p>
          <h2 className="mt-1 font-display text-3xl font-extrabold">
            {d.emoji} {d.title}
          </h2>
          <p className="mt-2 opacity-90">{d.line}</p>
        </div>
        {r.posterior && (
          <div className="grid grid-cols-2 gap-px bg-line">
            <div className="bg-surface p-4">
              <p className="text-xs text-muted">Protein is worth, at your desk / gym</p>
              <p className="font-display text-2xl font-bold text-leaf">{fmt(r.posterior.wtpFunctional.median)}/g</p>
            </div>
            <div className="bg-surface p-4">
              <p className="text-xs text-muted">…and late night / fun moments</p>
              <p className="font-display text-2xl font-bold text-berry">{fmt(r.posterior.wtpCraving.median)}/g</p>
            </div>
          </div>
        )}
      </motion.div>

      {r.stated != null && (
        <div className="card p-5">
          <p className="text-sm text-muted">Say vs do</p>
          <div className="mt-2 flex items-end gap-6">
            <div>
              <p className="font-display text-3xl font-extrabold">{r.stated}/5</p>
              <p className="text-xs text-muted">you said protein matters</p>
            </div>
            <div>
              <p className="font-display text-3xl font-extrabold text-accent">{revealed.toFixed(1)}/5</p>
              <p className="text-xs text-muted">how you actually chose</p>
            </div>
          </div>
          <p className="mt-3 text-sm">
            {Math.abs(r.stated - revealed) < 1
              ? "Your words and choices line up nicely."
              : r.stated > revealed
                ? "Like most people, you rate protein higher than your choices do. That gap is exactly what this game measures."
                : "Interesting: you value protein more in practice than you say."}
          </p>
        </div>
      )}

      {r.bid && (
        <div className="card p-5">
          <p className="text-sm text-muted">Bid it 🔨: what a protein bar is worth to you</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {r.bid.rounds.map((b) => (
              <div key={b.momentId} className="rounded-xl bg-bg p-3">
                <p className="text-xs text-muted">{b.momentId === "post_gym" ? "🏋️ After the gym" : "🌙 At 11pm"}</p>
                <p className="font-display text-2xl font-bold">₹{b.bid}</p>
                <p className="text-xs">
                  Shop price ₹{b.randomPrice} · {b.won ? "you bought it ✅" : "kept your coins"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.bar && (
        <div className="card p-5">
          <p className="text-sm text-muted">Build-a-bar 🧪: your invention</p>
          <p className="mt-1 font-display text-2xl font-extrabold">{r.bar.name}</p>
          <p className="mt-1 text-xs text-muted">
            Under cost pressure you protected:{" "}
            {Object.entries(r.bar.final)
              .filter(([k, v]) => v > 0 && v >= (r.bar!.alloc[k] ?? 0))
              .map(([k]) => BAR_LABEL[k] ?? k)
              .join(", ") || "nothing fully"}
          </p>
        </div>
      )}

      {r.week && (
        <div className="card p-5">
          <p className="text-sm text-muted">My snack week 📅</p>
          <p className="mt-1 font-display text-2xl font-extrabold">
            ~{Math.round(Object.values(r.week.freq).reduce((a, b) => a + b, 0))} snack moments a week
          </p>
          <p className="mt-1 text-xs text-muted">
            Biggest moment:{" "}
            {Object.entries(r.week.freq).sort((a, b) => b[1] - a[1])[0]?.[1] ? WEEK_LABEL[Object.entries(r.week.freq).sort((a, b) => b[1] - a[1])[0][0]] : "none"}
          </p>
        </div>
      )}

      {r.rotation.length > 0 && <p className="text-center text-xs text-muted">🎲 Your bonus games this time: {r.rotation.map((g) => GAME_LABEL[g] ?? g).join(" · ")}. Play again for different ones!</p>}

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Points earned</p>
            <p className="font-display text-4xl font-extrabold">{r.points}</p>
          </div>
          {r.crowd && (
            <div className="text-right text-sm">
              <p>
                You guessed <b>{r.crowd.guessPct} in 100</b> would pick the protein bar
              </p>
              <p className="text-muted">
                {r.crowd.actualPct != null ? `Based on everyone's choices so far, it's about ${r.crowd.actualPct} in 100` : "Waiting for more players to compare"}
              </p>
            </div>
          )}
        </div>
        {r.rewards.filter((x) => x.kind === "badge").length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {r.rewards
              .filter((x) => x.kind === "badge")
              .map((b) => (
                <span key={b.id} className="rounded-full bg-butter/50 px-3 py-1 text-xs font-semibold">
                  {b.emoji} {b.label.replace("Badge: ", "")}
                </span>
              ))}
          </div>
        )}
        <ul className="mt-3 divide-y divide-line text-sm">
          {r.rewards
            .filter((x) => x.points > 0)
            .map((x) => (
              <li key={x.id} className="flex justify-between py-1.5">
                <span>
                  {x.emoji} {x.label}
                </span>
                <b>+{x.points}</b>
              </li>
            ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">Points never depend on which snacks you pick, only on finishing, skill, luck and careful play.</p>
      </div>
      <p className="text-center text-xs text-muted">
        {r.rounds} adaptive rounds · the game stopped once it had learned enough about you.
      </p>
      <button className="btn btn-ghost w-full" onClick={onAgain}>
        Play again
      </button>
    </div>
  );
}
