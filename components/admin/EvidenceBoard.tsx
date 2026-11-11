"use client";
/**
 * Evidence board: the statements the study set out to check, and whether the data proves them yet.
 * The verdict comes only from the statistics (95% certainty), never from AI.
 * Used on the admin dashboard and on the brand page.
 */
import type { Hypothesis } from "@/lib/insights/evidence";
import { CertaintyStrip, KeyNumber } from "./charts";

const STATUS = {
  supported: { label: "✓ Proven", cls: "bg-good/15 text-[#0a6e0a]" },
  contradicted: { label: "✕ Disproven", cls: "bg-bad/15 text-[#a32a2a]" },
  open: { label: "○ Not proven yet", cls: "bg-line text-muted" },
} as const;

export function EvidenceBoard({ hypotheses, narrative }: { hypotheses: Hypothesis[]; narrative?: string | null }) {
  const count = (s: Hypothesis["status"]) => hypotheses.filter((h) => h.status === s).length;
  const total = hypotheses.length;
  return (
    <div className="grid gap-5">
      <section className="card p-5">
        <h3 className="font-display text-lg font-bold">What has the study found out so far?</h3>
        <p className="mt-1 text-sm text-muted">
          Before any data came in, we wrote down {total} statements about snackers that the study should check, for example &ldquo;{hypotheses[0]?.statement}&rdquo; Each one is
          tested against what players actually did. The numbers below count how many of the {total} statements the data has settled so far; each statement has its own card
          further down.
        </p>
      </section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber
          label="Statements proven"
          value={`${count("supported")} of ${total}`}
          explain="The data clearly backs these statements. We're 95% sure the result isn't luck, so a brand can act on them."
        />
        <KeyNumber
          label="Statements disproven"
          value={`${count("contradicted")} of ${total}`}
          explain="The data clearly shows the opposite of what the statement says. Just as useful: it stops a brand acting on a wrong belief."
        />
        <KeyNumber
          label="Not proven yet"
          value={`${count("open")} of ${total}`}
          explain="The data could still go either way. Each card says what would settle it: more players, or a better test."
        />
      </div>
      {narrative && <p className="card p-4 text-sm">{narrative}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        {hypotheses.map((h, i) => {
          const positive = h.direction !== "negative";
          const n = h.ci.n;
          return (
            <section key={h.id} className="card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-bg px-1.5 py-0.5 text-xs text-muted">#{i + 1}</span>
                <h3 className="flex-1 font-display text-base font-bold leading-snug">{h.statement}</h3>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[h.status].cls}`}>{STATUS[h.status].label}</span>
              </div>
              <p className="mt-2 text-sm text-muted">
                <span className="font-semibold text-ink">How we check: </span>
                {h.test}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold">Result: </span>
                {Number.isFinite(h.ci.estimate) ? (
                  <>
                    {h.ci.estimate > 0 ? "+" : ""}
                    {h.ci.estimate.toFixed(1)} {h.unit}
                    <span className="text-muted"> · based on {n} players</span>
                  </>
                ) : (
                  <span className="text-muted">not enough data yet</span>
                )}
              </p>
              {Number.isFinite(h.ci.estimate) && (
                <div className="mt-3">
                  <CertaintyStrip
                    est={h.ci.estimate}
                    lo={h.ci.lo}
                    hi={h.ci.hi}
                    left={positive ? "Goes against it" : "Supports it"}
                    right={positive ? "Supports it" : "Goes against it"}
                    clear={h.status !== "open"}
                  />
                </div>
              )}
              <p className="mt-3 flex-1 rounded-xl bg-bg px-3 py-2 text-sm">
                <span className="font-semibold">What to test next: </span>
                {h.nextExperiment}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
