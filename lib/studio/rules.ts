/**
 * Rule-based fallback for the Question Lab, used when no AI key is set (or an AI step fails).
 * It recognises five common question types and fills each pipeline step with transparent
 * heuristics, so the Lab always works and always shows the same structure.
 */
import type { ConstructKind } from "@/lib/registry/formats";
import type { GameSpecT } from "./contract";

export type QuestionType = "importance" | "likelihood" | "frequency" | "agreement" | "preference";

export const RUBRIC = [
  { key: "leading", label: "Leading wording", help: "Does the wording push towards an answer?", group: "bias" },
  { key: "double_barrelled", label: "Two questions in one", help: "Does it ask about two things at once?", group: "bias" },
  { key: "social_desirability", label: "Looking-good answer", help: "Is there an answer people give to look good?", group: "bias" },
  { key: "acquiescence", label: "Easy yes", help: "Agree/disagree or yes/no structure that invites agreement?", group: "bias" },
  { key: "ceiling", label: "No cost to saying yes", help: "Can people rate everything high with no trade-off?", group: "bias" },
  { key: "context", label: "No real situation", help: "Missing a moment, a price or a competing option?", group: "bias" },
  { key: "construct", label: "Measures the wrong thing", help: "Does it measure the decision the brand actually needs?", group: "bias" },
  { key: "confounds", label: "Muddied by other effects", help: "Brand, order or wording effects that blur the answer?", group: "bias" },
  { key: "position_bias", label: "Same-spot tapping", help: "Can someone tap the same position every time and look consistent?", group: "pattern" },
  { key: "straightlining", label: "Same answer every time", help: "Can someone give the same answer to everything without thinking?", group: "pattern" },
  { key: "speeding", label: "Rushing through", help: "Can someone answer without reading, and go unnoticed?", group: "pattern" },
] as const;
export type RubricKey = (typeof RUBRIC)[number]["key"];

export interface Critique {
  scores: { key: string; risk: number; reason: string }[];
  verdict: string;
}

/** 0–100 bias-risk score: the share of the maximum possible risk. */
export const riskScore = (c: Critique) => Math.round((c.scores.reduce((a, s) => a + Math.min(10, Math.max(0, s.risk)), 0) / (RUBRIC.length * 10)) * 100);

export function classify(q: string): QuestionType {
  const t = q.toLowerCase();
  if (/how often|times a (week|day|month)|per (week|day|month)|frequency/.test(t)) return "frequency";
  if (/\bagree\b|disagree|statement/.test(t)) return "agreement";
  if (/prefer|which do you|would you rather|or a\b/.test(t)) return "preference";
  if (/how likely|willing|would you (buy|pay|switch|choose)|intend|plan to|consider/.test(t)) return "likelihood";
  return "importance";
}

