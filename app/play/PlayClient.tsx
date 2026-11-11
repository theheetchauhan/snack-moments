"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Tracker, deviceHash } from "@/lib/events/tracker";
// the 10 games, in the order a player can meet them
import { LabelDetective } from "@/components/play/games/LabelDetective";
import { GutCheck } from "@/components/play/games/GutCheck";
import { PeekAndPick } from "@/components/play/games/PeekAndPick";
import { MySnackWeek } from "@/components/play/games/MySnackWeek";
import { SnackMoments, type RoundAnswer } from "@/components/play/games/SnackMoments";
import { BidIt } from "@/components/play/games/BidIt";
import { StockTheShelf, type ShelfResult } from "@/components/play/games/StockTheShelf";
import { BuildABar } from "@/components/play/games/BuildABar";
import { GuessTheCrowd } from "@/components/play/games/GuessTheCrowd";
import { BonusRound } from "@/components/play/games/BonusRound";
// the closing questions (not games)
import { RealityCheck } from "@/components/play/questions/RealityCheck";
import { StatedRating } from "@/components/play/questions/StatedRating";
import { FollowupQuestion } from "@/components/play/questions/FollowupQuestion";
// everything around the games: points, rewards, results, researcher view
import { SnackPass, levelFor } from "@/components/play/SnackPass";
import { RewardToast, type Toast } from "@/components/play/RewardToast";
import { ResultsCard } from "@/components/play/ResultsCard";
import { ResearcherPanel } from "@/components/play/ResearcherPanel";
import type { LiveQuality, PlanStep, Results, Screen, StepResponse } from "@/components/play/types";

const SEGMENTS = ["18–24 student", "25–34 working", "35+ working", "gym-goer"];

