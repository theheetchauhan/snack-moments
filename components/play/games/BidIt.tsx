"use client";
import { useRef, useState } from "react";
import type { Tracker } from "@/lib/events/tracker";
import type { Screen } from "../types";

type BidScreen = Extract<Screen, { kind: "bid" }>;

/**
 * Bid It: a Becker–DeGroot–Marschak auction. Set the most you'd pay; a random shop price is
 * drawn. If it's at or below your max, you buy at THAT price. Bidding your true value is the
 * best strategy, so this gives a direct willingness-to-pay to check against the model.
 */
export function BidIt({ screen, tracker, onSubmit, busy }: { screen: BidScreen; tracker: Tracker; onSubmit: (r: { bids: { momentId: string; bid: number; ms: number; adjustments: number }[] }) => void; busy: boolean }) {
  const [i, setI] = useState(0);
  const [bid, setBid] = useState(40);
  const [touched, setTouched] = useState(false);
  const adjustments = useRef(0);
  const shown = useRef(performance.now());
  const bids = useRef<{ momentId: string; bid: number; ms: number; adjustments: number }[]>([]);
  const r = screen.rounds[i];

  const lock = () => {
    bids.current.push({ momentId: r.momentId, bid, ms: performance.now() - shown.current, adjustments: adjustments.current });
    tracker.track("bid_locked", null, { momentId: r.momentId, bid });
    if (i + 1 < screen.rounds.length) {
      setI(i + 1);
      setBid(40);
      setTouched(false);
      adjustments.current = 0;
      shown.current = performance.now();
    } else onSubmit({ bids: bids.current });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">
          Game · Bid it 🔨 · {i + 1} of {screen.rounds.length}
        </p>
        <h2 className="font-display text-xl font-bold">
          {r.moment.emoji} {r.moment.label}
        </h2>
        <p className="mt-1 text-muted">{r.moment.scene}</p>
      </div>
      <div className="card flex flex-col items-center p-5 text-center">
        <span className="text-6xl" aria-hidden>
          {r.snack.emoji}
        </span>
        <p className="mt-2 font-display text-lg font-bold">{r.snack.name}</p>
        <p className="text-sm text-muted">
          {r.snack.proteinG}g protein · {r.snack.tasteCue}
        </p>
        <p className="mt-4 text-sm font-semibold">What&apos;s the most you&apos;d pay for it right now?</p>
        <div className="mt-2 font-display text-5xl font-extrabold">₹{bid}</div>
        <input
          type="range"
          min={0}
          max={r.maxBid}
          step={5}
          value={bid}
          aria-label="Your maximum price"
          className="mt-3 w-full"
          onChange={(e) => {
            setBid(Number(e.target.value));
            setTouched(true);
          }}
          onPointerUp={() => adjustments.current++}
        />
        <div className="flex w-full justify-between text-xs text-muted">
          <span>₹0</span>
          <span>₹{r.maxBid}</span>
        </div>
      </div>
      <div className="rounded-2xl bg-butter/40 p-4 text-sm">
        <b>How it works:</b> after you bid, a random shop price is drawn. If it&apos;s at or below your max, you buy it at that price with your {screen.coins} coins. If
        not, you keep your coins. <b>Your best move is to bid exactly what it&apos;s worth to you.</b> Coins you keep become points.
      </div>
      <button className="btn btn-primary w-full" disabled={!touched || busy} onClick={lock}>
        Lock my bid
      </button>
    </div>
  );
}