export function topicOf(q: string, type: QuestionType): string {
  const m =
    type === "importance"
      ? q.match(/how important (?:is|are) (.+?)(?: to you| when|\?|\(|$)/i)
      : type === "likelihood"
        ? q.match(/(?:likely|willing) (?:are you )?to (.+?)(?:,| if | even if | at ₹|\?|\(|$)/i)
        : type === "frequency"
          ? q.match(/how often do you (.+?)(?:\?|\(|$)/i)
          : type === "agreement"
            ? q.match(/['"“‘](.+?)['"”’]/)
            : q.match(/prefer[:,]?\s*(.+?)(?:\?|$)/i);
  return (m?.[1] ?? q.replace(/\?.*$/, ""))
    .replace(/\bcontent\b/i, "")
    .replace(/^(choose|buy|use|pick|try|switch to|go for|pay for)\s+/i, "")
    .trim()
    .slice(0, 80);
}

const MEASURES_NOW: Record<QuestionType, "attitude" | "intention" | "habit" | "belief" | "preference"> = {
  importance: "attitude",
  likelihood: "intention",
  frequency: "habit",
  agreement: "belief",
  preference: "preference",
};
const CONSTRUCT_OF: Record<QuestionType, ConstructKind> = {
  importance: "tradeoff",
  likelihood: "tradeoff",
  frequency: "frequency",
  agreement: "information_search",
  preference: "tradeoff",
};

export function ruleUnderstand(q: string, decision: string) {
  const type = classify(q);
  const topic = topicOf(q, type);
  const needs: Record<QuestionType, string> = {
    importance: `Whether people actually give something up (money, taste, convenience) to get ${topic}.`,
    likelihood: `Whether people still choose “${topic}” once it costs them something, and at what price they stop.`,
    frequency: `What people actually did last week, moment by moment, not their idea of a “usual” week.`,
    agreement: `Whether people really look for “${topic}” when they choose, not whether they agree with a statement about themselves.`,
    preference: `Which option people pick when the trade-off between them changes.`,
  };
  return {
    type,
    topic,
    understanding: {
      category: "Consumer purchase",
      decision: decision || `Should the brand invest in ${topic}?`,
      measuresNow: MEASURES_NOW[type],
      needsBehaviour: needs[type],
      construct: CONSTRUCT_OF[type],
      threats: ["social_desirability", "ceiling", "context", "straightlining"],
      whyGap: `The question asks for a self-description (${MEASURES_NOW[type]}), which costs nothing to give and is easy to flatter. The decision depends on behaviour.`,
    },
  };
}

export function ruleCandidates(type: QuestionType, topic: string) {
  const behavioural: Record<QuestionType, string> = {
    importance: `Across a few everyday situations, pick one of two options where only one has ${topic}, at different prices.`,
    likelihood: `Choose between the standard option and “${topic}” as the extra cost goes up: ₹5, then ₹15, then ₹30.`,
    frequency: `Think about last week only. Tap how many times it happened at each moment.`,
    agreement: `Pick between two products. The details are hidden; uncover two before choosing.`,
    preference: `Pick one of the two each round as the price gap between them changes.`,
  };
  return [
    {
      approach: "behavioural" as const,
      question: behavioural[type],
      construct: CONSTRUCT_OF[type],
      removes: ["social_desirability", "ceiling"],
      why: "Answers come from choices with a cost, not from a self-description.",
    },
    {
      approach: "indirect" as const,
      question: `What % of people like you would choose ${topic} here?`,
      construct: "projective" as ConstructKind,
      removes: ["social_desirability"],
      why: "Talking about others lowers the pressure to look good; comparing it with their own choice shows the gap.",
    },
    {
      approach: "psychometric" as const,
      question: `Several small trade-offs that each vary ${topic}, price and convenience, analysed together.`,
      construct: "tradeoff" as ConstructKind,
      removes: ["straightlining", "construct"],
      why: "Many small, varied decisions are harder to fake and give a more reliable score than one rating.",
    },
  ];
}

const CHECKS: GameSpecT["hiddenChecks"] = [
  { kind: "repeat", how: "One round comes back later with the options swapped." },
  { kind: "position_shuffle", how: "Option order is randomised for every player and every round." },
  { kind: "timing", how: "Each answer's time is compared with how long it takes to read the round." },
  { kind: "stated_last", how: "The original question is asked at the very end and compared with the choices made." },
  { kind: "attention", how: "One round asks the player to pick a specific option; picking anything else shows they weren't reading." },
];

function base(over: Partial<GameSpecT>): GameSpecT {
  return {
    redesignedQuestion: "",
    formatId: "showdown",
    formatWhy: "",
    title: "",
    howToPlay: "",
    rounds: [],
    budget: null,
    hiddenChecks: CHECKS.map((c) => ({ ...c })),
    rewardBasis: "careful_play",
    timerSeconds: null,
    optionStyling: "identical",
    askOriginalLast: true,
    insight: "",
    rationale: "",
    ...over,
  };
}

/** A ready-made game for each question type. The protein case uses the live Snack Moments game. */
export function ruleSpec(type: QuestionType, topic: string, original: string): GameSpecT {
  if (/protein|snack/i.test(original)) {
    return base({
      redesignedQuestion: "It's 4:30pm at your desk and you're hungry. Which one goes in your cart?",
      formatId: "snack_moments",
      formatWhy:
        "Protein importance is really a trade-off (protein vs price vs taste), so it needs forced choices with no timer. Choice cards adapt to each player and feed a choice model.",
      title: "Snack Moments",
      howToPlay: "Pick one snack for each moment. There are no right answers.",
      rounds: [
        {
          scene: "4:30pm at your desk",
          emoji: "💻",
          prompt: "Long day, two hours to go. Which one?",
          options: [
            { label: "Chocolate protein bar", emoji: "🍫", detail: "₹90 · 20g protein · chewy fudge" },
            { label: "Masala peanuts", emoji: "🥜", detail: "₹40 · 8g protein · spiced crunch" },
            { label: "Masala chips", emoji: "🥔", detail: "₹20 · 3g protein · spicy, crunchy" },
          ],
        },
        {
          scene: "11pm, can't sleep",
          emoji: "🌙",
          prompt: "The kitchen is calling. Which one?",
          options: [
            { label: "Protein cookie", emoji: "🥠", detail: "₹75 · 10g protein · soft-baked" },
            { label: "Ice cream cup", emoji: "🍨", detail: "₹50 · 3g protein · creamy, cold" },
          ],
        },
        {
          scene: "Right after the gym",
          emoji: "🏋️",
          prompt: "Walking home after a workout. Which one?",
          options: [
            { label: "Ready-to-drink shake", emoji: "🥤", detail: "₹120 · 25g protein · cold coffee" },
            { label: "Two boiled eggs", emoji: "🥚", detail: "₹30 · 12g protein · salt and pepper" },
            { label: "Choco-chip cookies", emoji: "🍪", detail: "₹30 · 2g protein · gooey chocolate" },
          ],
        },
      ],
      hiddenChecks: [...CHECKS, { kind: "dominated", how: "Sometimes the same snack appears twice at two prices; picking the pricier one signals inattention." }],
      insight:
        "What 1g of protein is worth to each person in each moment (₹ per gram), what drives their choices (price, taste or protein), and the gap between how much they say protein matters and how they choose.",
      rationale:
        "A 1–5 rating costs nothing, so everyone says protein matters. Here protein always costs money or taste. Positions are shuffled, one round repeats, an overpriced twin checks attention, and the original rating comes last to measure say vs do.",
    });
  }
  if (type === "frequency")
    return base({
      redesignedQuestion: `Think about last week only. How many times did you ${topic} at each of these moments?`,
      formatId: "snack_week",
      formatWhy: "Frequency is a habit, so it's best captured as a map of real recent occasions, not a single “usually” estimate.",
      title: "My Week",
      howToPlay: "Tap + for each time it happened last week. Then we'll ask for your total.",
      rounds: [
        {
          scene: "Last week",
          emoji: "📅",
          prompt: `How many times did you ${topic}?`,
          options: [
            { label: "Weekday lunch", emoji: "🥪", detail: "Mon–Fri, midday" },
            { label: "Weekday dinner", emoji: "🍛", detail: "Mon–Fri, evening" },
            { label: "Late night", emoji: "🌙", detail: "After 10pm" },
            { label: "Weekend", emoji: "🎉", detail: "Sat–Sun, any time" },
          ],
        },
      ],
      hiddenChecks: [{ kind: "repeat", how: "A separate “total for the week” answer is compared with the sum of the moments." }, ...CHECKS.filter((c) => c.kind !== "repeat")],
      insight: "Which moments drive volume, how often each really happens, and where the brand should show up.",
      rationale:
        "Asking about last week anchors on memory rather than self-image, and splitting by moment removes the “I usually…” guess. A separate weekly total checks consistency.",
    });
  if (type === "agreement")
    return base({
      redesignedQuestion: `Choose between two products. The details are hidden: uncover two before you choose.`,
      formatId: "peek_pick",
      formatWhy: "Agreeing that you “always check X” is a belief about yourself. Watching which details people uncover first shows what they really look at.",
      title: "Peek & Pick",
      howToPlay: "Tap up to two details to reveal them, then pick a product.",
      rounds: [
        {
          scene: "On the shelf",
          emoji: "🛒",
          prompt: "Two similar products. What do you check first?",
          options: [
            { label: "Price", emoji: "💰", detail: "₹349 vs ₹399" },
            { label: topic.length < 30 ? topic : "Ingredients", emoji: "🔎", detail: "Full list on the back" },
            { label: "Reviews", emoji: "⭐", detail: "4.1★ vs 4.4★" },
            { label: "Brand", emoji: "🏷️", detail: "Known vs new" },
          ],
        },
      ],
      insight: `How often “${topic}” is actually checked before choosing, and what people look at first instead.`,
      rationale:
        "Agree/disagree statements invite agreement and flattering self-description. Here the behaviour is observed: what people uncover first, with a cost (only two peeks).",
    });
  if (type === "preference")
    return base({
      redesignedQuestion: `Pick one each round as the price gap between the two options changes.`,
      formatId: "showdown",
      formatWhy: "A preference is only meaningful at a price, so a series of duels with a changing gap shows where people switch.",
      title: "Showdown",
      howToPlay: "Pick one of two, three times. The deal changes each round.",
      rounds: [10, 20, 30].map((d, i) => ({
        scene: `Round ${i + 1}`,
        emoji: "⚖️",
        prompt: "Which would you pick?",
        options: [
          { label: "Option A", emoji: "🅰️", detail: `${d}% cheaper over a year` },
          { label: "Option B", emoji: "🅱️", detail: "Pay as you go, cancel anytime" },
        ],
      })),
      insight: "The point at which people switch between the two options, i.e. what the difference is really worth to them.",
      rationale: "Asking “which do you prefer?” gives one answer with no price attached. Varying the gap shows the switching point.",
    });
  // importance & likelihood: a price ladder of trade-offs
  return base({
    redesignedQuestion: `Choose between the standard option and one with ${topic}, as the extra cost changes.`,
    formatId: "showdown",
    formatWhy: "Importance and intent only matter if people pay for them, so the question becomes a series of trade-offs at different prices.",
    title: "The Price of It",
    howToPlay: "Pick one of two, three times. Only the price changes.",
    rounds: [5, 15, 30].map((p, i) => ({
      scene: ["A busy weekday", "A normal shop", "Stocking up for the month"][i],
      emoji: ["⏱️", "🛒", "📦"][i],
      prompt: "Which one goes in your basket?",
      options: [
        { label: `With ${topic}`, emoji: "✳️", detail: `₹${p} more` },
        { label: "Standard", emoji: "◻️", detail: "Usual price" },
      ],
    })),
    insight: `How much ${topic} is really worth to people (the extra price at which they stop choosing it), and the gap between the rating they give and what they choose.`,
    rationale: "A rating or a “how likely” answer costs nothing, so people overstate it. A price ladder of real trade-offs shows the point where they stop paying.",
  });
}

const r = (key: RubricKey, risk: number, reason: string) => ({ key, risk, reason });

/** Heuristic critique of a plain question. */
export function ruleCritiqueQuestion(q: string): Critique {
  const t = q.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  const scale = has(/\(1\s*[-–]\s*5\)|1 to 5|scale|rate|how important|how likely|how much do you|agree/);
  const desirable = has(/healthy|protein|recycle|sustainab|eco|exercise|read|label|ingredient|important|care|ethical|organic|always/);
  return {
    scores: [
      r(
        "leading",
        has(/love|amazing|great|don't you|wouldn't you|even if/) ? 7 : 2,
        has(/even if/) ? "“Even if…” hints that saying yes is the generous answer." : "Wording is mostly neutral.",
      ),
      r("double_barrelled", has(/ and /) ? 6 : 1, has(/ and /) ? "Joins two ideas, so one answer can't mean one thing." : "Asks one thing."),
      r("social_desirability", desirable ? 9 : 4, desirable ? "There is an obvious answer that makes people look good." : "Some pressure to look sensible."),
      r("acquiescence", has(/agree|disagree|do you|would you|yes|no\b/) ? 7 : 3, "A yes/agree structure makes agreeing the easy path."),
      r("ceiling", scale ? 9 : 5, scale ? "Rating something high costs nothing, so everything gets rated high." : "No trade-off attached."),
      r("context", has(/when|moment|price|₹|rs|after|before|at night|week/) ? 4 : 8, "No concrete moment, price or competing option."),
      r("construct", scale ? 8 : 5, "Measures what people say about themselves, not the behaviour the decision depends on."),
      r("confounds", has(/brand|our|new/) ? 6 : 3, "Brand or novelty wording can prime the answer."),
      r("position_bias", scale ? 5 : 3, "Scale ends and first options get picked more by careless answerers."),
      r("straightlining", scale ? 8 : 4, "A rating scale lets people give the same answer to everything."),
      r("speeding", 7, "One tap answers it; there is no way to tell a rushed answer from a real one."),
    ],
    verdict: "Rule-based review (heuristics). With an AI key, an independent model reviews it instead.",
  };
}

/** Heuristic critique of a generated game: it reads the game's structure, not just its text. */
export function ruleCritiqueSpec(spec: GameSpecT): Critique {
  const has = (k: string) => spec.hiddenChecks.some((c) => c.kind === k);
  const choice = ["snack_moments", "showdown", "stock_shelf", "build_bar", "bid_it", "peek_pick"].includes(spec.formatId);
  const scenes = spec.rounds.some((x) => x.scene);
  return {
    scores: [
      r("leading", 1, "Options are neutral and styled the same."),
      r("double_barrelled", 1, "Each round asks for one choice."),
      r(
        "social_desirability",
        choice ? 3 : 4,
        choice ? "The 'good' option now costs money or time, so choosing it is a real signal." : "Asked about behaviour, which is harder to flatter.",
      ),
      r("acquiescence", 1, "No yes/agree structure."),
      r("ceiling", choice ? 1 : 3, choice ? "Every answer gives something up, so nothing can be rated high for free." : "Answers are counts, not ratings."),
      r("context", scenes ? 2 : 5, scenes ? "Each round sits in a concrete situation." : "Situations could be more concrete."),
      r("construct", 2, "Measures the behaviour the decision depends on."),
      r("confounds", 3, "Order and position effects are controlled by shuffling; framing stays constant."),
      r("position_bias", has("position_shuffle") ? 1 : 6, has("position_shuffle") ? "Positions are shuffled, so same-spot tapping shows up as noise." : "Positions are fixed."),
      r("straightlining", has("repeat") || has("dominated") ? 1 : 5, "Repeated or clearly-worse options expose same-answer patterns."),
      r("speeding", has("timing") ? 2 : 6, has("timing") ? "Answers faster than reading time are flagged." : "Rushing would go unnoticed."),
    ],
    verdict: "Rule-based review of the game's structure. With an AI key, an independent model reviews it instead.",
  };
}

export interface DraftedQuestion {
  question: string;
  hypothesis: string;
  rationale: string;
}

/** Without AI: drafts the conventional questions a brand team would typically ask for this decision. */
export function ruleDraft(decision: string): { questions: DraftedQuestion[]; chosen: number } {
  const m = decision.match(/(?:switch\b.*?\bto|lead with|launch|introduce|add|offer|push|invest in|use)\s+(.+?)(?=\s+(?:at|on|in|for|with|and|over)\b|[,?.]|$)/i);
  const topic = (m?.[1] ?? "this product").replace(/^(a|an|the|our)\s+/i, "").trim();
  const price = decision.match(/₹\s?\d+/)?.[0];
  const extra = /₹\s?\d+\s*(extra|more)/i.test(decision);
  const questions: DraftedQuestion[] = [
    {
      question: `How likely are you to choose ${topic}${price ? (extra ? ` if it costs ${price} more` : ` at ${price}`) : ", even if it costs more"}? (1–5)`,
      hypothesis: `People say they would choose ${topic} more often than they actually do once it costs more.`,
      rationale: "Tied straight to the decision: will people pay for it? It's the question the decision depends on most.",
    },
    {
      question: `How important is ${topic} to you when you buy? (1–5)`,
      hypothesis: `Stated importance of ${topic} is higher than its effect on what people buy.`,
      rationale: "The question most brand teams ask first. It sets the baseline the redesign has to beat.",
    },
    {
      question: "How often do you buy products like this?",
      hypothesis: "How often people buy decides how big the opportunity is.",
      rationale: "Sizes the opportunity: a strong preference matters little if purchases are rare.",
    },
  ];
  return { questions, chosen: 0 };
}