export default function PlayClient() {
  const [segment, setSegment] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [framing, setFraming] = useState<string | undefined>();
  const [screen, setScreen] = useState<Screen | null>(null);
  // the journey comes from the server: optional games are picked for each player as they play
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [live, setLive] = useState<LiveQuality | null>(null);
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [researcher, setResearcher] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tracker = useRef<Tracker | null>(null);
  const [points, setPoints] = useState(0);
  const pointsRef = useRef(0);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  const [toast, setToast] = useState<Toast | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  // the researcher view is a demo tool: players never see the toggle unless the link has ?researcher=1
  const [researcherAllowed, setResearcherAllowed] = useState(false);

  useEffect(() => {
    const allowed = new URLSearchParams(window.location.search).get("researcher") === "1";
    setResearcherAllowed(allowed);
    try {
      setResearcher(allowed && localStorage.getItem("sm_researcher") !== "0");
    } catch {
      setResearcher(allowed);
    }
  }, []);
  useEffect(() => () => tracker.current?.stop(), []);

  const start = async () => {
    if (!segment) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ segment, deviceHash: await deviceHash() }),
      });
      const j = await res.json();
      tracker.current?.stop();
      tracker.current = new Tracker(j.sessionId);
      tracker.current.start();
      setSessionId(j.sessionId);
      setFraming(j.framing);
      setPlan(j.plan ?? []);
      setScreen(j.screen);
    } catch {
      setError("Couldn't start. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = useCallback(
    async (kind: string, payload: unknown) => {
      if (!sessionId) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/step`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, payload }),
        });
        const j: StepResponse = await res.json();
        if (!res.ok) throw new Error(j.error);
        if (j.live) setLive(j.live);
        if (j.rewards) {
          const before = levelFor(pointsRef.current).lvl;
          const after = levelFor(j.rewards.total);
          // everything earned in this step goes into ONE toast (level-up included)
          const lines = j.rewards.added.map((r) => ({ emoji: r.emoji, label: r.label.replace("Badge: ", "Badge · "), points: r.points }));
          if (after.lvl > before) lines.push({ emoji: "🎉", label: `Level up: ${after.name}`, points: 0 });
          if (lines.length) {
            setToast({ id: `${Date.now()}`, lines });
            j.rewards.added.forEach((r) => tracker.current?.track("reward_shown", null, { kind: r.kind, points: r.points }));
          }
          setPoints(j.rewards.total);
        }
        if (j.nudge) {
          setNudge(true);
          tracker.current?.track("nudge_shown");
          setTimeout(() => setNudge(false), 3500);
        }
        if (j.results) {
          setResults(j.results);
          setPoints(j.results.points);
          tracker.current?.track("results_viewed");
          tracker.current?.flush();
        }
        if (j.plan) setPlan(j.plan); // picked bonus games simply fill their slot, no announcement
        setScreen(j.screen);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        setError((e as Error).message || "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  /** Peek & Pick asks the server for one hidden value at a time. */
  const reveal = useCallback(
    async (snackId: string, attr: string) => {
      if (!sessionId) return null;
      const res = await fetch(`/api/sessions/${sessionId}/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "peek_reveal", payload: { snackId, attr } }),
      });
      const j = await res.json();
      return res.ok ? (j.reveal as { value: string; left: number }) : null;
    },
    [sessionId],
  );

  const reset = () => {
    setPoints(0);
    setToast(null);
    tracker.current?.stop();
    tracker.current = null;
    setSessionId(null);
    setScreen(null);
    setPlan([]);
    setResults(null);
    setLive(null);
  };

  const toggleResearcher = () => {
    setResearcher((r) => {
      try {
        localStorage.setItem("sm_researcher", r ? "0" : "1");
      } catch {}
      return !r;
    });
  };

  const kind = screen?.kind ?? "intro";
  const stageIdx = plan.findIndex((p) => p.key === kind);
  const stageLabel = plan[stageIdx]?.label ?? "";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 lg:flex-row lg:items-start">
      <div className="mx-auto w-full max-w-md flex-1">
        <header className="mb-4 flex items-center justify-between">
          <Link href="/" className="font-display text-lg font-extrabold">
            🍿 Snack Moments
          </Link>
          {researcherAllowed && (
            <button onClick={toggleResearcher} className="rounded-full border border-line px-3 py-1 text-xs text-muted">
              {researcher ? "Hide" : "Show"} researcher view
            </button>
          )}
        </header>

        {screen && kind !== "done" && (
          <div className="mb-3">
            <SnackPass points={points} />
          </div>
        )}
        {screen && kind !== "done" && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-muted">
              <span>{stageLabel}</span>
              <span>
                {kind === "round" && screen.kind === "round" ? `Round ${screen.round} · adapts to you (4–10)` : `Step ${stageIdx + 1} of ${plan.length}`}
              </span>
            </div>
            <div className="mt-1 flex gap-1">
              {plan.map((p, i) => (
                <div
                  key={`${p.key}${i}`}
                  title={p.label}
                  className={`h-1.5 flex-1 rounded-full ${i <= stageIdx ? "bg-accent" : p.key === "mystery" ? "bg-butter" : "bg-line"}`}
                />
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={kind + (screen?.kind === "round" ? screen.itemId : "")} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
            {!screen && (
              <div className="flex flex-col gap-5">
                <div className="card p-6">
                  <p className="text-xs uppercase tracking-wider text-muted">A 4-minute snack challenge</p>
                  <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight">What do you actually reach for?</h1>
                  <p className="mt-2 text-muted">
                    Quick snack games: spot details on a pack, swipe on gut instinct, real snack moments, read the crowd, plus two bonus games picked just for you. There are no right answers. You earn points for finishing each game, a mystery gift along the way,
                    skill bonuses for reading the crowd, and a bonus for playing thoughtfully. Never for what you pick.
                  </p>
                </div>
                <div className="card p-5">
                  <p className="font-semibold">Which best describes you?</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {SEGMENTS.map((s) => (
                      <button key={s} onClick={() => setSegment(s)} className={`rounded-xl border px-3 py-3 text-sm ${segment === s ? "border-ink bg-ink text-white" : "border-line"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn btn-accent w-full text-lg" disabled={!segment || busy} onClick={start}>
                  {busy ? "Starting…" : "Let's play"}
                </button>
                <p className="text-center text-xs text-muted">Anonymous. We record how you play (taps, timing) to keep the research honest, never personal details.</p>
              </div>
            )}
            {screen?.kind === "label" && tracker.current && (
              <LabelDetective screen={screen} tracker={tracker.current} busy={busy} onSubmit={(r) => send("label", r)} />
            )}
            {screen?.kind === "gut" && tracker.current && <GutCheck screen={screen} tracker={tracker.current} busy={busy} onSubmit={(r) => send("gut", r)} />}
            {screen?.kind === "peek" && tracker.current && (
              <PeekAndPick screen={screen} tracker={tracker.current} busy={busy} reveal={reveal} onSubmit={(r) => send("peek", r)} />
            )}
            {screen?.kind === "bid" && tracker.current && <BidIt screen={screen} tracker={tracker.current} busy={busy} onSubmit={(r) => send("bid", r)} />}
            {screen?.kind === "bonus" && <BonusRound screen={screen} busy={busy} onSubmit={(r) => send("bonus", r)} />}
            {screen?.kind === "round" && tracker.current && (
              <SnackMoments screen={screen} tracker={tracker.current} busy={busy} onSubmit={(a: RoundAnswer) => send("answer", a)} />
            )}
            {screen?.kind === "week" && tracker.current && <MySnackWeek screen={screen} tracker={tracker.current} busy={busy} onSubmit={(r) => send("week", r)} />}
            {screen?.kind === "bar" && tracker.current && <BuildABar screen={screen} tracker={tracker.current} busy={busy} onSubmit={(r) => send("bar", r)} />}
            {screen?.kind === "shelf" && tracker.current && <StockTheShelf screen={screen} tracker={tracker.current} busy={busy} onSubmit={(r: ShelfResult) => send("shelf", r)} />}
            {screen?.kind === "crowd" && tracker.current && <GuessTheCrowd screen={screen} tracker={tracker.current} busy={busy} onSubmit={(r) => send("crowd", r)} />}
            {screen?.kind === "reality" && tracker.current && <RealityCheck screen={screen} tracker={tracker.current} busy={busy} onSubmit={(r) => send("reality", r)} />}
            {screen?.kind === "stated" && <StatedRating question={screen.question} busy={busy} onSubmit={(v) => send("stated", { value: v })} />}
            {screen?.kind === "followup" && <FollowupQuestion screen={screen} busy={busy} onSubmit={(a) => send("followup", { answer: a })} />}
            {screen?.kind === "done" && results && <ResultsCard r={results} onAgain={reset} />}
          </motion.div>
        </AnimatePresence>

        <RewardToast toast={toast} onDone={clearToast} />

        {error && <p className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad">{error}</p>}

        <AnimatePresence>
          {nudge && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed inset-x-4 bottom-6 mx-auto max-w-sm rounded-2xl bg-ink p-4 text-center text-sm text-white shadow-lg"
              role="status"
            >
              Take your time. There are no right answers, just your real picks 🙂
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {researcher && researcherAllowed && (
        <div className="mx-auto w-full max-w-md lg:sticky lg:top-6 lg:w-80">
          <ResearcherPanel
            live={live}
            info={{
              reason: screen?.kind === "round" ? screen.reason : undefined,
              converged: screen?.kind === "round" ? screen.converged : undefined,
              framing,
            }}
          />
          {sessionId && (
            <Link href={`/admin/protein/session/${sessionId}`} className="mt-2 block text-center text-xs text-muted underline">
              Open this session in the admin drill-down →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
