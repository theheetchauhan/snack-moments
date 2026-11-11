"use client";
/**
 * Renders any game the Question Lab designs as a clickable preview. The AI writes a game spec;
 * this turns it into real screens using a small set of reusable mechanics.
 * Styled like the live Snack Moments game (cream page, white cards, step bar, tap then confirm).
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameSpecT, Mechanic } from "@/lib/studio/contract";

export function GamePreview({ spec, mechanic }: { spec: GameSpecT; mechanic: Mechanic | string }) {
  const [key, setKey] = useState(0);
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border border-line bg-bg shadow-lg">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-base font-extrabold text-ink">🍿 Snack Moments</span>
          <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-muted">Preview</span>
        </div>
        <Body key={key} spec={spec} mechanic={mechanic} onRestart={() => setKey((k) => k + 1)} />
      </div>
    </div>
  );
}

function Body({ spec, mechanic, onRestart }: { spec: GameSpecT; mechanic: string; onRestart: () => void }) {
  const [step, setStep] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const rounds = spec.rounds.length ? spec.rounds : [{ scene: "", emoji: "🎯", prompt: spec.redesignedQuestion, options: [] }];
  const total = mechanic === "choice_cards" ? rounds.length : 1;
  const done = step >= total;
  const record = (x: string) => {
    setLog((l) => [...l, x]);
    setStep((s) => s + 1);
  };

  const progress = (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-muted">
        <span>{spec.title}</span>
        <span>{done ? "Done" : `Step ${step + 1} of ${total}`}</span>
      </div>
      <div className="mt-1 flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step || (i === step && !done) ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );

  if (done)
    return (
      <div className="flex flex-col gap-3">
        {progress}
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wider text-muted">All done 🎉</p>
          <h2 className="font-display text-xl font-bold">Round complete</h2>
          <p className="mt-1 text-sm text-muted">What the game recorded (players never see this):</p>
          <ul className="mt-3 grid gap-1.5 text-sm">
            {log.map((l, i) => (
              <li key={i} className="rounded-xl bg-bg px-3 py-2">
                {l}
              </li>
            ))}
          </ul>
          {spec.askOriginalLast && <p className="mt-3 text-xs text-muted">Then the original question is asked last, to compare what they say with what they did.</p>}
        </div>
        <button onClick={onRestart} className="btn btn-ghost w-full bg-surface">
          ↺ Play again
        </button>
      </div>
    );

  const r = rounds[Math.min(step, rounds.length - 1)];
  const header = (
    <motion.div key={`h${step}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      {step === 0 && spec.howToPlay && <p className="mb-3 rounded-xl bg-bg px-3 py-2 text-xs text-muted">{spec.howToPlay}</p>}
      <div className="flex items-center gap-3">
        {r.emoji && (
          <span className="text-3xl" aria-hidden>
            {r.emoji}
          </span>
        )}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{mechanic === "choice_cards" && rounds.length > 1 ? `Snack moment ${step + 1}` : "Game"}</p>
          <h2 className="font-display text-xl font-bold leading-snug">{r.scene || spec.title}</h2>
        </div>
      </div>
      <p className="mt-3 font-semibold">{r.prompt}</p>
    </motion.div>
  );

  let game: React.ReactNode;
  if (mechanic === "choice_cards") game = <Choice key={step} options={r.options} onPick={(o) => record(`${r.scene || `Round ${step + 1}`}: picked ${o}`)} />;
  else if (mechanic === "peek") game = <Peek options={r.options} onDone={record} />;
  else if (mechanic === "swipe") game = <Swipe options={r.options} onDone={record} />;
  else if (mechanic === "budget") game = <Budget options={r.options} budget={spec.budget ?? 300} onDone={record} />;
  else if (mechanic === "frequency") game = <Frequency options={r.options} onDone={record} />;
  else if (mechanic === "crowd_guess") game = <Amount min={0} max={100} unit="%" start={50} onDone={(v) => record(`Guessed ${v}% of people`)} />;
  else game = <Amount min={0} max={500} unit="₹" start={100} onDone={(v) => record(`Bid ₹${v}`)} />;

  return (
    <div className="flex flex-col gap-3">
      {progress}
      {header}
      {game}
    </div>
  );
}

type Opt = GameSpecT["rounds"][number]["options"][number];

const Emoji = ({ e, size = "h-12 w-12 text-2xl" }: { e: string; size?: string }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-2xl bg-bg ${size}`} aria-hidden>
    {e}
  </span>
);

const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-center text-xs text-muted">{children}</p>;

function Choice({ options, onPick }: { options: Opt[]; onPick: (label: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <div className="flex flex-col gap-2.5" role="radiogroup">
        {options.map((o, i) => (
          <motion.button
            key={o.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            role="radio"
            aria-checked={sel === o.label}
            onClick={() => setSel(o.label)}
            className={`card flex items-center gap-3 p-3 text-left transition-colors ${sel === o.label ? "!border-ink ring-2 ring-ink" : "hover:border-ink/40"}`}
          >
            <Emoji e={o.emoji} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{o.label}</span>
              <span className="text-xs text-muted">{o.detail}</span>
            </span>
          </motion.button>
        ))}
      </div>
      <button className="btn btn-primary w-full" disabled={!sel} onClick={() => sel && onPick(sel)}>
        Lock it in
      </button>
      <Hint>No right answers. Pick what you&apos;d actually buy.</Hint>
    </>
  );
}

function Peek({ options, onDone }: { options: Opt[]; onDone: (x: string) => void }) {
  const [open, setOpen] = useState<string[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const left = 2 - open.length;
  return (
    <>
      <p className="text-center text-sm text-muted">
        You have <b className="text-ink">{left}</b> peek{left === 1 ? "" : "s"} left, then pick one.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {options.map((o) => {
          const shown = open.includes(o.label);
          return (
            <button
              key={o.label}
              onClick={() => (shown ? setPick(o.label) : left > 0 && setOpen((x) => [...x, o.label]))}
              className={`card flex min-h-[6rem] flex-col items-center justify-center gap-1 p-3 text-center transition-colors ${pick === o.label ? "!border-ink ring-2 ring-ink" : ""}`}
            >
              <span className="text-2xl" aria-hidden>
                {o.emoji}
              </span>
              <span className="text-sm font-semibold leading-tight">{o.label}</span>
              <AnimatePresence mode="wait">
                {shown ? (
                  <motion.span key="v" initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} className="text-xs text-muted">
                    {o.detail}
                  </motion.span>
                ) : (
                  <span className={`mt-1 rounded-lg px-3 py-1 text-sm font-bold ${left > 0 ? "bg-butter/60" : "bg-line/60"}`}>?</span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
      <button className="btn btn-primary w-full" disabled={!pick} onClick={() => onDone(`Looked at: ${open.join(" → ")}; then picked ${pick}`)}>
        {pick ? "I'll take this one" : "Peek, then tap one to pick"}
      </button>
    </>
  );
}

function Swipe({ options, onDone }: { options: Opt[]; onDone: (x: string) => void }) {
  const [i, setI] = useState(0);
  const [yes, setYes] = useState<string[]>([]);
  const o = options[i];
  const next = (like: boolean) => {
    const y = like ? [...yes, o.label] : yes;
    setYes(y);
    if (i + 1 >= options.length) onDone(`Swiped yes on ${y.length} of ${options.length}: ${y.join(", ") || "none"}`);
    else setI(i + 1);
  };
  if (!o) return null;
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={o.label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -40 }} className="card p-6 text-center">
          <p className="text-5xl" aria-hidden>
            {o.emoji}
          </p>
          <p className="mt-2 font-display text-lg font-bold">{o.label}</p>
          <p className="text-xs text-muted">{o.detail}</p>
          <p className="mt-3 text-xs text-muted">
            {i + 1} of {options.length}
          </p>
        </motion.div>
      </AnimatePresence>
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => next(false)} className="btn btn-ghost bg-surface">
          👎 Nah
        </button>
        <button onClick={() => next(true)} className="btn btn-primary">
          👍 Yes
        </button>
      </div>
      <Hint>Go with your gut.</Hint>
    </>
  );
}

const priceOf = (o: Opt) => Number(`${o.detail} ${o.label}`.match(/₹\s?(\d+)/)?.[1] ?? 50);

function Stepper({ value, onMinus, onPlus, plusDisabled }: { value: number; onMinus: () => void; onPlus: () => void; plusDisabled?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <button onClick={onMinus} disabled={value === 0} className="h-8 w-8 rounded-full border border-line bg-surface font-bold disabled:opacity-30">
        −
      </button>
      <span className="w-4 text-center font-display font-bold">{value}</span>
      <button onClick={onPlus} disabled={plusDisabled} className="h-8 w-8 rounded-full bg-ink font-bold text-white disabled:opacity-30">
        +
      </button>
    </span>
  );
}

function Budget({ options, budget, onDone }: { options: Opt[]; budget: number; onDone: (x: string) => void }) {
  const [n, setN] = useState<Record<string, number>>({});
  const spent = options.reduce((a, o) => a + (n[o.label] ?? 0) * priceOf(o), 0);
  return (
    <>
      <div className="card p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Budget</span>
          <span className="font-display font-bold">
            ₹{spent} <span className="font-normal text-muted">of ₹{budget}</span>
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-line">
          <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} />
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {options.map((o) => (
          <div key={o.label} className="card flex items-center gap-3 p-3">
            <Emoji e={o.emoji} size="h-10 w-10 text-xl" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold">{o.label}</span>
              <span className="block text-xs text-muted">{o.detail}</span>
            </span>
            <Stepper
              value={n[o.label] ?? 0}
              onMinus={() => setN((x) => ({ ...x, [o.label]: Math.max(0, (x[o.label] ?? 0) - 1) }))}
              onPlus={() => setN((x) => ({ ...x, [o.label]: (x[o.label] ?? 0) + 1 }))}
              plusDisabled={spent + priceOf(o) > budget}
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => onDone(`Basket: ${Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${v} × ${k}`).join(", ") || "empty"} (₹${spent})`)}
        className="btn btn-primary w-full"
      >
        Done
      </button>
    </>
  );
}

function Frequency({ options, onDone }: { options: Opt[]; onDone: (x: string) => void }) {
  const [n, setN] = useState<Record<string, number>>({});
  return (
    <>
      <div className="flex flex-col gap-2.5">
        {options.map((o) => (
          <div key={o.label} className="card flex items-center gap-3 p-3">
            <Emoji e={o.emoji} size="h-10 w-10 text-xl" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold">{o.label}</span>
              <span className="block text-xs text-muted">{o.detail}</span>
            </span>
            <Stepper
              value={n[o.label] ?? 0}
              onMinus={() => setN((x) => ({ ...x, [o.label]: Math.max(0, (x[o.label] ?? 0) - 1) }))}
              onPlus={() => setN((x) => ({ ...x, [o.label]: Math.min(14, (x[o.label] ?? 0) + 1) }))}
            />
          </div>
        ))}
      </div>
      <button onClick={() => onDone(`Last week: ${options.map((o) => `${o.label} ${n[o.label] ?? 0}×`).join(", ")}`)} className="btn btn-primary w-full">
        Done
      </button>
    </>
  );
}

function Amount({ min, max, unit, start, onDone }: { min: number; max: number; unit: "₹" | "%"; start: number; onDone: (v: number) => void }) {
  const [v, setV] = useState(start);
  return (
    <>
      <div className="card p-5">
        <p className="text-center font-display text-5xl font-extrabold">{unit === "₹" ? `₹${v}` : `${v}%`}</p>
        <input type="range" min={min} max={max} step={unit === "₹" ? 5 : 1} value={v} onChange={(e) => setV(Number(e.target.value))} className="mt-4 w-full" />
        <div className="flex justify-between text-xs text-muted">
          <span>{unit === "₹" ? `₹${min}` : `${min}%`}</span>
          <span>{unit === "₹" ? `₹${max}` : `${max}%`}</span>
        </div>
      </div>
      <button onClick={() => onDone(v)} className="btn btn-primary w-full">
        Lock it in
      </button>
    </>
  );
}
