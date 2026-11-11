/**
 * Question Lab engine: turns a conventional survey question into a validated, playable game.
 *
 *  1. Understand  – decision first: what the brand must decide, what the question measures now,
 *                   and what behaviour it should measure instead.
 *  2. Transform   – behavioural, indirect and psychometric rewrites, each naming the bias it removes.
 *  3. Debate      – a writer model designs a game; the measurement contract (plain code) repairs it;
 *                   an independent critic from a different model family scores it; repeat until the
 *                   risk is low enough (max 3 rounds).
 *  4. Validate    – a synthetic pilot: AI personas answer the original and the game, with and without
 *                   pressure to look good; plus which kinds of bad answering the hidden checks catch.
 *
 * Every model output is schema-checked. If there is no key, or a step fails, the rule-based version of
 * that step runs and the result says so.
 */
import { z } from "zod";
import { aiObject, aiEnabled, MODELS } from "./client";
import { FORMATS, type ConstructKind } from "@/lib/registry/formats";
import { findLiveStudy } from "@/lib/studio/liveStudies";
import { badActorCoverage, CONSTRUCTS, enforceContract, FORMAT_FAMILY, GameSpec, MECHANIC, type ContractCheck, type GameSpecT } from "@/lib/studio/contract";
import {
  RUBRIC,
  riskScore,
  ruleCandidates,
  ruleCritiqueQuestion,
  ruleCritiqueSpec,
  ruleDraft,
  ruleSpec,
  ruleUnderstand,
  type Critique,
  type DraftedQuestion,
} from "@/lib/studio/rules";

export { RUBRIC };
const MEASURE_WORDS = ["attitude", "intention", "habit", "belief", "preference", "knowledge"] as const;
const TARGET = 25; // stop debating once the risk score is at or below this
const MAX_ROUNDS = 3;

const Understanding = z.object({
  category: z.string(),
  decision: z.string(),
  measuresNow: z.string(),
  needsBehaviour: z.string(),
  construct: z.string(),
  threats: z.array(z.string()),
  whyGap: z.string(),
});
const Candidates = z.object({
  candidates: z
    .array(
      z.object({
        approach: z.string(),
        question: z.string(),
        construct: z.string(),
        removes: z.array(z.string()),
        why: z.string(),
      }),
    )
    ,
});
const Draft = z.object({
  questions: z.array(z.object({ question: z.string(), hypothesis: z.string(), rationale: z.string() })),
  chosen: z.number(),
});
const CritiqueSchema = z.object({
  scores: z.array(z.object({ key: z.string(), risk: z.number(), reason: z.string() })),
  verdict: z.string(),
});
const PilotSchema = z.object({
  results: z.array(
    z.object({
      persona: z.string(),
      plainOriginal: z.string(),
      pressuredOriginal: z.string(),
      plainGame: z.string(),
      pressuredGame: z.string(),
    }),
  ),
});

const PERSONAS = [
  "College student on a tight monthly budget",
  "Busy working parent with two kids",
  "Fitness enthusiast who trains five days a week",
  "Retired homemaker who shops carefully",
  "Young professional who follows trends on Instagram",
  "Small-town shop owner, practical and price-aware",
  "Office worker who worries about health but has little time",
  "Teenager who buys mostly online with pocket money",
];

export type StudioEvent =
  | { stage: "draft"; data: NonNullable<StudioResult["drafted"]> }
  | { stage: "understand"; data: StudioResult["understanding"] }
  | { stage: "transform"; data: StudioResult["candidates"] }
  | { stage: "critique_original"; data: { critique: Critique; score: number } }
  | { stage: "round"; data: StudioRound }
  | { stage: "pilot"; data: StudioResult["pilot"] }
  | { stage: "done"; data: StudioResult }
  | { stage: "error"; data: string };

export interface StudioRound {
  round: number;
  spec: GameSpecT;
  contract: ContractCheck[];
  critique: Critique;
  score: number;
  by: "ai" | "rules" | "live";
}

