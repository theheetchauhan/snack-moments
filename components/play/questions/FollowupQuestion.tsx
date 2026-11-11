"use client";
import type { Screen } from "../types";

type FollowupScreen = Extract<Screen, { kind: "followup" }>;

/**
 * One diagnostic follow-up about this player's biggest contradiction
 * (e.g. "You rated protein 5/5 but mostly picked cheaper snacks. What usually decides it?").
 */
export function FollowupQuestion({ screen, onSubmit, busy }: { screen: FollowupScreen; onSubmit: (a: string) => void; busy: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">We noticed something interesting 🔍</p>
        <h2 className="font-display text-lg font-bold">{screen.question}</h2>
        <p className="mt-1 text-sm text-muted">There&apos;s no wrong answer. This helps us understand, not judge.</p>
      </div>
      <div className="flex flex-col gap-2">
        {screen.options.map((o) => (
          <button key={o} disabled={busy} onClick={() => onSubmit(o)} className="card p-4 text-left hover:border-ink">
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
