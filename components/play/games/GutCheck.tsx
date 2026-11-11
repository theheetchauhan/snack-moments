"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type GutScreen = Extract<Screen, { kind: "gut" }>;

/**
 * Gut Check (swipe stack). Here timing IS the point: we want fast, pre-deliberation reactions,
 * which we later compare with considered choices ("gut vs considered" gap). Buttons are offered
 * as an accessible alternative to dragging.
 */
export function GutCheck({ screen, tracker, onSubmit, busy }: { screen: GutScreen; tracker: Tracker; onSubmit: (r: { swipes: { snackId: string; right: boolean; ms: number; reversals: number }[] }) => void; busy: boolean }) {
  const [i, setI] = useState(0);
  const [exitDir, setExitDir] = useState(0);
  const swipes = useRef<{ snackId: string; right: boolean; ms: number; reversals: number }[]>([]);
  const shown = useRef(performance.now());
  const reversals = useRef(0);
  const lastSide = useRef(0);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  const yesOpacity = useTransform(x, [20, 120], [0, 1]);
  const noOpacity = useTransform(x, [-120, -20], [1, 0]);

  useEffect(() => {
    shown.current = performance.now();
    reversals.current = 0;
    lastSide.current = 0;
    x.set(0);
  }, [i, x]);

  const decide = (right: boolean) => {
    const card = screen.cards[i];
    const ms = performance.now() - shown.current;
    swipes.current.push({ snackId: card.snack.id, right, ms, reversals: reversals.current });
    tracker.track("gut_swipe", null, { snackId: card.snack.id, right, ms: Math.round(ms), reversals: reversals.current });
    setExitDir(right ? 1 : -1);
    if (i + 1 < screen.cards.length) setI(i + 1);
    else onSubmit({ swipes: swipes.current });
  };

  const onDrag = (_: unknown, info: PanInfo) => {
    const side = info.offset.x > 30 ? 1 : info.offset.x < -30 ? -1 : 0;
    if (side !== 0 && lastSide.current !== 0 && side !== lastSide.current) reversals.current++;
    if (side !== 0) lastSide.current = side;
  };

  const card = screen.cards[i];
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Warm-up · Gut check ⚡</p>
        <h2 className="font-display text-xl font-bold">Would you grab it? Go with your gut.</h2>
        <p className="mt-1 text-sm text-muted">Swipe right for yes, left for nah. Fast is fine here.</p>
      </div>
      <div className="relative h-72">
        <AnimatePresence custom={exitDir}>
          {card && (
            <motion.div
              key={card.snack.id}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.9}
              style={{ x, rotate }}
              onDrag={onDrag}
              onDragEnd={(_, info) => {
                if (info.offset.x > 110) decide(true);
                else if (info.offset.x < -110) decide(false);
              }}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ x: exitDir * 400, opacity: 0, transition: { duration: 0.2 } }}
              className="card absolute inset-0 flex cursor-grab touch-pan-y flex-col items-center justify-center p-6 text-center active:cursor-grabbing"
            >
              <motion.span style={{ opacity: yesOpacity }} className="absolute left-4 top-4 rounded-lg border-2 border-good px-2 py-1 text-sm font-bold text-good">
                YES
              </motion.span>
              <motion.span style={{ opacity: noOpacity }} className="absolute right-4 top-4 rounded-lg border-2 border-bad px-2 py-1 text-sm font-bold text-bad">
                NAH
              </motion.span>
              <span className="text-7xl" aria-hidden>
                {card.snack.emoji}
              </span>
              <p className="mt-3 font-display text-2xl font-bold">{card.snack.name}</p>
              <p className="mt-1 text-muted">
                ₹{card.price} · {card.snack.proteinG}g protein
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button className="btn btn-ghost" disabled={busy} onClick={() => decide(false)}>
          👎 Nah
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => decide(true)}>
          👍 Yes
        </button>
      </div>
      <p className="text-center text-xs text-muted">
        {Math.min(i + 1, screen.cards.length)} / {screen.cards.length}
      </p>
    </div>
  );
}
