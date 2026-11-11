"use client";
import { useRef, useState } from "react";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type CrowdScreen = Extract<Screen, { kind: "crowd" }>;

export interface CrowdResult {
  guessPct: number;
  adjustments: number;
  ms: number;
  bonus: { guesses: (number | null)[]; skipped: boolean; ms: number };
}

/**
 * Guess the Crowd (+ the optional bonus questions, on the same screen so it's one step).
 * A projective question: points depend ONLY on how well you predict other players,
 * never on your own choice, so the reward can't bias your answer.
 */
export function GuessTheCrowd({ screen, tracker, onSubmit, busy }: { screen: CrowdScreen; tracker: Tracker; onSubmit: (r: CrowdResult) => void; busy: boolean }) {
  const start = useRef(performance.now());
  const [v, setV] = useState(50);
  const [touched, setTouched] = useState(false);
  const adjustments = useRef(0);
  const [guesses, setGuesses] = useState<(number | null)[]>(screen.bonus.questions.map(() => null));
  const target = screen.options.find((o) => o.snack.id === screen.targetSnackId)!;
  const answeredBonus = guesses.filter((g) => g != null).length;

  const submit = () => {
    const ms = Math.round(performance.now() - start.current);
    const skipped = answeredBonus < guesses.length;
    onSubmit({ guessPct: v, adjustments: adjustments.current, ms, bonus: { guesses: skipped ? [] : guesses, skipped, ms } });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Game · Guess the crowd 👥</p>
        <h2 className="font-display text-xl font-bold">
          {screen.moment.emoji} {screen.moment.label}
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {screen.options.map((o) => (
            <div key={o.snack.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${o.snack.id === target.snack.id ? "border-ink" : "border-line"}`}>
              <span>
                {o.snack.emoji} {o.snack.name} <span className="text-xs text-muted">· {o.snack.proteinG}g</span>
              </span>
              <b>₹{o.price}</b>
            </div>
          ))}
        </div>
        <p className="mt-4 font-semibold">
          Out of 100 players, how many would pick the <span className="text-accent">{target.snack.name.toLowerCase()}</span> here?
        </p>
        <p className="text-sm text-muted">The closer your guess, the more points (up to 50).</p>
        <div className="mt-3 text-center font-display text-5xl font-extrabold">{v}</div>
        <input
          type="range"
          min={0}
          max={100}
          value={v}
          aria-label="Your guess, out of 100 players"
          className="mt-2 w-full"
          onChange={(e) => {
            setV(Number(e.target.value));
            setTouched(true);
          }}
          onPointerUp={() => {
            adjustments.current++;
            tracker.track("crowd_adjust", null, { value: v });
          }}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="bg-accent px-5 py-3 text-white">
          <p className="font-display font-extrabold">⭐ Bonus: which did more players pick?</p>
          <p className="text-xs opacity-90">Optional · +{screen.bonus.reward} points for each right answer</p>
        </div>
        <div className="grid gap-3 p-4">
          {screen.bonus.questions.map((q, qi) => (
            <div key={qi}>
              <p className="text-sm font-semibold">
                {q.moment.emoji} {q.moment.label}
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {q.options.map((o, oi) => (
                  <button
                    key={o.snack.id}
                    onClick={() => setGuesses((g) => g.map((x, j) => (j === qi ? oi : x)))}
                    className={`rounded-xl border p-2 text-center ${guesses[qi] === oi ? "border-ink bg-ink text-white" : "border-line"}`}
                    aria-pressed={guesses[qi] === oi}
                  >
                    <span className="text-2xl" aria-hidden>
                      {o.snack.emoji}
                    </span>
                    <span className="block text-xs font-semibold">{o.snack.name}</span>
                    <span className="block text-[11px] opacity-70">₹{o.price}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="btn btn-primary w-full" disabled={!touched || busy} onClick={submit}>
        {answeredBonus === guesses.length ? "Lock in my guesses" : "That's my guess (skip bonus)"}
      </button>
    </div>
  );
}
