"use client";
import { useEffect, useRef, useState } from "react";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type LabelScreen = Extract<Screen, { kind: "label" }>;

/**
 * Label Detective (memory challenge). Runs FIRST, before anything mentions protein, so it
 * measures what people notice on a pack unprompted. A short peek is fine here: the construct is
 * attention/recall, not preference, so timing doesn't distort what we measure.
 */
export function LabelDetective({ screen, tracker, onSubmit, busy }: { screen: LabelScreen; tracker: Tracker; onSubmit: (r: { answers: { value: number; ms: number }[]; peekMs: number }) => void; busy: boolean }) {
  const [phase, setPhase] = useState<"ready" | "peek" | "ask">("ready");
  const [left, setLeft] = useState(screen.peekMs);
  const [qi, setQi] = useState(0);
  const answers = useRef<{ value: number; ms: number }[]>([]);
  const qShown = useRef(0);
  const peekStart = useRef(0);
  const peekMs = useRef(0);

  useEffect(() => {
    if (phase !== "peek") return;
    peekStart.current = performance.now();
    const id = setInterval(() => {
      const rem = screen.peekMs - (performance.now() - peekStart.current);
      setLeft(Math.max(0, rem));
      if (rem <= 0) {
        clearInterval(id);
        peekMs.current = performance.now() - peekStart.current;
        setPhase("ask");
        qShown.current = performance.now();
        tracker.track("label_peek_end");
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase, screen.peekMs, tracker]);

  const answer = (v: number) => {
    answers.current.push({ value: v, ms: performance.now() - qShown.current });
    tracker.track("label_answer", null, { q: qi, value: v });
    if (qi + 1 < screen.questions.length) {
      setQi(qi + 1);
      qShown.current = performance.now();
    } else onSubmit({ answers: answers.current, peekMs: peekMs.current });
  };

  const q = screen.questions[qi];
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Warm-up · Label detective 🔎</p>
        {phase === "ready" && (
          <>
            <h2 className="font-display text-xl font-bold">You&apos;re at a shop shelf.</h2>
            <p className="mt-1 text-muted">You&apos;ll see 3 snack packs for {screen.peekMs / 1000} seconds. Look at them the way you normally would. Then we&apos;ll ask what you remember.</p>
          </>
        )}
        {phase === "peek" && (
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Look closely…</h2>
            <span className="font-display text-2xl font-extrabold text-accent">{Math.ceil(left / 1000)}</span>
          </div>
        )}
        {phase === "ask" && (
          <>
            <p className="text-sm text-muted">
              Question {qi + 1} of {screen.questions.length}
            </p>
            <h2 className="font-display text-xl font-bold">{q.prompt}</h2>
          </>
        )}
      </div>

      {phase === "peek" && (
        <div className="grid grid-cols-3 gap-2">
          {screen.packs.map((p) => (
            <div key={p.snack.id} className="card flex flex-col items-center p-3 text-center">
              <span className="text-4xl" aria-hidden>
                {p.snack.emoji}
              </span>
              <p className="mt-1 text-sm font-semibold leading-tight">{p.snack.name}</p>
              <p className="mt-1 font-display text-lg font-bold">₹{p.price}</p>
              <div className="mt-1 w-full rounded-lg bg-bg p-1 text-[10px] leading-snug text-muted">
                <div>Protein {p.snack.proteinG}g</div>
                <div>Sugar {p.snack.sugarG}g</div>
                <div>{p.snack.kcal} kcal</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === "ready" && (
        <button
          className="btn btn-primary w-full"
          onClick={() => {
            setPhase("peek");
            tracker.track("label_peek_start");
          }}
        >
          Show me the shelf
        </button>
      )}
      {phase === "ask" && (
        <div className="grid grid-cols-2 gap-2">
          {q.options.map((o) => (
            <button key={o} disabled={busy} onClick={() => answer(o)} className="card py-5 font-display text-2xl font-bold hover:border-ink">
              {q.unit === "₹" ? `₹${o}` : `${o}g`}
            </button>
          ))}
          <p className="col-span-2 text-center text-xs text-muted">Not sure? Just go with your best guess.</p>
        </div>
      )}
    </div>
  );
}
