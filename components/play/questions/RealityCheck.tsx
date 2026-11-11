"use client";
import { useRef, useState } from "react";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type RealityScreen = Extract<Screen, { kind: "reality" }>;

/**
 * Reality check: "What snack did you last actually buy?" plus an optional one-line why.
 * Anchors the game choices to a real purchase. The typed text is checked for paste / low effort.
 */
export function RealityCheck({ screen, tracker, onSubmit, busy }: { screen: RealityScreen; tracker: Tracker; onSubmit: (r: { category: string; why: string; typingMs: number; pasted: boolean; backspaces: number }) => void; busy: boolean }) {
  const [cat, setCat] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const firstKey = useRef<number | null>(null);
  const lastKey = useRef<number | null>(null);
  const pasted = useRef(false);
  const backspaces = useRef(0);
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Reality check</p>
        <h2 className="font-display text-xl font-bold">What was the last snack you actually bought?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {screen.categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`rounded-full border px-3 py-2 text-sm ${cat === c ? "border-ink bg-ink text-white" : "border-line bg-surface"}`}>
              {c}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-semibold" htmlFor="why">
          Why that one? <span className="font-normal text-muted">(optional, one line)</span>
        </label>
        <input
          id="why"
          className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-3"
          maxLength={200}
          value={why}
          placeholder="e.g. it was on offer"
          onChange={(e) => setWhy(e.target.value)}
          onKeyDown={(e) => {
            const t = performance.now();
            if (firstKey.current == null) firstKey.current = t;
            lastKey.current = t;
            if (e.key === "Backspace") backspaces.current++;
          }}
          onPaste={() => {
            pasted.current = true;
            tracker.track("text_paste", null, {});
          }}
        />
      </div>
      <button
        className="btn btn-primary w-full"
        disabled={!cat || busy}
        onClick={() =>
          onSubmit({
            category: cat!,
            why,
            typingMs: firstKey.current && lastKey.current ? Math.round(lastKey.current - firstKey.current) : 0,
            pasted: pasted.current,
            backspaces: backspaces.current,
          })
        }
      >
        Next
      </button>
    </div>
  );
}
