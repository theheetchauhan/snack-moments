"use client";
import type { LiveQuality } from "./types";

const BAND = { green: "bg-good", amber: "bg-warn", red: "bg-bad" } as const;

/** Researcher view: shows the server-side quality score updating as you play (demo aid). */
export function ResearcherPanel({ live, info }: { live: LiveQuality | null; info: { reason?: string; converged?: number; framing?: string; round?: number } }) {
  return (
    <aside className="card p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Researcher view (live)</p>
      <div className="mt-2 flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${live ? BAND[live.band] : "bg-line"}`} />
        <span className="font-display text-2xl font-bold">{live ? live.score : "—"}</span>
        <span className="text-muted">quality</span>
        <span className="ml-auto text-muted" title="Adds up small warning signs (rushing, same spot, odd picks). At 1.6 a hidden check question is slipped in.">
          Suspicion meter {live?.cusum.toFixed(1) ?? "0.0"} / 1.6
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Why this item</dt>
        <dd>{info.reason ?? "—"}</dd>
        <dt className="text-muted">Model certainty</dt>
        <dd>{info.converged != null ? `${Math.round(info.converged * 100)}%` : "—"}</dd>
        <dt className="text-muted">Card wording</dt>
        <dd>{info.framing === "health" ? "highlights protein" : info.framing === "taste" ? "highlights taste" : "—"}</dd>
      </dl>
      {live && live.signals.length > 0 && (
        <ul className="mt-3 list-disc pl-4 text-xs text-bad">
          {live.signals.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
