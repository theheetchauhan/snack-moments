"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { REVIEW } from "@/lib/scoring/plain";

/**
 * A person's decision on a session. Saved with the session and collected to improve the automatic
 * score later; it doesn't change today's numbers.
 */
const CHOICES = [
  { key: "approve", icon: "✓", hint: "answers look genuine" },
  { key: "downweight", icon: "▼", hint: "some real answers, some careless" },
  { key: "exclude", icon: "✕", hint: "a bot, a repeat player or random taps" },
] as const;

export function SessionActions({ sessionId, labels }: { sessionId: string; labels: { label: string; at: number }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const latest = [...labels].sort((a, b) => b.at - a.at)[0];

  const label = async (l: string) => {
    setBusy(l);
    await fetch(`/api/admin/sessions/${sessionId}/label`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: l }) });
    setBusy(null);
    router.refresh();
  };
  const explain = async () => {
    setBusy("ai");
    const r = await fetch(`/api/ai/explain/${sessionId}`, { method: "POST" });
    const j = await r.json();
    setAi(j.explanation ?? j.error ?? "No explanation");
    setBusy(null);
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-sm font-semibold">
        Your decision{latest ? <span className="font-normal text-muted">: saved as &ldquo;{REVIEW[latest.label]?.name ?? latest.label}&rdquo;</span> : null}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {CHOICES.map((c) => (
          <button
            key={c.key}
            disabled={!!busy}
            onClick={() => label(c.key)}
            className={`rounded-xl border px-3 py-2 text-left text-sm ${latest?.label === c.key ? "border-ink bg-ink text-white" : "border-line hover:bg-bg"}`}
          >
            <span className="font-semibold">
              {c.icon} {REVIEW[c.key].name}
            </span>
            <span className={`block text-xs ${latest?.label === c.key ? "opacity-80" : "text-muted"}`}>{c.hint}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Decisions are saved to improve the automatic score later. They don&apos;t change today&apos;s numbers.</p>
        <button disabled={!!busy} onClick={explain} className="rounded-lg border border-line px-3 py-1.5 text-xs">
          {busy === "ai" ? "Asking AI…" : "✨ Explain this session with AI"}
        </button>
      </div>
      {ai && <p className="mt-2 rounded-xl bg-bg p-3 text-sm">{ai}</p>}
    </div>
  );
}
