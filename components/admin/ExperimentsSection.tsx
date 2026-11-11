"use client";
/**
 * Experiments tab: each player is randomly given one of two versions of something (card wording,
 * the first price they see, the size of their mystery gift), so any difference between the two
 * groups is caused by that version.
 *
 * Each card shows (1) both groups on a TRUE scale (0–100%, or ₹ from 0), so bar lengths never
 * exaggerate a gap, and (2) a "how sure are we?" strip: the range the real difference likely lies in,
 * against a "no difference" line. If the range crosses that line, we can't tell yet.
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, CertaintyStrip } from "./charts";

interface Diff {
  estimate: number;
  lo: number;
  hi: number;
  ma: number;
  mb: number;
  na: number;
  nb: number;
}

const pct = (share: number) => Math.round(share * 100); // 0.31 → 31
const rupees = (x: number) => Math.round(x * 100) / 100;

export function ExperimentsSection({ data }: { data: AdminData }) {
  const e = data.experiments;
  const share = (d: Diff) => ({ a: pct(d.ma), b: pct(d.mb), est: pct(d.estimate), lo: pct(d.lo), hi: pct(d.hi) });
  const w = share(e.framing as Diff);
  const g = share(e.giftEffect as Diff);
  const f = share(e.formatRate as Diff);
  const an = { a: rupees(e.anchoring.ma), b: rupees(e.anchoring.mb), est: rupees(e.anchoring.estimate), lo: rupees(e.anchoring.lo), hi: rupees(e.anchoring.hi) };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ExperimentCard
        question="Does the card wording change what people pick?"
        tested="Each player was randomly shown one of two card styles for the whole game: one highlights protein (💪 20g protein), the other highlights taste (😋 chewy chocolate). Same snacks, same prices."
        measured="In Snack Moments, every question includes one high-protein snack. We count how often each group picked it."
        rows={[
          { label: "Cards highlighting protein", value: w.a, n: e.framing.na },
          { label: "Cards highlighting taste", value: w.b, n: e.framing.nb },
        ]}
        scale={{ max: 100, ticks: [0, 25, 50, 75, 100], fmt: (v) => `${v}%`, valueFmt: (v) => `${v}% of questions` }}
        diff={{ est: w.est, lo: w.lo, hi: w.hi, fmt: (v) => `${v > 0 ? "+" : ""}${v}`, unitWords: "more questions out of every 100" }}
        sides={{ left: "Protein picked more with taste cards", right: "Protein picked more with protein cards" }}
        meaning={{
          yes: "Leading with protein on the pack makes people choose protein more often.",
          no: "There's no proof yet that the card wording changes what people pick.",
        }}
      />
      <ExperimentCard
        question="Does seeing an expensive protein snack first make people willing to pay more?"
        tested="The very first question showed half the players a pricey protein snack and the other half a cheap one. After the game, we worked out how much extra money each player would pay for protein."
        measured="How many extra rupees each player would pay for 1 gram of protein, worked out from all their choices."
        rows={[
          { label: "Saw a pricey one first", value: an.a, n: e.anchoring.na },
          { label: "Saw a cheap one first", value: an.b, n: e.anchoring.nb },
        ]}
        scale={(() => {
          const top = Math.max(1, Math.ceil(Math.max(an.a, an.b) * 1.25));
          return { max: top, ticks: [0, top / 2, top].map((t) => Math.round(t * 10) / 10), fmt: (v: number) => `₹${v}`, valueFmt: (v: number) => `₹${v.toFixed(2)} per gram` };
        })()}
        diff={{ est: an.est, lo: an.lo, hi: an.hi, fmt: (v) => `${v > 0 ? "+" : "−"}₹${Math.abs(v).toFixed(2)}`, unitWords: "per gram" }}
        sides={{ left: "Pay more after seeing a cheap one first", right: "Pay more after seeing a pricey one first" }}
        meaning={{
          yes: "The first price people see changes how much they value protein, so price order matters.",
          no: "There's no proof yet that the first price changes how much people value protein.",
        }}
      />
      <ExperimentCard
        question="Does a bigger mystery gift make people play more carefully?"
        tested="The mystery gift after Gut Check is random: some players get 20 or 40 points, others 10. We compare how often each group rushed their answers afterwards."
        measured="How often each group answered a question faster than anyone could read it. Lower is better."
        rows={[
          { label: "Got a big gift (20–40 pts)", value: g.a, n: e.giftEffect.na },
          { label: "Got a small gift (10 pts)", value: g.b, n: e.giftEffect.nb },
        ]}
        scale={{ max: 100, ticks: [0, 25, 50, 75, 100], fmt: (v) => `${v}%`, valueFmt: (v) => `${v}% of answers rushed` }}
        diff={{ est: g.est, lo: g.lo, hi: g.hi, fmt: (v) => `${v > 0 ? "+" : ""}${v}`, unitWords: "more rushed answers out of every 100" }}
        sides={{ left: "Less rushing after a big gift", right: "More rushing after a big gift" }}
        meaning={{
          yes: "Gift size changes how carefully people play afterwards.",
          no: "There's no proof yet that gift size changes how carefully people play.",
        }}
      />
      <ExperimentCard
        question="Is protein picked more often with 2 cards or with 3?"
        tested="Snack Moments asks some questions as a 2-card duel and some with 3 cards. This compares the same players across both kinds of question (a check, not a random split)."
        measured="How often the high-protein snack was picked in each kind of question."
        rows={[
          { label: "2-card duels", value: f.a, n: e.formatRate.na },
          { label: "3-card choices", value: f.b, n: e.formatRate.nb },
        ]}
        scale={{ max: 100, ticks: [0, 25, 50, 75, 100], fmt: (v) => `${v}%`, valueFmt: (v) => `${v}% of questions` }}
        diff={{ est: f.est, lo: f.lo, hi: f.hi, fmt: (v) => `${v > 0 ? "+" : ""}${v}`, unitWords: "more questions out of every 100" }}
        sides={{ left: "Protein picked more with 3 cards", right: "Protein picked more with 2 cards" }}
        meaning={{
          yes: "The number of cards changes how often protein wins, so question format matters.",
          no: "There's no proof yet that the number of cards changes how often protein wins.",
        }}
      />
    </div>
  );
}

function ExperimentCard({
  question,
  tested,
  measured,
  rows,
  scale,
  diff,
  sides,
  meaning,
}: {
  question: string;
  tested: string;
  measured: string;
  rows: { label: string; value: number; n: number }[];
  scale: { max: number; ticks: number[]; fmt: (v: number) => string; valueFmt: (v: number) => string };
  diff: { est: number; lo: number; hi: number; fmt: (v: number) => string; unitWords: string };
  sides: { left: string; right: string };
  meaning: { yes: string; no: string };
}) {
  const valid = Number.isFinite(diff.lo) && Number.isFinite(diff.hi);
  const clear = valid && (diff.lo > 0 || diff.hi < 0);
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / scale.max) * 100))}%`;

  return (
    <section className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-bold">{question}</h3>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
          style={clear ? { background: "#e3f4e3", color: "#0a7a0a" } : { background: "#f1f0ec", color: "#52514e" }}
        >
          {clear ? "✓ Clear effect" : "○ Can't tell yet"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        <span className="font-semibold text-ink">What we tested: </span>
        {tested}
      </p>
      <p className="mt-1 text-sm text-muted">
        <span className="font-semibold text-ink">What we measured: </span>
        {measured}
      </p>

      {/* 1. both groups on a true scale */}
      <div className="mt-4 grid gap-3">
        {rows.map((r, i) => (
          <div key={r.label}>
            <div className="flex justify-between gap-3 text-sm">
              <span>
                {r.label} <span className="text-xs text-muted">({r.n} players)</span>
              </span>
              <span className="font-semibold tabular-nums">{scale.valueFmt(r.value)}</span>
            </div>
            <div className="relative mt-1 h-5 rounded-md bg-line/50">
              {scale.ticks.slice(1, -1).map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-white" style={{ left: at(t) }} aria-hidden />
              ))}
              <div className="h-5 rounded-md" style={{ width: at(r.value), background: i === 0 ? C.s1 : C.s2 }} />
            </div>
          </div>
        ))}
        <div className="relative h-4 text-[10px] text-muted" aria-hidden>
          {scale.ticks.map((t, i) => (
            <span key={t} className="absolute" style={{ left: at(t), transform: i === 0 ? "none" : i === scale.ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>
              {scale.fmt(t)}
            </span>
          ))}
        </div>
      </div>

      {/* 2. how sure are we? */}
      {valid && (
        <div className="mt-3">
          <CertaintyStrip est={diff.est} lo={diff.lo} hi={diff.hi} left={sides.left} right={sides.right} clear={clear} />
        </div>
      )}

      <p className="mt-3 flex-1 rounded-xl bg-bg px-3 py-2 text-sm">
        <span className="font-semibold">💡 What it says: </span>
        {rows[0].label}: {scale.valueFmt(rows[0].value)}; {rows[1].label.charAt(0).toLowerCase() + rows[1].label.slice(1)}: {scale.valueFmt(rows[1].value)}.{" "}
        {clear ? (
          <>
            That gap ({diff.fmt(diff.est)} {diff.unitWords}) is too big to be chance. {meaning.yes}
          </>
        ) : (
          <>The gap is small enough that it could just be chance. {meaning.no} More players would make this clearer.</>
        )}
      </p>
    </section>
  );
}
