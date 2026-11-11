"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type RoundScreen = Extract<Screen, { kind: "round" }>;

export interface RoundAnswer {
  itemId: string;
  position: number;
  latencyMs: number;
  changes: number;
  focusCount: number;
  tapCancels: number;
  firstTouchMs: number | null;
}

/**
 * Adaptive choice round. Design rules that protect the construct:
 *  - no timer (we want considered trade-offs, not reflexes)
 *  - every card styled identically; screen order shuffled server-side
 *  - tap to select, then confirm (cuts accidental taps; changes of mind are recorded)
 *  - framing arm only changes which attribute is visually emphasised, never the information
 */
export function SnackMoments({ screen, tracker, onSubmit, busy }: { screen: RoundScreen; tracker: Tracker; onSubmit: (a: RoundAnswer) => void; busy: boolean }) {
  const shownAt = useRef(performance.now());
  const firstTouch = useRef<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const changes = useRef(0);
  const focus = useRef(0);
  const cancels = useRef(0);
  const pressing = useRef<number | null>(null);

  useEffect(() => {
    shownAt.current = performance.now();
    firstTouch.current = null;
    changes.current = 0;
    focus.current = 0;
    cancels.current = 0;
    setSelected(null);
    tracker.track("item_shown", screen.round, { itemId: screen.itemId, reason: screen.reason });
  }, [screen.itemId, screen.round, screen.reason, tracker]);

  const touch = () => {
    if (firstTouch.current == null) {
      firstTouch.current = performance.now() - shownAt.current;
      tracker.track("first_touch", screen.round, { ms: Math.round(firstTouch.current) });
    }
  };

  const select = (pos: number) => {
    touch();
    if (selected != null && selected !== pos) {
      changes.current++;
      tracker.track("option_change", screen.round, { from: selected, to: pos });
    }
    setSelected(pos);
    tracker.track("option_select", screen.round, { position: pos });
  };

  const confirm = () => {
    if (selected == null) return;
    const latency = performance.now() - shownAt.current;
    tracker.track("confirm", screen.round, { position: selected, latencyMs: Math.round(latency) });
    onSubmit({
      itemId: screen.itemId,
      position: selected,
      latencyMs: latency,
      changes: changes.current,
      focusCount: focus.current,
      tapCancels: cancels.current,
      firstTouchMs: firstTouch.current,
    });
  };

  const health = screen.framing === "health";
  const duel = screen.format === "duel";

  return (
    <div className="flex flex-col gap-4">
      <motion.div key={screen.itemId + "m"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {screen.moment.emoji}
          </span>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">{duel ? `Showdown · round ${screen.round}` : `Snack moment ${screen.round}`}</p>
            <h2 className="font-display text-xl font-bold">{screen.moment.label}</h2>
          </div>
        </div>
        <p className="mt-2 text-muted">{screen.moment.scene}</p>
        <p className="mt-3 font-semibold">{duel ? "Head to head: which one wins?" : "Which one goes in your cart?"}</p>
      </motion.div>

      {duel && (
        <div className="relative grid grid-cols-2 gap-3" role="radiogroup" aria-label="Head to head">
          {screen.options.map((o, i) => {
            const isSel = selected === o.position;
            return (
              <motion.button
                key={screen.itemId + o.position}
                initial={{ opacity: 0, x: i === 0 ? -16 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                role="radio"
                aria-checked={isSel}
                onClick={() => select(o.position)}
                onPointerDown={() => touch()}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") {
                    focus.current++;
                    tracker.track("option_focus", screen.round, { position: o.position });
                  }
                }}
                className={`card flex flex-col items-center gap-1 p-4 text-center transition-colors ${isSel ? "!border-ink ring-2 ring-ink" : "hover:border-ink/40"}`}
              >
                <span className="text-5xl" aria-hidden>
                  {o.snack.emoji}
                </span>
                <span className="mt-1 font-semibold leading-tight">{o.snack.name}</span>
                {health ? (
                  <span className="text-sm font-semibold text-leaf">💪 {o.snack.proteinG}g protein</span>
                ) : (
                  <span className="text-sm font-semibold text-berry">😋 {o.snack.tasteCue}</span>
                )}
                <span className="text-xs text-muted">{health ? o.snack.tasteCue : `${o.snack.proteinG}g protein`}</span>
                <span className="mt-1 font-display text-2xl font-bold">₹{o.price}</span>
              </motion.button>
            );
          })}
          <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink font-display text-sm font-extrabold text-white">
            VS
          </span>
        </div>
      )}

      <div className={`flex flex-col gap-3 ${duel ? "hidden" : ""}`} role="radiogroup" aria-label="Snack options">
        {!duel && screen.options.map((o, i) => {
          const isSel = selected === o.position;
          return (
            <motion.button
              key={screen.itemId + o.position}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              role="radio"
              aria-checked={isSel}
              onClick={() => select(o.position)}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") {
                  focus.current++;
                  tracker.track("option_focus", screen.round, { position: o.position });
                }
              }}
              onPointerDown={() => {
                pressing.current = o.position;
                touch();
              }}
              onPointerCancel={() => {
                if (pressing.current === o.position) {
                  cancels.current++;
                  tracker.track("tap_cancel", screen.round, { position: o.position });
                }
                pressing.current = null;
              }}
              className={`card flex items-center gap-4 p-4 text-left transition-colors ${isSel ? "!border-ink ring-2 ring-ink" : "hover:border-ink/40"}`}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-bg text-3xl" aria-hidden>
                {o.snack.emoji}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{o.snack.name}</span>
                {health ? (
                  <>
                    <span className="text-sm font-semibold text-leaf">💪 {o.snack.proteinG}g protein</span>
                    <span className="text-xs text-muted">{o.snack.tasteCue}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-berry">😋 {o.snack.tasteCue}</span>
                    <span className="text-xs text-muted">{o.snack.proteinG}g protein</span>
                  </>
                )}
              </span>
              <span className="font-display text-xl font-bold">₹{o.price}</span>
            </motion.button>
          );
        })}
      </div>

      <button className="btn btn-primary w-full" disabled={selected == null || busy} onClick={confirm}>
        {busy ? "…" : "Lock it in"}
      </button>
      <p className="text-center text-xs text-muted">No right answers. Pick what you&apos;d actually buy.</p>
    </div>
  );
}