export interface StudioResult {
  mode: "ai" | "rules";
  models: { writer: string; critic: string; fast: string } | null;
  question: string;
  /** set when the engine drafted the question itself from the decision */
  drafted: { questions: DraftedQuestion[]; chosen: number } | null;
  understanding: z.infer<typeof Understanding>;
  candidates: z.infer<typeof Candidates>["candidates"];
  originalCritique: Critique;
  originalScore: number;
  rounds: StudioRound[];
  final: StudioRound & { formatName: string; mechanic: string; otherFormats: { name: string; why: string; fits: boolean }[] };
  pilot: {
    personas: { persona: string; originalShift: boolean; gameShift: boolean; plainOriginal: string; pressuredOriginal: string; plainGame: string; pressuredGame: string }[] | null;
    originalShiftRate: number | null;
    gameShiftRate: number | null;
    coverage: ReturnType<typeof badActorCoverage>;
    verdict: "Fit to launch" | "Needs work";
    reasons: string[];
  };
  fallbacks: string[];
  /** set when the question matched a live study and its proven design was reused */
  liveStudy: { id: string; name: string; playHref: string } | null;
}

const SYS =
  "You are a senior consumer-research methodologist designing gamified research for brands in India. You turn self-report survey questions into measures of REAL behaviour: realistic choices with a cost, recent actual behaviour, or questions about others. You never reward a particular answer, never use leading words, and always keep the construct the brand's decision needs. Write in plain, friendly English for everyday consumers.";

const registryText = () =>
  FORMATS.map(
    (f) => `- ${f.id} ("${FORMAT_FAMILY[f.id] ?? f.name}"): measures ${f.measures.join("/")}; timer ${f.timingValid ? "allowed" : "NOT allowed"}; mechanic ${MECHANIC[f.id]}`,
  ).join("\n");

const MECHANIC_HELP = `How each mechanic uses the fields:
- choice_cards: 2–4 rounds; each round is a concrete situation with 2–4 option cards (label, emoji, detail with price and the key attributes). Vary prices/attributes between rounds.
- peek: 1 round; options are DETAILS the player can uncover (label = detail name, detail = the hidden value); the player uncovers two, then chooses.
- swipe: 1 round; options are items to swipe yes/no quickly.
- bid: 1 round; the prompt asks the most they would pay; options may hold reference prices.
- budget: 1 round; options are items with a price in detail; set budget to a number.
- crowd_guess: 1 round; the prompt asks what % of people like them would choose something.
- frequency: 1 round; options are occasions; the player sets how many times each happened last week.`;

const CONTRACT_HELP = `The game MUST pass this contract (code checks it and will override you):
1. formatId must measure the construct. 2. No timer if the format doesn't allow one (timerSeconds null).
3. rewardBasis is careful_play or accuracy (never specific_answer or completion). 4. optionStyling "identical".
5. No leading words in options (healthy choice, best, smart, recommended, guilt-free...).
6. hiddenChecks include repeat or dominated, position_shuffle, timing, stated_last. 7. askOriginalLast true.`;

const critiquePrompt = (what: string) =>
  `Score the RISK of each problem from 0 (none) to 10 (severe), with one plain-English reason each. Use exactly these keys:\n${RUBRIC.map((x) => `${x.key}: ${x.help}`).join("\n")}\n\nReview this:\n${what}`;

const specText = (s: GameSpecT) =>
  [
    `Question: ${s.redesignedQuestion}`,
    `Format: ${FORMAT_FAMILY[s.formatId] ?? s.formatId}; timer: ${s.timerSeconds ?? "none"}; rewards: ${s.rewardBasis}; options styled: ${s.optionStyling}`,
    ...s.rounds.map((r, i) => `Round ${i + 1} (${r.scene}): ${r.prompt} Options: ${r.options.map((o) => `${o.label} [${o.detail}]`).join(" | ")}`),
    `Hidden checks: ${s.hiddenChecks.map((c) => c.kind).join(", ")}; original asked last: ${s.askOriginalLast}`,
  ].join("\n");

function normaliseCritique(c: Critique): Critique {
  const by = new Map(c.scores.map((s) => [s.key, s]));
  return {
    verdict: c.verdict,
    scores: RUBRIC.map((x) => {
      const s = by.get(x.key);
      return { key: x.key, risk: Math.round(Math.min(10, Math.max(0, s?.risk ?? 5))), reason: s?.reason ?? "Not scored." };
    }),
  };
}

const norm = (x: string) =>
  x
    .toLowerCase()
    .replace(/[^a-z0-9₹%.]+/g, " ")
    .trim();
