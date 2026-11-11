"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type PeekScreen = Extract<Screen, { kind: "peek" }>;

const ATTR_LABEL: Record<string, { label: string; emoji: string }> = {
  price: { label: "Price", emoji: "₹" },
  protein: { label: "Protein", emoji: "💪" },
  taste: { label: "Taste", emoji: "😋" },
  sugar: { label: "Sugar", emoji: "🍬" },
};

/**
 * Peek & Pick: attributes are hidden; you get 4 peeks before choosing. What you look at
 * FIRST (and whether you ever check protein) reveals real attention priorities.
 * Hidden values live on the server and are only revealed when a peek is spent.
 */
export function PeekAndPick({
  screen,
  tracker,
  reveal,
  onSubmit,
  busy,
}: {
  screen: PeekScreen;
  tracker: Tracker;
  reveal: (snackId: string, attr: string) => Promise<{ value: string; left: number } | null>;
  onSubmit: (r: { choice: string; ms: number }) => void;
  busy: boolean;
}) {
  const start = useRef(performance.now());
  const [cells, setCells] = useState<Record<string, string>>({});
  const [left, setLeft] = useState(screen.maxPeeks);
  const [choice, setChoice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const peek = async (snackId: string, attr: string) => {
    const key = snackId + ":" + attr;
    if (cells[key] || left <= 0 || pending) return;
    setPending(key);
    const r = await reveal(snackId, attr);
    setPending(null);
    if (!r) return;
    setCells((c) => ({ ...c, [key]: r.value }));
    setLeft(r.left);
    tracker.track("peek_reveal", null, { snackId, attr });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Game · Peek &amp; pick 👀</p>
        <h2 className="font-display text-xl font-bold">
          {screen.moment.emoji} {screen.moment.label}: the details are hidden.
        </h2>
        <p className="mt-1 text-muted">
          Tap boxes to peek at what matters to you. You have <b className="text-ink">{left}</b> peek{left === 1 ? "" : "s"} left, then pick one.
        </p>
      </div>
      <div className="card overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `72px repeat(${screen.snacks.length}, minmax(0,1fr))` }}>
          <div className="border-b border-line bg-bg" />
          {screen.snacks.map((sn) => (
            <button
              key={sn.id}
              onClick={() => setChoice(sn.id)}
              className={`border-b border-l border-line p-2 text-center ${choice === sn.id ? "bg-ink text-white" : "bg-bg"}`}
              aria-pressed={choice === sn.id}
            >
              <div className="text-2xl" aria-hidden>
                {sn.emoji}
              </div>
              <div className="text-[11px] font-semibold leading-tight">{sn.name}</div>
            </button>
          ))}
          {screen.attrs.map((attr) => (
            <div key={attr} className="contents">
              <div className="flex items-center gap-1 border-b border-line px-2 text-xs font-semibold text-muted">
                <span aria-hidden>{ATTR_LABEL[attr].emoji}</span> {ATTR_LABEL[attr].label}
              </div>
              {screen.snacks.map((sn) => {
                const key = sn.id + ":" + attr;
                const v = cells[key];
                return (
                  <button
                    key={key}
                    disabled={!!v || left <= 0 || busy}
                    onClick={() => peek(sn.id, attr)}
                    className="flex min-h-14 items-center justify-center border-b border-l border-line p-1 text-center text-xs"
                    aria-label={v ? `${ATTR_LABEL[attr].label}: ${v}` : `Peek at ${ATTR_LABEL[attr].label} of ${sn.name}`}
                  >
                    <AnimatePresence mode="wait">
                      {v ? (
                        <motion.span key="v" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} className="font-semibold">
                          {v}
                        </motion.span>
                      ) : (
                        <motion.span key="h" className={`flex h-9 w-full items-center justify-center rounded-lg ${left > 0 ? "bg-butter/60" : "bg-line/60"} text-lg`}>
                          {pending === key ? "…" : "?"}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-muted">Tap a snack&apos;s name to pick it.</p>
      <button className="btn btn-primary w-full" disabled={!choice || busy} onClick={() => onSubmit({ choice: choice!, ms: performance.now() - start.current })}>
        {choice ? "I'll take this one" : "Pick a snack"}
      </button>
    </div>
  );
}
