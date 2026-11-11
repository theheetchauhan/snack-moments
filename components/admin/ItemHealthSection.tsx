"use client";
/**
 * Item health tab: Snack Moments has a bank of questions (a moment + 2 or 3 snacks at set prices).
 * This shows which questions are doing their job and which should be rewritten. Only high and medium
 * quality players count, so a question isn't blamed for careless players.
 */
import Link from "next/link";
import type { AdminData } from "@/lib/admin/aggregate";
import { KeyNumber, pct } from "./charts";

const TONE: Record<string, string> = {
  Useful: "bg-good/10 text-good",
  "Too few answers yet": "bg-line text-muted",
};

export function ItemHealthSection({ data }: { data: AdminData }) {
  const ih = data.itemHealth;
  const rewrites = ih.items.filter((i) => i.verdict.startsWith("Rewrite"));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber
          label="Questions in the bank"
          value={String(ih.bankSize)}
          explain="Different Snack Moments questions the game can ask. Each one is a moment plus 2 or 3 snacks at set prices; the game picks the most useful one for each player."
        />
        <KeyNumber
          label="Questions asked so far"
          value={pct(ih.exposureShare)}
          explain={`${ih.exposed} of ${ih.bankSize} questions have been asked at least once. The game deliberately spreads them out so every question gets tested.`}
        />
        <KeyNumber
          label="Questions to rewrite"
          value={String(ih.rewriteCount)}
          explain="Asked at least 5 times, but answers look random or are often rushed. These go to the Question Lab to be improved."
        />
      </div>

      <section className="card min-w-0 p-5">
        <h3 className="font-display text-lg font-bold">Which questions work, and which should be rewritten?</h3>
        <p className="mt-1 text-sm text-muted">
          <span className="font-semibold text-ink">How to read it: </span>one row per question (snacks and prices, with the moment). &ldquo;Picked protein&rdquo; is how often the
          high-protein snack won. A question needs rewriting when players&apos; answers look random (it doesn&apos;t tell their preferences apart) or when it is often rushed (too
          long or confusing). Questions to rewrite are listed first; only high and medium quality players count.
        </p>
        <div className="mt-3 max-h-[520px] overflow-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr>
                <th className="py-2">Question (snacks · prices)</th>
                <th>Moment</th>
                <th className="text-right">Times asked</th>
                <th className="text-right">Picked protein</th>
                <th className="text-right">Rushed</th>
                <th className="pl-4">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {ih.items.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="py-1.5 pr-2">{i.label}</td>
                  <td className="pr-2 text-muted">{i.moment}</td>
                  <td className="text-right tabular-nums">{i.shown}</td>
                  <td className="text-right tabular-nums">{i.proteinRate}%</td>
                  <td className="text-right tabular-nums">{i.rushedPct}%</td>
                  <td className="pl-4">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[i.verdict] ?? "bg-warn/20 text-[#8a6200]"}`}>
                      {i.verdict === "Useful" ? "✓ " : i.verdict.startsWith("Rewrite") ? "! " : ""}
                      {i.verdict}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 rounded-xl bg-bg px-3 py-2 text-sm">
          <span className="font-semibold">💡 What it says: </span>
          {rewrites.length ? (
            <>
              {ih.rewriteCount} question{ih.rewriteCount === 1 ? " needs" : "s need"} rewriting and {ih.usefulCount} are working well. Send the weak ones to the{" "}
              <Link href="/studio" className="font-semibold underline">
                Question Lab
              </Link>
              ; the improved versions go back into the bank and are tested again.
            </>
          ) : (
            <>All questions asked enough times are working well. The rest just need more answers before they can be judged.</>
          )}
        </p>
      </section>
    </div>
  );
}
