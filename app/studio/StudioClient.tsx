"use client";
/**
 * Question Lab: the AI question engine, laid out as the five steps of Part A.
 * 1 Understand & transform · 2 Bias check · 3 Pick the format · 4 Gamify without changing the
 * measurement · 5 Validate before launch — then the prototype card, and the learning loop.
 */
import { useState } from "react";
import Link from "next/link";
import type { StudioEvent, StudioResult, StudioRound } from "@/lib/ai/studio";
import { RUBRIC, type Critique } from "@/lib/studio/rules";
import { CHECK_NAME, FORMAT_FAMILY } from "@/lib/studio/contract";
import { FORMATS } from "@/lib/registry/formats";
import { GamePreview } from "@/components/studio/GamePreview";
import { isLiveCase, liveMatch } from "@/lib/studio/liveMatch";

type QueueItem = { itemId: string; label: string; moment: string; verdict: string; shown: number; proteinRate: number | null; rushedPct: number | null };
type Models = { writer: string; critic: string; fast: string };

const EXAMPLES = [
  {
    name: "🥤 Energy drink (brief only)",
    question: "",
    decision: "Should we launch a sugar-free energy drink at ₹60, and who should we target first?",
  },
  {
    name: "🍫 Protein snacks (live case)",
    question: "When choosing a snack, how important is protein content to you? (1–5)",
    decision: "Should Macros lead with protein on the pack, and how much extra can protein charge?",
  },
  {
    name: "♻️ Eco packaging",
    question: "How likely are you to choose eco-friendly packaging, even if it costs more? (1–5)",
    decision: "Should we switch our detergent to compostable packaging at ₹10 extra?",
  },
  {
    name: "🛵 Food delivery",
    question: "How often do you order food delivery in a week?",
    decision: "Which time slots should our cloud kitchen staff up for?",
  },
  {
    name: "🧴 Skincare labels",
    question: "Do you agree: 'I always read the ingredient list before buying skincare'?",
    decision: "Should ingredient claims lead our skincare packaging?",
  },
  {
    name: "📺 Streaming plans",
    question: "Which do you prefer: an annual or a monthly streaming plan?",
    decision: "Should we push annual plans with a discount, and how big a discount?",
  },
];

const APPROACH: Record<string, string> = { behavioural: "Behavioural", indirect: "Indirect", psychometric: "Psychometric" };
const MEASURES: Record<string, string> = {
  attitude: "an attitude (how they feel about it)",
  intention: "an intention (what they say they'd do)",
  habit: "a habit (what they think they usually do)",
  belief: "a belief about themselves",
  preference: "a stated preference",
  knowledge: "knowledge",
};
const RUBRIC_LABEL: Record<string, string> = Object.fromEntries(RUBRIC.map((r) => [r.key, r.label]));
const tone = (risk: number) => (risk >= 7 ? "#d03b3b" : risk >= 4 ? "#fab219" : "#0ca30c");

interface Live {
  drafted?: NonNullable<StudioResult["drafted"]>;
  understanding?: StudioResult["understanding"];
  candidates?: StudioResult["candidates"];
  original?: { critique: Critique; score: number };
  rounds: StudioRound[];
  pilot?: StudioResult["pilot"];
  result?: StudioResult;
}

