"use client";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Screen } from "../types";

type BonusScreen = Extract<Screen, { kind: "bonus" }>;

/** Optional, skippable bonus round: predict which snack more players picked (skill-based points). */
export function BonusRound({ screen, onSubmit, busy }: { screen: BonusScreen; onSubmit: (r: { guesses: (number | null)[]; skipped: boolean; ms: number }) => void; busy: boolean }) {
  const start = useRef(performance.now());
  const [guesses, setGuesses] = useState<(number | null)[]>(screen.questions.map(() => null));
  return (
    <div className="flex flex-col gap-4">
      <motion.div initial={{ scale: 0.9, rotate: -2 }} animate={{ scale: 1, rotate: 0 }} className="card overflow-hidden">
        <div className="bg-accent p-5 text-white">
          <p className="text-xs uppercase tracking-wider opacity-80">Bonus round unlocked ⭐</p>
          <h2 className="font-display text-2xl font-extrabold">Read the crowd</h2>
          <p className="mt-1 text-sm opacity-90">Which did MORE players pick? +{screen.reward} points for each right answer. Optional!</p>
        </div>
      </motion.div>
      {screen.questions.map((q, qi) => (
        <div key={qi} className="card p-4">
          <p className="text-sm font-semibold">
            {q.moment.emoji} {q.moment.label}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {q.options.map((o, oi) => (
              <button
                key={o.snack.id}
                onClick={() => setGuesses((g) => g.map((x, j) => (j === qi ? oi : x)))}
                className={`rounded-xl border p-3 text-center ${guesses[qi] === oi ? "border-ink bg-ink text-white" : "border-line"}`}
              >
                <div className="text-3xl" aria-hidden>
                  {o.snack.emoji}
                </div>
                <div className="text-sm font-semibold">{o.snack.name}</div>
                <div className="text-xs opacity-70">₹{o.price}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="btn btn-accent w-full" disabled={guesses.some((g) => g == null) || busy} onClick={() => onSubmit({ guesses, skipped: false, ms: performance.now() - start.current })}>
        Lock my predictions
      </button>
      <button className="text-sm text-muted underline" disabled={busy} onClick={() => onSubmit({ guesses: [], skipped: true, ms: performance.now() - start.current })}>
        Skip bonus round
      </button>
    </div>
  );
}
