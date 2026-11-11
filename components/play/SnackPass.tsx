"use client";
import { useEffect, useState } from "react";
import { motion, animate } from "framer-motion";

export const MILESTONES = [50, 110, 170, 230]; // keep in sync with SNACK_PASS_MILESTONES (engine)

const LEVEL_NAMES = ["Snack Rookie", "Bronze Snacker", "Silver Snacker", "Gold Snacker", "Snack Legend"];

export function levelFor(points: number) {
  const lvl = MILESTONES.filter((m) => points >= m).length;
  const next = MILESTONES[lvl] ?? null;
  const prev = lvl ? MILESTONES[lvl - 1] : 0;
  return { lvl, name: LEVEL_NAMES[lvl], next, progress: next ? (points - prev) / (next - prev) : 1 };
}

/** Animated points counter + Snack Pass progress towards the next milestone. */
export function SnackPass({ points }: { points: number }) {
  const [shown, setShown] = useState(points);
  useEffect(() => {
    const c = animate(shown, points, { duration: 0.6, onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);
  const l = levelFor(points);
  return (
    <div className="card flex items-center gap-3 px-3 py-2">
      <span className="text-lg" aria-hidden>
        🎟️
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between text-[11px] font-semibold">
          <span>{l.name}</span>
          <span className="text-muted">{l.next ? `${l.next - points} to next level` : "Max level!"}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
          <motion.div className="h-full bg-butter" animate={{ width: `${Math.round(l.progress * 100)}%` }} />
        </div>
      </div>
      <span className="font-display text-lg font-extrabold tabular-nums">{shown}</span>
    </div>
  );
}
