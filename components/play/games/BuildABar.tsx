"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Tracker } from "@/lib/events/tracker";
import { BAR_ATTRS, BAR_KEYS, barName, type BarAttrKey } from "@/lib/study/bar";
import type { Screen } from "../types";

type BarScreen = Extract<Screen, { kind: "bar" }>;

const zero = () => Object.fromEntries(BAR_KEYS.map((k) => [k, 0])) as Record<BarAttrKey, number>;

export interface BarResult {
  alloc: Record<string, number>;
  final: Record<string, number>;
  cutOrder: string[];
  moves: number;
  ms: number;
}

/**
 * Build-a-Bar: spend 10 recipe points on your ideal protein bar (you can't max everything),
 * then "costs went up" and 3 points must go. What you design shows stated priorities in a
 * forced trade-off; what you protect in the squeeze shows the real must-haves.
 */
export function BuildABar({ screen, tracker, onSubmit, busy }: { screen: BarScreen; tracker: Tracker; onSubmit: (r: BarResult) => void; busy: boolean }) {
  const start = useRef(performance.now());
  const moves = useRef(0);
  const [phase, setPhase] = useState<"build" | "squeeze">("build");
  const [lv, setLv] = useState<Record<BarAttrKey, number>>(zero);
  const [alloc, setAlloc] = useState<Record<BarAttrKey, number> | null>(null);
  const [cutOrder, setCutOrder] = useState<string[]>([]);
  const used = Object.values(lv).reduce((a, b) => a + b, 0);
  const target = phase === "build" ? screen.budget : screen.squeeze;
  const left = target - used;

  const change = (k: BarAttrKey, d: 1 | -1) => {
    const next = lv[k] + d;
    if (next < 0 || next > screen.maxLevel) return;
    if (d === 1 && (phase === "squeeze" || left <= 0)) return;
    if (phase === "squeeze" && d === -1 && used <= screen.squeeze) return;
    moves.current++;
    setLv((x) => ({ ...x, [k]: next }));
    if (phase === "squeeze") {
      setCutOrder((c) => [...c, k]);
      tracker.track("bar_cut", null, { attr: k });
    } else tracker.track("bar_set", null, { attr: k, level: next });
  };

  const level = (k: BarAttrKey) => BAR_ATTRS.find((a) => a.key === k)!.levels[lv[k]];
  const name = barName(lv);

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Game · Build-a-bar 🧪</p>
        <AnimatePresence mode="wait">
          {phase === "build" ? (
            <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="font-display text-xl font-bold">Invent your perfect snack bar</h2>
              <p className="mt-1 text-muted">You have {screen.budget} recipe points. You can&apos;t max everything, so spend them on what you&apos;d really want.</p>
            </motion.div>
          ) : (
            <motion.div key="s" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <h2 className="font-display text-xl font-bold">Uh-oh, costs went up! 📉</h2>
              <p className="mt-1 text-muted">
                Remove {screen.budget - screen.squeeze} points. Keep what you&apos;d never give up.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* live preview of the bar */}
      <div className="card flex flex-col items-center gap-3 p-5" aria-live="polite">
        <motion.div
          layout
          className="flex h-16 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-inner"
          style={{
            width: `${45 + lv.size * 12}%`,
            background: `linear-gradient(135deg, hsl(25 ${35 + lv.taste * 12}% ${38 - lv.taste * 3}%), hsl(18 ${40 + lv.taste * 10}% ${26 - lv.taste * 2}%))`,
          }}
        >
          {name}
        </motion.div>
        <div className="flex flex-wrap justify-center gap-1.5 text-xs">
          <span className="rounded-full bg-leaf/20 px-2 py-0.5 font-semibold">💪 {level("protein")} protein</span>
          <span className="rounded-full bg-berry/15 px-2 py-0.5">🍬 {level("lowSugar")}</span>
          <span className="rounded-full bg-butter/60 px-2 py-0.5">😋 {level("taste")}</span>
          <span className="rounded-full bg-line px-2 py-0.5">{level("lowPrice")}</span>
          <span className="rounded-full bg-line px-2 py-0.5">📏 {level("size")}</span>
        </div>
      </div>

      <div className="card divide-y divide-line">
        {BAR_ATTRS.map((a) => {
          const v = lv[a.key];
          const canUp = phase === "build" && left > 0 && v < screen.maxLevel;
          const canDown = v > 0 && (phase === "build" || used > screen.squeeze);
          return (
            <div key={a.key} className="flex items-center gap-3 p-3">
              <span className="w-6 text-center text-lg" aria-hidden>
                {a.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.label}</p>
                <div className="mt-1 flex gap-1" aria-hidden>
                  {Array.from({ length: screen.maxLevel }, (_, i) => (
                    <span key={i} className={`h-2 flex-1 rounded-full ${i < v ? "bg-accent" : "bg-line"}`} />
                  ))}
                </div>
                <p className="mt-0.5 text-xs text-muted">{a.levels[v]}</p>
              </div>
              <button
                className="h-10 w-10 rounded-full border border-line text-lg disabled:opacity-30"
                disabled={!canDown || busy}
                onClick={() => change(a.key, -1)}
                aria-label={`Less ${a.label}`}
              >
                −
              </button>
              <button
                className="h-10 w-10 rounded-full border border-line text-lg disabled:opacity-30"
                disabled={!canUp || busy}
                onClick={() => change(a.key, 1)}
                aria-label={`More ${a.label}`}
              >
                +
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm font-semibold">
        {phase === "build" ? `${left} point${left === 1 ? "" : "s"} left to spend` : left < 0 ? `Remove ${-left} more point${left === -1 ? "" : "s"}` : "Squeeze done ✓"}
      </p>

      {phase === "build" ? (
        <button
          className="btn btn-primary w-full"
          disabled={left !== 0 || busy}
          onClick={() => {
            setAlloc({ ...lv });
            setPhase("squeeze");
            tracker.track("bar_squeeze_start", null, { alloc: lv });
          }}
        >
          Lock my recipe
        </button>
      ) : (
        <button
          className="btn btn-accent w-full"
          disabled={left !== 0 || busy}
          onClick={() => onSubmit({ alloc: alloc!, final: lv, cutOrder, moves: moves.current, ms: Math.round(performance.now() - start.current) })}
        >
          Launch my bar 🚀
        </button>
      )}
    </div>
  );
}
