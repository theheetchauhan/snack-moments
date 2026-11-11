"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type WeekScreen = Extract<Screen, { kind: "week" }>;

export interface WeekResult {
  freq: Record<string, number>;
  overall: number;
  changes: number;
  ms: number;
}

/**
 * My Snack Week: how often does each snack moment really happen?
 * The "whole week" question comes FIRST, before the per-moment breakdown, so it works as an
 * independent consistency check (people can't just add up their own answers).
 * Frequency turns per-moment ₹/g into weekly demand for the brand view.
 */
export function MySnackWeek({ screen, tracker, onSubmit, busy }: { screen: WeekScreen; tracker: Tracker; onSubmit: (r: WeekResult) => void; busy: boolean }) {
  const start = useRef(performance.now());
  const changes = useRef(0);
  const [phase, setPhase] = useState<"overall" | "moments">("overall");
  const [overall, setOverall] = useState<number | null>(null);
  const [freq, setFreq] = useState<Record<string, number>>({});
  const answered = screen.moments.filter((m) => freq[m.id] != null).length;
  const total = Object.values(freq).reduce((a, b) => a + b, 0);

  const set = (momentId: string, v: number) => {
    if (freq[momentId] != null && freq[momentId] !== v) changes.current++;
    setFreq((f) => ({ ...f, [momentId]: v }));
    tracker.track("week_set", null, { momentId, value: v });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Game · My snack week 📅</p>
        <AnimatePresence mode="wait">
          {phase === "overall" ? (
            <motion.div key="o" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="font-display text-xl font-bold">First, a gut feel: how many snacks do you have in a normal week?</h2>
              <p className="mt-1 text-muted">Anything between meals counts. A rough guess is perfect.</p>
            </motion.div>
          ) : (
            <motion.div key="m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="font-display text-xl font-bold">Now map your week: how often does each moment happen?</h2>
              <p className="mt-1 text-muted">
                {answered}/{screen.moments.length} moments set
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {phase === "overall" ? (
        <div className="grid grid-cols-2 gap-2">
          {screen.overallBands.map((b) => (
            <button
              key={b.label}
              onClick={() => {
                setOverall(b.value);
                tracker.track("week_overall", null, { value: b.value });
              }}
              className={`rounded-2xl border p-4 text-center ${overall === b.value ? "border-ink bg-ink text-white" : "border-line bg-white"}`}
              aria-pressed={overall === b.value}
            >
              <div className="font-display text-2xl font-extrabold">{b.label}</div>
              <div className="text-xs opacity-70">snacks a week</div>
            </button>
          ))}
        </div>
      ) : (
        <>
          {screen.moments.map((m) => (
            <div key={m.id} className="card p-4">
              <p className="text-sm font-semibold">
                <span aria-hidden>{m.emoji}</span> {m.label}
              </p>
              <div className="mt-2 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={`How often: ${m.label}`}>
                {screen.bands.map((b) => (
                  <button
                    key={b.label}
                    role="radio"
                    aria-checked={freq[m.id] === b.value}
                    onClick={() => set(m.id, b.value)}
                    className={`rounded-xl border px-1 py-2 text-xs leading-tight ${freq[m.id] === b.value ? "border-ink bg-ink text-white" : "border-line"}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-2xl bg-butter/40 p-4 text-center text-sm">
            <p className="font-semibold">Your snack week</p>
            <p className="mt-1 text-2xl leading-snug" aria-label={`About ${Math.round(total)} snack moments a week`}>
              {total > 0 ? "🍪".repeat(Math.min(20, Math.round(total))) : "…"}
            </p>
            <p className="text-xs text-muted">about {Math.round(total)} snack moments a week</p>
          </div>
        </>
      )}

      {phase === "overall" ? (
        <button className="btn btn-primary w-full" disabled={overall == null || busy} onClick={() => setPhase("moments")}>
          Next
        </button>
      ) : (
        <button
          className="btn btn-primary w-full"
          disabled={answered < screen.moments.length || busy}
          onClick={() => onSubmit({ freq, overall: overall!, changes: changes.current, ms: Math.round(performance.now() - start.current) })}
        >
          That&apos;s my week
        </button>
      )}
    </div>
  );
}