/** Did the persona's answer change? Short numeric answers ("4", "₹30", "3 times") compare as numbers; option answers compare by label. */
function shifted(a: string, b: string) {
  const numeric = (x: string) => /^\D{0,4}\d+(\.\d+)?\D{0,10}$/.test(x.trim());
  if (numeric(a) && numeric(b)) {
    const na = Number(a.replace(/[^\d.]/g, ""));
    const nb = Number(b.replace(/[^\d.]/g, ""));
    return Math.abs(na - nb) > Math.max(0.5, 0.15 * Math.max(Math.abs(na), Math.abs(nb)));
  }
  const label = (x: string) => norm(x.split("(")[0]);
  return label(a) !== label(b);
}

/** The game's first round, asked the way its mechanic works, with the answer format to give. */
function pilotQuestion(spec: GameSpecT, mechanic: string) {
  const r = spec.rounds[0];
  if (!r) return `${spec.redesignedQuestion}\nGive a short answer.`;
  const opts = r.options.map((o) => `${o.label} (${o.detail})`).join(" | ");
  const head = `${r.scene ? `${r.scene}. ` : ""}${r.prompt}`;
  switch (mechanic) {
    case "frequency":
      return `${head} Occasions: ${opts}\nGive ONE number: the total times across all occasions last week.`;
    case "swipe":
      return `${head} Items: ${opts}\nGive ONE number: how many of these items they would swipe yes on.`;
    case "peek":
      return `${head} Hidden details they can uncover (two at most): ${r.options.map((o) => o.label).join(" | ")}\nGive the label of the FIRST detail they would uncover.`;
    case "budget":
      return `${head} Budget ₹${spec.budget ?? 300}. Items: ${opts}\nGive the label of the item they would spend the most on.`;
    case "bid":
      return `${head}\nGive ONE number: the amount in ₹.`;
    case "crowd_guess":
      return `${head}\nGive ONE number: the percentage.`;
    default:
      return `${head} Options: ${opts}\nGive the exact label of the option chosen.`;
  }
}

