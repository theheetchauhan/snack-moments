"use client";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type ShelfScreen = Extract<Screen, { kind: "shelf" }>;

export interface ShelfResult {
  basket: Record<string, number>;
  removed: { snackId: string; price: number; order: number }[];
  finalBasket: Record<string, number>;
  ms: number;
}

/**
 * Stock the Shelf: a second, independent measure of the same trade-off (money split across a week),
 * then a budget squeeze. What people CUT first under a tighter budget reveals staples vs "nice to haves".
 * Protein-snack prices are warm-started near this player's own indifference point from game 1.
 */
export function StockTheShelf({ screen, tracker, onSubmit, busy }: { screen: ShelfScreen; tracker: Tracker; onSubmit: (r: ShelfResult) => void; busy: boolean }) {
  const start = useRef(performance.now());
  const [phase, setPhase] = useState<"fill" | "squeeze">("fill");
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [filled, setFilled] = useState<Record<string, number>>({});
  const [removed, setRemoved] = useState<ShelfResult["removed"]>([]);
  const priceOf = useMemo(() => new Map(screen.items.map((i) => [i.snack.id, i.price])), [screen.items]);
  const spent = Object.entries(basket).reduce((s, [id, q]) => s + (priceOf.get(id) ?? 0) * q, 0);
  const budget = phase === "fill" ? screen.budget : screen.squeezeBudget;

  const add = (id: string) => {
    if (phase !== "fill" || spent + (priceOf.get(id) ?? 0) > budget) return;
    setBasket((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 }));
    tracker.track("shelf_add", null, { snackId: id });
  };
  const remove = (id: string) => {
    if (!basket[id]) return;
    setBasket((b) => ({ ...b, [id]: b[id] - 1 }));
    if (phase === "squeeze") {
      setRemoved((r) => [...r, { snackId: id, price: priceOf.get(id) ?? 0, order: r.length }]);
      tracker.track("squeeze_remove", null, { snackId: id });
    } else tracker.track("shelf_remove", null, { snackId: id });
  };

  const goSqueeze = () => {
    setFilled(basket);
    setPhase("squeeze");
    tracker.track("squeeze_start", null, { spent });
  };

  const done = () =>
    onSubmit({ basket: phase === "squeeze" ? filled : basket, removed, finalBasket: basket, ms: Math.round(performance.now() - start.current) });

  const canFinishFill = spent > screen.squeezeBudget; // need something to squeeze
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Game 2 · Stock the shelf</p>
        <AnimatePresence mode="wait">
          {phase === "fill" ? (
            <motion.div key="fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="font-display text-xl font-bold">You have ₹{screen.budget} for this week&apos;s snacks.</h2>
              <p className="mt-1 text-muted">Fill your shelf the way you really would. Spend at least ₹{screen.squeezeBudget + 5}.</p>
            </motion.div>
          ) : (
            <motion.div key="sq" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <h2 className="font-display text-xl font-bold text-berry">Budget squeeze! It&apos;s now ₹{screen.squeezeBudget}.</h2>
              <p className="mt-1 text-muted">Take things off the shelf until you&apos;re within budget. No rush.</p>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-bg">
          <motion.div
            className={`h-full ${spent > budget ? "bg-bad" : "bg-leaf"}`}
            animate={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-sm">
          <b>₹{spent}</b> <span className="text-muted">of ₹{budget}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {screen.items.map((it) => (
          <div key={it.snack.id} className="card flex items-center gap-3 p-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg text-2xl" aria-hidden>
              {it.snack.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{it.snack.name}</p>
              <p className="text-xs text-muted">
                ₹{it.price} · {it.snack.proteinG}g protein
              </p>
            </div>
            <button className="btn btn-ghost h-10 w-10 !p-0" aria-label={`Remove ${it.snack.name}`} onClick={() => remove(it.snack.id)} disabled={!basket[it.snack.id]}>
              −
            </button>
            <span className="w-6 text-center font-display text-lg font-bold">{basket[it.snack.id] ?? 0}</span>
            <button
              className="btn btn-ghost h-10 w-10 !p-0"
              aria-label={`Add ${it.snack.name}`}
              onClick={() => add(it.snack.id)}
              disabled={phase !== "fill" || spent + it.price > budget}
            >
              +
            </button>
          </div>
        ))}
      </div>

      {phase === "fill" ? (
        <button className="btn btn-primary w-full" disabled={!canFinishFill} onClick={goSqueeze}>
          My shelf is ready
        </button>
      ) : (
        <button className="btn btn-primary w-full" disabled={spent > budget || busy} onClick={done}>
          {spent > budget ? `Remove ₹${spent - budget} more` : "Done"}
        </button>
      )}
    </div>
  );
}
