"use client";

/**
 * The original survey question (1–5), asked LAST so it cannot influence the games.
 * Comparing this rating with the player's choices gives the say–do gap.
 */
export function StatedRating({ question, onSubmit, busy }: { question: string; onSubmit: (v: number) => void; busy: boolean }) {
  const labels = ["Not at all", "A little", "Somewhat", "Very", "Extremely"];
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-wider text-muted">Last one: the classic survey question</p>
        <h2 className="font-display text-xl font-bold">{question}?</h2>
        <p className="mt-1 text-sm text-muted">We ask this last on purpose, so it can&apos;t influence your choices.</p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} disabled={busy} onClick={() => onSubmit(v)} className="card flex flex-col items-center gap-1 px-1 py-4 hover:border-ink">
            <span className="font-display text-2xl font-extrabold">{v}</span>
            <span className="text-center text-[10px] leading-tight text-muted">{labels[v - 1]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