export async function runStudio(given: string, decision: string, emit: (e: StudioEvent) => void = () => {}): Promise<StudioResult> {
  const ai = aiEnabled();
  const fallbacks: string[] = [];

  // 0. no question given: draft the questions a brand team would typically ask for this decision
  let drafted: StudioResult["drafted"] = null;
  if (!given.trim()) {
    const d = ai
      ? await aiObject({
          role: "writer",
          schema: Draft,
          system: SYS,
          prompt: `Brand decision: ${decision}

Write the 3 conventional survey questions a brand team would typically ask to inform this decision, phrased the usual way (ratings, likelihood, frequency, agree/disagree). For each: the hypothesis it tests and the rationale for asking it. Order them by how directly they inform the decision, and set chosen to the index of the one that matters most. The engine will then redesign the chosen one.`,
        })
      : null;
    if (ai && !d) fallbacks.push("Draft the question");
    const v = d?.value && d.value.questions.length ? d.value : ruleDraft(decision);
    drafted = { questions: v.questions, chosen: Math.min(v.questions.length - 1, Math.max(0, Math.round(v.chosen))) };
    emit({ stage: "draft", data: drafted });
  }
  const question = drafted ? drafted.questions[drafted.chosen].question : given.trim();
  const rule = ruleUnderstand(question, decision);

  // 1. understand (decision first)
  const u = ai
    ? await aiObject({
        role: "writer",
        schema: Understanding,
        system: SYS,
        prompt: `Brand decision: ${decision || "(not given; infer the most likely one)"}\nConventional question: ${question}\n\nWork decision-first. State: the product category; the business decision; what the question measures now (exactly ONE word: attitude, intention, habit, belief, preference or knowledge); the real behaviour that would answer the decision; the construct to measure (one of ${CONSTRUCTS.join(", ")}); the main bias threats (use keys: ${RUBRIC.map((x) => x.key).join(", ")}); and why the current question can't answer the decision.`,
      })
    : null;
  if (ai && !u) fallbacks.push("Understand");
  const understanding = u?.value
    ? {
        ...u.value,
        measuresNow: MEASURE_WORDS.find((w) => u.value.measuresNow.toLowerCase().includes(w)) ?? rule.understanding.measuresNow,
        construct: (CONSTRUCTS as string[]).includes(u.value.construct) ? u.value.construct : rule.understanding.construct,
        threats: u.value.threats.slice(0, 6),
      }
    : rule.understanding;
  emit({ stage: "understand", data: understanding });

  // 2. transform
  const g = ai
    ? await aiObject({
        role: "writer",
        schema: Candidates,
        system: SYS,
        prompt: `Decision: ${understanding.decision}\nNeeded behaviour: ${understanding.needsBehaviour}\nOriginal: ${question}\n\nWrite exactly 3 redesigns: one behavioural (a realistic choice or recent actual behaviour), one indirect (about others), one psychometric (several small trade-offs). For each, the construct it measures and which problems it removes (keys: ${RUBRIC.map((x) => x.key).join(", ")}).`,
      })
    : null;
  if (ai && !g) fallbacks.push("Transform");
  const candidates = g?.value.candidates?.length
    ? g.value.candidates.slice(0, 3).map((c) => ({ ...c, approach: c.approach.toLowerCase(), removes: c.removes.slice(0, 4) }))
    : ruleCandidates(rule.type, rule.topic);
  emit({ stage: "transform", data: candidates });

  // independent critic (different model family)
  const critic = async (what: string, fallback: () => Critique): Promise<{ c: Critique; by: "ai" | "rules" }> => {
    if (!ai) return { c: fallback(), by: "rules" };
    const r = await aiObject({
      role: "critic",
      schema: CritiqueSchema,
      system: "You are a strict, adversarial survey-methodology reviewer. Be specific and fair; reward real fixes.",
      prompt: critiquePrompt(what),
    });
    if (!r) {
      fallbacks.push("Critique");
      return { c: fallback(), by: "rules" };
    }
    return { c: normaliseCritique(r.value), by: "ai" };
  };
  const orig = await critic(question, () => ruleCritiqueQuestion(question));
  const originalScore = riskScore(orig.c);
  emit({ stage: "critique_original", data: { critique: orig.c, score: originalScore } });

  // 3. debate: writer designs → contract repairs → critic scores → revise
  // a live study already answers this question: reuse its proven design exactly, no new design
  const live = findLiveStudy(question, decision);
  if (live) understanding.construct = live.construct;
  const construct = understanding.construct as ConstructKind;
  const rounds: StudioRound[] = [];
  if (live) {
    const { spec, checks } = enforceContract(live.spec(), construct);
    const cr = await critic(specText(spec), () => ruleCritiqueSpec(spec));
    const round: StudioRound = { round: 1, spec, contract: checks, critique: cr.c, score: riskScore(cr.c), by: "live" };
    rounds.push(round);
    emit({ stage: "round", data: round });
  }
  let feedback = `Critique of the original question:\n${orig.c.scores.map((s) => `${s.key} ${s.risk}/10: ${s.reason}`).join("\n")}`;
  for (let n = 1; !live && n <= MAX_ROUNDS; n++) {
    const w = ai
      ? await aiObject({
          role: "writer",
          schema: GameSpec,
          system: `${SYS}\n\nChoose formatId ONLY from this registry:\n${registryText()}\n\n${MECHANIC_HELP}\n\n${CONTRACT_HELP}`,
          prompt: `Original question: ${question}\nDecision: ${understanding.decision}\nBehaviour to measure: ${understanding.needsBehaviour}\nConstruct: ${construct}\nCandidate ideas: ${JSON.stringify(candidates)}\n\n${n === 1 ? "Design the game." : "Revise your previous game to fix every problem below. Keep what works."}\n${feedback}\n\n${n > 1 ? `Previous game:\n${specText(rounds[rounds.length - 1].spec)}\n` : ""}Return a complete game: the redesigned question, formatId and why, title, how to play, rounds with concrete situations and realistic options (prices in ₹ where relevant), hidden checks, reward basis, timer, option styling, ask-original-last, the behavioural insight it captures, and the rationale.`,
        })
      : null;
    if (ai && !w) fallbacks.push(`Game design (round ${n})`);
    const draft = w?.value ?? ruleSpec(rule.type, rule.topic, question);
    const { spec, checks } = enforceContract(draft, construct);
    const cr = await critic(specText(spec), () => ruleCritiqueSpec(spec));
    const round: StudioRound = { round: n, spec, contract: checks, critique: cr.c, score: riskScore(cr.c), by: w ? "ai" : "rules" };
    rounds.push(round);
    emit({ stage: "round", data: round });
    if (!w || round.score <= TARGET) break; // rule designs don't improve by repeating
    const fixed = checks.filter((c) => c.status !== "pass");
    feedback = `Critic scores for your game:\n${cr.c.scores
      .filter((s) => s.risk >= 3)
      .map((s) => `${s.key} ${s.risk}/10: ${s.reason}`)
      .join("\n")}${fixed.length ? `\nContract rules you broke (already auto-fixed, don't repeat): ${fixed.map((c) => c.rule).join("; ")}` : ""}`;
  }
  const best = rounds.reduce((a, b) => (b.score < a.score ? b : a), rounds[0]);
  const format = FORMATS.find((f) => f.id === best.spec.formatId)!;
  const otherFormats = FORMATS.filter((f) => f.id !== format.id)
    .map((f) => ({
      name: FORMAT_FAMILY[f.id] ?? f.name,
      fits: f.measures.includes(construct),
      why: f.measures.includes(construct)
        ? "Also measures this; kept as a follow-up option."
        : `Measures ${f.measures.join(" / ").replace(/_/g, " ")}, not ${construct.replace(/_/g, " ")}.`,
    }))
    .sort((a, b) => Number(b.fits) - Number(a.fits))
    .slice(0, 4);

  // 4. validate: synthetic pilot + bad-actor coverage
  let personas: StudioResult["pilot"]["personas"] = null;
  if (ai) {
    const p = await aiObject({
      role: "fast",
      schema: PilotSchema,
      system:
        "You simulate realistic consumers for a pre-launch pilot. Each persona has fixed, realistic habits and a fixed budget. Answer every question twice per persona: once plainly, and once when they badly want to look good to the researcher. Answer each question on its own terms, as that person really would.",
      prompt: `Personas:\n${PERSONAS.map((x) => `- ${x}`).join("\n")}\n\nQUESTION A (original): ${question}\nGive only the answer value (e.g. "4", "Yes", "Monthly", "3 times").\n\nQUESTION B (game): ${pilotQuestion(best.spec, MECHANIC[best.spec.formatId])}\n\nReturn one result per persona: plainOriginal, pressuredOriginal, plainGame, pressuredGame.`,
    });
    if (!p) fallbacks.push("Pilot");
    else
      personas = p.value.results.slice(0, PERSONAS.length).map((x) => ({
        ...x,
        originalShift: shifted(x.plainOriginal, x.pressuredOriginal),
        gameShift: shifted(x.plainGame, x.pressuredGame),
      }));
  }
  const rate = (k: "originalShift" | "gameShift") => (personas?.length ? Math.round((personas.filter((x) => x[k]).length / personas.length) * 100) : null);
  const originalShiftRate = rate("originalShift");
  const gameShiftRate = rate("gameShift");
  const coverage = badActorCoverage(best.spec);
  const reasons: string[] = [];
  if (best.contract.some((c) => c.status === "fail")) reasons.push("A contract rule could not be fixed.");
  if (best.score > TARGET + 10) reasons.push(`Bias risk is still ${best.score}/100 (target ${TARGET}).`);
  if (coverage.some((c) => !c.caughtBy))
    reasons.push(
      `Some careless answering would go unnoticed: ${coverage
        .filter((c) => !c.caughtBy)
        .map((c) => c.who.toLowerCase())
        .join(", ")}.`,
    );
  if (originalShiftRate != null && gameShiftRate != null && gameShiftRate - originalShiftRate >= 25)
    reasons.push("In the pilot, the game moved more under pressure to look good than the original did.");
  const pilot: StudioResult["pilot"] = { personas, originalShiftRate, gameShiftRate, coverage, verdict: reasons.length ? "Needs work" : "Fit to launch", reasons };
  emit({ stage: "pilot", data: pilot });

  const result: StudioResult = {
    mode: ai ? "ai" : "rules",
    models: ai ? { writer: MODELS.writer, critic: MODELS.critic, fast: MODELS.fast } : null,
    question,
    drafted,
    understanding,
    candidates,
    originalCritique: orig.c,
    originalScore,
    rounds,
    final: { ...best, formatName: FORMAT_FAMILY[format.id] ?? format.name, mechanic: MECHANIC[format.id], otherFormats },
    pilot,
    fallbacks: [...new Set(fallbacks)],
    liveStudy: live ? { id: live.id, name: live.name, playHref: live.playHref } : null,
  };
  emit({ stage: "done", data: result });
  return result;
}