export default function StudioClient({ aiOn, queue }: { aiOn: boolean; models?: Models; queue: QueueItem[] }) {
  const [question, setQuestion] = useState(EXAMPLES[0].question);
  const [decision, setDecision] = useState(EXAMPLES[0].decision);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (q = question) => {
    setBusy(true);
    setErr(null);
    setLive({ rounds: [] });
    try {
      const r = await fetch("/api/studio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, decision }) });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? "The run failed.");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as StudioEvent;
          setLive((s) => apply(s ?? { rounds: [] }, e));
          if (e.stage === "error") setErr(e.data);
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const res = live?.result;

  return (
    <div className="theme-admin min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Snack Moments home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <span className="leading-tight">
              <span className="block font-display text-base font-extrabold">Question Lab</span>
              <span className="block text-xs text-muted">AI research engine</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-6">
        <section>
          <h1 className="font-display text-3xl font-extrabold">Bring a decision. Get a game that measures real behaviour.</h1>
          <p className="mt-2 max-w-3xl text-muted">
            The engine turns a survey question into a playable game that captures what people do, not what they say, and checks it before launch.
          </p>
        </section>

        <section className="card grid gap-3 p-5">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button
                key={x.name}
                onClick={() => {
                  setQuestion(x.question);
                  setDecision(x.decision);
                }}
                className={`rounded-full border px-3 py-1 text-sm ${question === x.question ? "border-ink bg-ink text-white" : "border-line hover:bg-bg"}`}
              >
                {x.name}
              </button>
            ))}
          </div>
          <label className="text-sm font-semibold">
            What do you need to decide?
            <input className="mt-1 w-full rounded-xl border border-line bg-bg p-3 font-normal" value={decision} onChange={(e) => setDecision(e.target.value)} />
          </label>
          <label className="text-sm font-semibold">
            Your survey question <span className="font-normal text-muted">(optional: leave empty and the engine drafts it from your decision)</span>
            <textarea
              className="mt-1 w-full rounded-xl border border-line bg-bg p-3 font-normal"
              rows={2}
              value={question}
              placeholder="e.g. How important is protein content to you? (1–5)"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={busy || (question.trim().length < 8 && decision.trim().length < 8)} onClick={() => run()}>
              {busy ? "Working…" : "▶ Run the engine"}
            </button>
            {err && <p className="text-sm text-bad">{err}</p>}
          </div>
          {live && <Progress live={live} busy={busy} />}
        </section>

        {res && <Result res={res} />}

        {live && (live.drafted || live.understanding) && (
          <section className="min-w-0">
            <h2 className="font-display text-xl font-bold">How the engine got here</h2>
            <p className="mt-1 text-sm text-muted">One line per step. Open any step to see the detail.</p>
            <div className="mt-3 grid gap-2">
              {live.drafted && (
                <Fold title="Drafted the question" line={`No question given, so it wrote 3 and picked: “${live.drafted.questions[live.drafted.chosen].question}”`}>
                  <DraftStep
                    drafted={live.drafted}
                    busy={busy}
                    onUse={(q) => {
                      setQuestion(q);
                      run(q);
                    }}
                  />
                </Fold>
              )}
              {live.understanding && (
                <Fold
                  title="Understood the decision"
                  line={`The question measures ${live.understanding.measuresNow}; the decision needs real behaviour: ${clip(live.understanding.needsBehaviour, 110)}`}
                >
                  <StepOne live={live} final={res} />
                </Fold>
              )}
              {live.original && (
                <Fold
                  title="Removed the bias"
                  line={
                    live.rounds.length
                      ? `Bias risk ${live.original.score} → ${bestScore(live.rounds)} ${live.rounds[0].by === "live" ? "(reused the live game's design)" : `after ${live.rounds.length} round${live.rounds.length === 1 ? "" : "s"} of writer vs critic`}`
                      : `Original bias risk ${live.original.score}/100; designing the game…`
                  }
                >
                  <StepTwo live={live} aiOn={aiOn} />
                </Fold>
              )}
              {res && (
                <Fold title="Chose the format" line={`${res.final.formatName}${res.liveStudy ? ", reused from the live study" : ""}: ${clip(res.final.spec.formatWhy, 110)}`}>
                  <StepThree res={res} />
                </Fold>
              )}
              {res && (
                <Fold title="Checked the measurement contract" line={contractLine(res)}>
                  <StepFour res={res} />
                </Fold>
              )}
              {live.pilot && (
                <Fold title="Piloted before launch" line={pilotLine(live.pilot)}>
                  <StepFive pilot={live.pilot} question={live.result?.question ?? question} />
                </Fold>
              )}
            </div>
            {res && res.fallbacks.length > 0 && (
              <p className="mt-2 text-xs text-muted">The rule-based version filled in: {res.fallbacks.join(", ")} (the AI step failed or timed out).</p>
            )}
          </section>
        )}

        <section className="grid gap-2">
          <h2 className="font-display text-xl font-bold">More</h2>
          {res && isLiveCase(res.question) && (
            <Fold title="Blueprint vs live game" line={`${liveMatch(res).matched}/${liveMatch(res).total} features of the live Snack Moments game are in the engine's design`}>
              <LiveBridge res={res} />
            </Fold>
          )}
          <Fold
            title="Live questions to fix"
            line={
              queue.length
                ? `${queue.length} weak live question${queue.length === 1 ? "" : "s"} flagged by real players, ready to rewrite with evidence`
                : "No live question needs rewriting right now"
            }
          >
            <Queue items={queue} />
          </Fold>
          <Fold title="Format library" line={`${FORMATS.length} game formats, each with what it can measure`}>
            <p className="mt-1 text-sm text-muted">Each format declares what it can measure. The engine may only pick a format that measures the behaviour the decision needs.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-2">Format</th>
                    <th>Measures</th>
                    <th>Timer</th>
                    <th>Built-in checks</th>
                  </tr>
                </thead>
                <tbody>
                  {FORMATS.map((f) => (
                    <tr key={f.id} className="border-t border-line align-top">
                      <td className="py-2 pr-3 font-semibold">{FORMAT_FAMILY[f.id] ?? f.name}</td>
                      <td className="pr-3">{f.measures.map((m) => m.replace(/_/g, " ")).join(", ")}</td>
                      <td className="pr-3">{f.timingValid ? "Allowed" : "Never"}</td>
                      <td className="text-muted">{f.probes.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Fold>
        </section>
      </main>
    </div>
  );
}

function apply(s: Live, e: StudioEvent): Live {
  switch (e.stage) {
    case "draft":
      return { ...s, drafted: e.data };
    case "understand":
      return { ...s, understanding: e.data };
    case "transform":
      return { ...s, candidates: e.data };
    case "critique_original":
      return { ...s, original: e.data };
    case "round":
      return { ...s, rounds: [...s.rounds, e.data] };
    case "pilot":
      return { ...s, pilot: e.data };
    case "done":
      return { ...s, result: e.data };
    default:
      return s;
  }
}

function Progress({ live, busy }: { live: Live; busy: boolean }) {
  const steps = [
    ...(live.drafted || !live.understanding ? [{ name: "Draft the question", done: !!live.drafted || !!live.understanding }] : []),
    { name: "Understand the decision", done: !!live.understanding },
    { name: "Write 3 redesigns", done: !!live.candidates },
    { name: "Review the original", done: !!live.original },
    ...live.rounds.map((r) => ({ name: r.by === "live" ? `Reused the live design: risk ${r.score}/100` : `Debate round ${r.round}: risk ${r.score}/100`, done: true })),
    ...(live.result ? [] : live.original ? [{ name: `Debate round ${live.rounds.length + 1}`, done: false }] : []),
    { name: "Pilot before launch", done: !!live.pilot },
  ];
  const firstOpen = steps.findIndex((x) => !x.done);
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((x, i) => (
        <li
          key={x.name}
          className={`rounded-full border px-2.5 py-1 ${x.done ? "border-good/40 bg-good/10 text-good" : i === firstOpen && busy ? "animate-pulse border-ink text-ink" : "border-line text-muted"}`}
        >
          {x.done ? "✓ " : i === firstOpen && busy ? "… " : ""}
          {x.name}
        </li>
      ))}
    </ol>
  );
}

function Step({ sub, children }: { n?: number; title?: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="max-w-3xl text-sm text-muted">{sub}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Fold({ title, line, children }: { title: string; line: string; children: React.ReactNode }) {
  return (
    <details className="card group min-w-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="mt-0.5 text-muted transition-transform group-open:rotate-90">▸</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted">{line}</span>
        </span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

const clip = (x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x);
const bestScore = (rounds: StudioRound[]) => Math.min(...rounds.map((r) => r.score));
function contractLine(res: StudioResult) {
  const c = res.final.contract;
  const fixed = c.filter((x) => x.status === "fixed");
  return `${c.length - fixed.length}/${c.length} rules passed${fixed.length ? `; ${fixed.length} fixed automatically (${fixed.map((x) => x.rule.toLowerCase()).join(", ")})` : ""}. ${res.final.spec.hiddenChecks.length} hidden checks in the game.`;
}
function pilotLine(p: StudioResult["pilot"]) {
  const caught = p.coverage.filter((c) => c.caughtBy).length;
  const shift = p.originalShiftRate != null && p.gameShiftRate != null ? `answers changed under pressure ${p.originalShiftRate}% → ${p.gameShiftRate}% · ` : "";
  return `${p.verdict === "Fit to launch" ? "✓ Fit to launch" : "! Needs work"} · ${shift}${caught}/${p.coverage.length} kinds of careless answering caught`;
}

function Result({ res }: { res: StudioResult }) {
  const c = res.final.contract;
  const fit = res.pilot.verdict === "Fit to launch";
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-surface px-3 py-1 font-semibold ring-1 ring-line">
          Bias risk {res.originalScore} → <span className="text-good">{res.final.score}</span>
        </span>
        <span className={`rounded-full px-3 py-1 font-semibold ${fit ? "bg-good text-white" : "bg-warn text-ink"}`}>{fit ? "✓ Fit to launch" : "! Needs work"}</span>
        <span className="rounded-full bg-surface px-3 py-1 font-semibold ring-1 ring-line">
          {c.length}/{c.length} contract rules met
        </span>
        {res.liveStudy && <span className="rounded-full bg-surface px-3 py-1 font-semibold ring-1 ring-line">✓ Matches the live game</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Prototype res={res} />
        <div>
          <GamePreview spec={res.final.spec} mechanic={res.final.mechanic} />
          <button
            onClick={() => {
              try {
                sessionStorage.setItem("lab-game", JSON.stringify({ spec: res.final.spec, mechanic: res.final.mechanic }));
              } catch {}
              window.open("/studio/play", "_blank");
            }}
            className="mx-auto mt-3 block rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-bg"
          >
            ⛶ Open as a full game
          </button>
        </div>
      </div>
    </section>
  );
}

function StepOne({ live, final }: { live: Live; final?: StudioResult }) {
  const u = live.understanding!;
  return (
    <Step
      n={1}
      title="Understand the decision, then transform the question"
      sub="Decision first: the engine works out what the brand must decide and what behaviour would answer it, before touching the wording."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Flow label="The decision" body={u.decision} />
        <Flow label="The question measures now" body={MEASURES[u.measuresNow] ?? u.measuresNow} note={u.whyGap} />
        <Flow label="It should measure" body={u.needsBehaviour} note={final ? `Best captured by: ${final.final.formatName}` : undefined} />
      </div>
      {live.candidates && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {live.candidates.map((c, i) => (
            <div key={i} className="card flex flex-col p-4">
              <span className="w-fit rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">{APPROACH[c.approach] ?? c.approach}</span>
              <p className="mt-2 text-sm font-semibold">{c.question}</p>
              <p className="mt-1 flex-1 text-sm text-muted">{c.why}</p>
              {c.removes.length > 0 && (
                <p className="mt-2 text-xs">
                  <span className="font-semibold">Removes: </span>
                  {c.removes.map((k) => RUBRIC_LABEL[k] ?? k).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Step>
  );
}

function Flow({ label, body, note }: { label: string; body: string; note?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-semibold">{body}</p>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
    </div>
  );
}

function StepTwo({ live, aiOn }: { live: Live; aiOn: boolean }) {
  const o = live.original!;
  const last = live.rounds.length ? live.rounds.reduce((a, b) => (b.score < a.score ? b : a), live.rounds[0]) : null;
  const finalBy = new Map(last?.critique.scores.map((s) => [s.key, s]) ?? []);
  const points = [
    { name: "Original", score: o.score, by: "" },
    ...live.rounds.map((r) => ({ name: r.by === "live" ? "Live game" : `Round ${r.round}`, score: r.score, by: r.by })),
  ];
  return (
    <Step
      n={2}
      title="Bias check: before vs after"
      sub={
        aiOn
          ? "A writer AI designs the game; an independent critic from a different AI family scores 11 risks, including predictable answering patterns. They go back and forth until the risk is low."
          : "11 risks, including predictable answering patterns, scored for the original and the game. Rules mode: transparent heuristics play the writer and the critic; with an AI key, two different AI models debate instead."
      }
    >
      <div className="card p-5">
        <p className="text-sm font-semibold">Bias risk score (0 = clean, 100 = every risk at its worst)</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          {points.map((p) => (
            <div key={p.name} className="flex flex-col items-center gap-1">
              <span className="text-sm font-bold tabular-nums">{p.score}</span>
              <div className="flex h-28 w-14 items-end rounded-lg bg-line/50">
                <div className="w-14 rounded-lg" style={{ height: `${Math.max(4, p.score)}%`, background: p.score > 50 ? "#d03b3b" : p.score > 25 ? "#fab219" : "#0ca30c" }} />
              </div>
              <span className="text-xs text-muted">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card mt-3 min-w-0 p-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2">Risk</th>
                <th>Original</th>
                <th>Game</th>
                <th>Why (game)</th>
              </tr>
            </thead>
            <tbody>
              {(["bias", "pattern"] as const).map((group) => (
                <RiskGroup key={group} group={group} original={o.critique} finalBy={finalBy} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Step>
  );
}

function RiskGroup({ group, original, finalBy }: { group: "bias" | "pattern"; original: Critique; finalBy: Map<string, { risk: number; reason: string }> }) {
  const ob = new Map(original.scores.map((s) => [s.key, s]));
  return (
    <>
      <tr>
        <td colSpan={4} className="pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted">
          {group === "bias" ? "Bias in the question" : "Predictable answering patterns"}
        </td>
      </tr>
      {RUBRIC.filter((r) => r.group === group).map((r) => {
        const a = ob.get(r.key);
        const b = finalBy.get(r.key);
        return (
          <tr key={r.key} className="border-t border-line align-top">
            <td className="py-2 pr-3 font-medium" title={r.help}>
              {r.label}
            </td>
            <td className="w-28 pr-3">
              <RiskBar v={a?.risk} />
            </td>
            <td className="w-28 pr-3">
              <RiskBar v={b?.risk} />
            </td>
            <td className="text-muted">{b?.reason ?? "…"}</td>
          </tr>
        );
      })}
    </>
  );
}

function RiskBar({ v }: { v?: number }) {
  if (v == null) return <span className="text-xs text-muted">…</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-16 rounded bg-line">
        <div className="h-2.5 rounded" style={{ width: `${v * 10}%`, background: tone(v) }} />
      </div>
      <span className="text-xs tabular-nums">{v}</span>
    </div>
  );
}

function StepThree({ res }: { res: StudioResult }) {
  return (
    <Step
      n={3}
      title="Pick the format that can measure it"
      sub="Formats are chosen for what they measure, not for how fun they look. The engine may only use a format built for this kind of behaviour."
    >
      {res.liveStudy && (
        <div className="card mb-3 flex flex-wrap items-center gap-3 border-good p-4">
          <span className="rounded-full bg-good px-3 py-1 text-sm font-bold text-white">✓ Matched a live study</span>
          <span className="flex-1 text-sm text-muted">
            This question is already answered by the live <b className="text-ink">{res.liveStudy.name}</b> game, so the engine reused its proven design exactly (same moments, same
            cards and prices from the live question bank, same hidden checks) instead of inventing a new one. The critic still reviews it.
          </span>
          <Link href={res.liveStudy.playHref} className="text-sm font-semibold underline">
            Play it →
          </Link>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-[2fr_3fr]">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Chosen</p>
          <p className="mt-1 font-display text-xl font-bold">{res.final.formatName}</p>
          <p className="mt-2 text-sm text-muted">{res.final.spec.formatWhy}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Considered</p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {res.final.otherFormats.map((f) => (
              <li key={f.name}>
                <span className={f.fits ? "text-good" : "text-muted"}>{f.fits ? "◐" : "✕"}</span> <span className="font-semibold">{f.name}:</span>{" "}
                <span className="text-muted">{f.why}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Step>
  );
}

function StepFour({ res }: { res: StudioResult }) {
  const c = res.final.contract;
  const fixed = c.filter((x) => x.status === "fixed").length;
  return (
    <Step
      n={4}
      title="Gamify it without changing what it measures"
      sub="The AI designs the game; a measurement contract written in plain code checks it and fixes anything that would change what is measured. The AI proposes, the rules decide."
    >
      <div>
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-lg font-bold">Measurement contract</p>
            <span className="rounded-full bg-good/10 px-2.5 py-1 text-xs font-bold text-good">
              ✓ {c.length - fixed} passed{fixed ? ` · 🔧 ${fixed} fixed automatically` : ""}
            </span>
          </div>
          <ul className="mt-3 grid gap-2.5">
            {c.map((x) => (
              <li key={x.rule} className="text-sm">
                <span className="font-semibold">
                  {x.status === "pass" ? "✓" : "🔧"} {x.rule}
                </span>
                <span className="block text-muted">{x.status === "pass" ? x.why : x.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-semibold">Hidden checks inside the game</p>
          <ul className="mt-1 grid gap-1 text-sm text-muted">
            {res.final.spec.hiddenChecks.map((h, i) => (
              <li key={i}>
                • <span className="font-medium text-ink">{CHECK_NAME[h.kind]}</span>: {h.how}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Step>
  );
}

function StepFive({ pilot, question }: { pilot: StudioResult["pilot"]; question: string }) {
  const protein = /protein/i.test(question);
  return (
    <Step
      n={5}
      title="Validate before launch"
      sub="Before paying for a single real response, the engine pilots the game: AI personas test resistance to 'looking good', and the hidden checks are tested against each kind of careless answering."
    >
      <div className={`card mb-3 flex flex-wrap items-center gap-3 p-4 ${pilot.verdict === "Fit to launch" ? "border-good" : "border-warn"}`}>
        <span className={`rounded-full px-3 py-1 font-bold ${pilot.verdict === "Fit to launch" ? "bg-good text-white" : "bg-warn text-ink"}`}>
          {pilot.verdict === "Fit to launch" ? "✓ Fit to launch" : "! Needs work"}
        </span>
        <span className="text-sm text-muted">
          {pilot.reasons.length ? pilot.reasons.join(" ") : "Contract passed, bias risk is low, and every kind of careless answering is caught."}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-5">
          <p className="font-display text-lg font-bold">Does it resist “looking good”?</p>
          {pilot.personas ? (
            <>
              <p className="mt-1 text-sm text-muted">
                {pilot.personas.length} AI personas answered both versions twice: plainly, and while trying to impress the researcher. A good question gives the same answer both
                times.
              </p>
              <div className="mt-3 grid gap-2">
                <ShiftBar label="Original question" v={pilot.originalShiftRate} />
                <ShiftBar label="The game" v={pilot.gameShiftRate} />
              </div>
              <p className="mt-2 text-xs text-muted">
                Bars show the % of personas whose answer changed under pressure. Lower is better; a game only fails this check if it moves clearly more (25+ points) than the
                original.
              </p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs font-semibold">See every persona</summary>
                <ul className="mt-2 grid gap-1.5 text-xs">
                  {pilot.personas.map((p) => (
                    <li key={p.persona}>
                      <b>{p.persona}</b>: original {p.plainOriginal} → {p.pressuredOriginal}
                      {p.originalShift ? " (changed)" : ""}; game {p.plainGame} → {p.pressuredGame}
                      {p.gameShift ? " (changed)" : ""}
                    </li>
                  ))}
                </ul>
              </details>
              <p className="mt-2 text-xs text-muted">A synthetic pre-test to catch problems early, not a substitute for real players.</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">The persona pilot runs when an AI key is set.</p>
          )}
        </div>
        <div className="card p-5">
          <p className="font-display text-lg font-bold">Would it catch careless answering?</p>
          <ul className="mt-3 grid gap-2 text-sm">
            {pilot.coverage.map((c) => (
              <li key={c.who} className="flex gap-2">
                <span>{c.caughtBy ? "✓" : "✕"}</span>
                <span>
                  <b>{c.who}</b> <span className="text-muted">({c.does})</span>
                  <span className="block text-xs text-muted">{c.caughtBy ? `Caught by: ${c.caughtBy}` : "Not caught"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {protein && (
        <div className="card mt-3 p-5">
          <p className="font-display text-lg font-bold">Real players, not just a pilot</p>
          <p className="mt-1 text-sm text-muted">
            This game is live. With real answers, the say-vs-do gap is proven (players rate protein 4.3/5 but choose like 2.7/5), and weak questions are flagged automatically.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
            <Link className="underline" href="/admin/protein?tab=M">
              See the evidence →
            </Link>
            <Link className="underline" href="/insights/protein">
              See what brands learn →
            </Link>
          </div>
        </div>
      )}
    </Step>
  );
}

function ShiftBar({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <div className="h-3.5 flex-1 rounded bg-line/60">
          <div className="h-3.5 rounded" style={{ width: `${v ?? 0}%`, background: (v ?? 0) > 40 ? "#d03b3b" : "#2a78d6" }} />
        </div>
        <span className="w-10 text-xs tabular-nums">{v ?? "–"}%</span>
      </div>
    </div>
  );
}

function Prototype({ res }: { res: StudioResult }) {
  const s = res.final.spec;
  return (
    <section className="card overflow-hidden">
      <div className="bg-ink px-5 py-3 text-white">
        <p className="text-xs font-bold uppercase tracking-widest opacity-70">The prototype</p>
        <p className="font-display text-xl font-bold">From survey question to behavioural game</p>
      </div>
      <div className="grid gap-px bg-line xl:grid-cols-2">
        <Cell title="1. Original question">
          <p className="text-lg">&ldquo;{res.question}&rdquo;</p>
          <p className="mt-2 text-sm text-muted">
            Bias risk <b>{res.originalScore}/100</b>. It measures {MEASURES[res.understanding.measuresNow] ?? res.understanding.measuresNow}.
          </p>
        </Cell>
        <Cell title="2. Redesigned question & rationale">
          <p className="text-lg">&ldquo;{s.redesignedQuestion}&rdquo;</p>
          <p className="mt-2 text-sm text-muted">{s.rationale}</p>
          <p className="mt-2 text-sm">
            Bias risk <b>{res.final.score}/100</b>
          </p>
        </Cell>
        <Cell title="3. Gamified interaction">
          <p className="font-semibold">
            {s.title} · {res.final.formatName}
          </p>
          <p className="mt-1 text-sm text-muted">{s.howToPlay}</p>
          <p className="mt-1 text-sm text-muted">
            {s.rounds.length} round{s.rounds.length === 1 ? "" : "s"} · {s.hiddenChecks.length} hidden checks · no timer · points for careful play, never for a particular answer
          </p>
          {res.final.spec.formatId === "snack_moments" && (
            <Link href="/play" className="btn btn-accent mt-3 w-fit">
              ▶ Play the full game
            </Link>
          )}
        </Cell>
        <Cell title="4. Behavioural insight it captures">
          <p>{s.insight}</p>
        </Cell>
      </div>
    </section>
  );
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

type Rewrite = {
  by: "ai" | "rules";
  model: string | null;
  moment: string;
  before: { emoji: string; name: string; price: number; protein: number }[];
  after: { emoji: string; name: string; price: number; protein: number }[];
  why: string;
  expected: string;
};

function Queue({ items }: { items: QueueItem[] }) {
  const [out, setOut] = useState<Record<string, Rewrite | "busy" | string>>({});
  const go = async (i: QueueItem) => {
    setOut((o) => ({ ...o, [i.itemId]: "busy" }));
    const r = await fetch("/api/studio/rewrite-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(i) });
    const j = await r.json();
    setOut((o) => ({ ...o, [i.itemId]: r.ok ? j : (j.error ?? "Failed") }));
  };
  return (
    <section>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Questions already in the live game that real players showed are weak (from Item health). The engine rewrites each one using its own evidence, so the question bank gets
        better with every study.
      </p>
      {items.length === 0 ? (
        <p className="card mt-3 p-5 text-sm">✓ No live question needs rewriting right now.</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((i) => {
            const o = out[i.itemId];
            return (
              <div key={i.itemId} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{i.label}</p>
                    <p className="text-sm text-muted">
                      {i.moment} · asked {i.shown} times · protein picked {i.proteinRate ?? "–"}% · rushed {i.rushedPct ?? "–"}%
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-warn/20 px-2 py-0.5 text-xs font-semibold text-[#8a6200]">! {i.verdict}</span>
                  </div>
                  <button onClick={() => go(i)} disabled={o === "busy"} className="btn btn-primary">
                    {o === "busy" ? "Rewriting…" : "✨ Rewrite with evidence"}
                  </button>
                </div>
                {o && typeof o === "object" && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Cards title="Before" cards={o.before} />
                    <Cards title={`After (${o.by === "ai" ? "AI" : "rules"})`} cards={o.after} />
                    <p className="text-sm md:col-span-2">
                      <span className="font-semibold">Why: </span>
                      {o.why}
                      <span className="block text-muted">
                        <span className="font-semibold text-ink">Expected: </span>
                        {o.expected} The new version is re-tested in a pilot before it joins the bank.
                      </span>
                    </p>
                  </div>
                )}
                {typeof o === "string" && o !== "busy" && <p className="mt-2 text-sm text-bad">{o}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Cards({ title, cards }: { title: string; cards: Rewrite["before"] }) {
  return (
    <div className="rounded-xl bg-bg p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-2 grid gap-1.5">
        {cards.map((c, k) => (
          <div key={k} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
            <span className="text-xl">{c.emoji}</span>
            <span className="flex-1">{c.name}</span>
            <span className="tabular-nums text-muted">
              ₹{c.price} · {c.protein}g
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveBridge({ res }: { res: StudioResult }) {
  const m = liveMatch(res);
  const built = m.features.filter((f) => f.inBlueprint !== null);
  const next = m.features.filter((f) => f.inBlueprint === null);
  return (
    <section>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        For this question, the live game is the finished build of the engine&apos;s design, and the benchmark it is scored against. Every feature of the live game is checked
        against the blueprint above.
      </p>
      <div className="card mt-3 grid gap-5 p-5 md:grid-cols-[14rem_1fr]">
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Blueprint matches the live game</p>
          <p className="font-display text-5xl font-extrabold tabular-nums">
            {m.matched}/{m.total}
          </p>
          <p className="text-sm text-muted">features the engine designed, as built in the live game.</p>
          <Link href="/play" className="btn btn-accent mt-2">
            ▶ Play the live game
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Designed by the engine, built in the live game</p>
            <ul className="mt-2 grid gap-1.5 text-sm">
              {built.map((f) => (
                <li key={f.feature} className="flex gap-2">
                  <span className={f.inBlueprint ? "text-good" : "text-bad"}>{f.inBlueprint ? "✓" : "✕"}</span>
                  <span>
                    {f.feature}{" "}
                    <Link href={f.href} className="text-xs text-muted underline">
                      {f.where}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">In the live game, next for the engine to generate</p>
            <ul className="mt-2 grid gap-1.5 text-sm">
              {next.map((f) => (
                <li key={f.feature} className="flex gap-2">
                  <span className="text-muted">◌</span>
                  <span>
                    {f.feature}{" "}
                    <Link href={f.href} className="text-xs text-muted underline">
                      {f.where}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function DraftStep({ drafted, busy, onUse }: { drafted: NonNullable<StudioResult["drafted"]>; busy: boolean; onUse: (q: string) => void }) {
  return (
    <Step
      n={0}
      title="Draft the question"
      sub="No question was given, so the engine wrote the survey questions a brand team would usually ask for this decision, and picked the one the decision depends on most. That one is redesigned below."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {drafted.questions.map((q, i) => (
          <div key={i} className={`card flex flex-col p-4 ${i === drafted.chosen ? "border-ink" : ""}`}>
            {i === drafted.chosen ? (
              <span className="w-fit rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">Picked: matters most</span>
            ) : (
              <span className="w-fit rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-muted">Option {i + 1}</span>
            )}
            <p className="mt-2 font-semibold">&ldquo;{q.question}&rdquo;</p>
            <p className="mt-2 text-sm text-muted">
              <span className="font-semibold text-ink">Tests: </span>
              {q.hypothesis}
            </p>
            <p className="mt-1 flex-1 text-sm text-muted">
              <span className="font-semibold text-ink">Why ask it: </span>
              {q.rationale}
            </p>
            {i !== drafted.chosen && (
              <button disabled={busy} onClick={() => onUse(q.question)} className="mt-3 w-fit rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-bg">
                Redesign this one instead
              </button>
            )}
          </div>
        ))}
      </div>
    </Step>
  );
}
