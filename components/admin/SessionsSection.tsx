"use client";
/**
 * Sessions tab: one row per play-through, so a person can find the sessions worth checking
 * (low quality and not yet reviewed) and open any one of them.
 */
import { useState } from "react";
import Link from "next/link";
import type { AdminData } from "@/lib/admin/aggregate";
import { DRIVER, REVIEW, SIGN, when } from "@/lib/scoring/plain";
import { BAND_COLOR } from "./charts";

type Row = AdminData["table"][number];

const BAND_SHORT: Record<string, string> = { green: "High", amber: "Medium", red: "Low" };
const TONE = { good: "bg-good/10 text-good", warn: "bg-warn/20 text-[#8a6200]", bad: "bg-bad/10 text-bad" } as const;

const FILTERS: { key: string; label: string; test: (r: Row) => boolean }[] = [
  { key: "review", label: "Needs review", test: (r) => r.band === "red" && !r.label },
  { key: "all", label: "All", test: () => true },
  { key: "green", label: "High quality", test: (r) => r.band === "green" },
  { key: "amber", label: "Medium quality", test: (r) => r.band === "amber" },
  { key: "red", label: "Low quality", test: (r) => r.band === "red" },
  { key: "quit", label: "Didn't finish", test: (r) => r.status !== "completed" },
];

export function SessionsSection({ data, studyId }: { data: AdminData; studyId: string }) {
  const [filter, setFilter] = useState("review");
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
  const rows = data.table.filter(f.test);

  return (
    <section className="card min-w-0 p-5">
      <h3 className="font-display text-lg font-bold">Every play-through, one row each</h3>
      <p className="mt-1 text-sm text-muted">
        Start with <span className="font-semibold text-ink">Needs review</span>: low quality sessions no person has checked yet. Open one to see why it scored low and save your
        decision.
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((x) => {
          const n = data.table.filter(x.test).length;
          return (
            <button key={x.key} onClick={() => setFilter(x.key)} className={`rounded-full px-3 py-1 ${filter === x.key ? "bg-ink text-white" : "border border-line hover:bg-bg"}`}>
              {x.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm">✓ Nothing here. {filter === "review" ? "Every low quality session has been checked." : ""}</p>
      ) : (
        <div className="mt-3 max-h-[640px] overflow-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr>
                <th className="py-2">Player</th>
                <th>Quality</th>
                <th>Main warning signs</th>
                <th>Snack personality</th>
                <th>Review</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{when(r.started)}</div>
                    <div className="text-xs text-muted">{r.segment}</div>
                  </td>
                  <td className="pr-3">
                    {r.band ? (
                      <span className="whitespace-nowrap font-semibold">
                        <span style={{ color: BAND_COLOR[r.band] }}>●</span> {BAND_SHORT[r.band]} · {r.quality}
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-muted">Didn&apos;t finish</span>
                    )}
                  </td>
                  <td className="pr-3">
                    {r.status !== "completed" ? (
                      <span className="text-muted">Quit at {r.quitAt ?? "the start"}</span>
                    ) : r.signs.length ? (
                      <>
                        {r.signs
                          .slice(0, 2)
                          .map((k) => SIGN[k]?.name ?? k)
                          .join(", ")}
                        {r.signs.length > 2 && <span className="text-muted"> +{r.signs.length - 2} more</span>}
                      </>
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap pr-3">{r.driver ? `${DRIVER[r.driver].emoji} ${DRIVER[r.driver].title}` : <span className="text-muted">–</span>}</td>
                  <td className="pr-3">
                    {r.label ? (
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[REVIEW[r.label]?.tone ?? "warn"]}`}>
                        {REVIEW[r.label]?.name ?? r.label}
                      </span>
                    ) : r.band === "red" ? (
                      <span className="whitespace-nowrap text-xs font-semibold text-bad">Waiting</span>
                    ) : (
                      <span className="text-xs text-muted">Not needed</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link href={`/admin/${studyId}/session/${r.id}`} className="whitespace-nowrap font-semibold underline">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
