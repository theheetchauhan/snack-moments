/**
 * Synthetic respondents for DEMO DATA and tests only — never for validation.
 * Each archetype has known "true" parameters so we can check parameter recovery
 * and that quality scoring separates careless play from genuine-but-contradictory play.
 */
import { choiceProbs } from "@/lib/model/choice";
import { normal, rngFrom, type Rng } from "@/lib/rng";
import { getItem, getMoment, getSnack } from "@/lib/study/protein";
import {
  buildLabelTask,
  createSession,
  modelImpliedPrice,
  nextScreen,
  revealPeek,
  submitBid,
  submitBonus,
  submitGut,
  submitLabel,
  submitPeek,
  REALITY_CATEGORIES,
  submitAnswer,
  submitCrowd,
  submitFollowup,
  submitReality,
  submitShelf,
  submitStated,
  submitWeek,
  submitBar,
  SHELF_BUDGET,
  SQUEEZE_BUDGET,
  WEEK_BANDS,
  WEEK_OVERALL,
  BAR_BUDGET,
  BAR_SQUEEZE,
  BAR_MAX_LEVEL,
  type Screen,
} from "@/lib/session/engine";
import { BAR_KEYS } from "@/lib/study/bar";
import type { Coverage } from "@/lib/adaptive/rotation";
import type { PeekAttr, SessionData } from "@/lib/session/types";

export type Archetype = "price_led" | "taste_led" | "protein_led" | "context_switcher" | "desirability_faker" | "rusher" | "position_tapper" | "rhythm_tapper" | "bot_ring";

export interface Theta {
  a: number;
  bF: number;
  bC: number;
  c: number;
}

export const TRUE_THETA: Record<"price_led" | "taste_led" | "protein_led" | "context_switcher", Theta> = {
  price_led: { a: 1.3, bF: 0.35, bC: 0.15, c: 0.5 },
  taste_led: { a: 0.35, bF: 0.15, bC: 0.0, c: 2.4 },
  protein_led: { a: 0.3, bF: 1.7, bC: 1.3, c: 0.3 },
  context_switcher: { a: 0.45, bF: 1.9, bC: -0.3, c: 1.0 },
};

export const ARCHETYPE_MIX: [Archetype, number][] = [
  ["price_led", 0.24],
  ["taste_led", 0.18],
  ["protein_led", 0.13],
  ["context_switcher", 0.17],
  ["desirability_faker", 0.1],
  ["rusher", 0.07],
  ["position_tapper", 0.04],
  ["rhythm_tapper", 0.03],
  ["bot_ring", 0.04],
];

const SEGMENTS = ["18–24 student", "25–34 working", "35+ working", "gym-goer"];

export function drawArchetype(rng: Rng): Archetype {
  let u = rng();
  for (const [a, p] of ARCHETYPE_MIX) {
    if ((u -= p) <= 0) return a;
  }
  return "price_led";
}

function personalTheta(arch: Archetype, rng: Rng): Theta | null {
  const base = arch === "desirability_faker" ? (rng() < 0.5 ? TRUE_THETA.price_led : TRUE_THETA.taste_led) : (TRUE_THETA as Record<string, Theta>)[arch];
  if (!base) return null;
  return {
    a: base.a * Math.exp(normal(rng, 0, 0.15)),
    bF: base.bF + normal(rng, 0, 0.15),
    bC: base.bC + normal(rng, 0, 0.15),
    c: base.c + normal(rng, 0, 0.15),
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export interface SimOptions {
  index: number;
  now: number;
  archetype?: Archetype;
  /** if true, also returns the synthetic event stream */
  withEvents?: boolean;
  /** running population counts so the rotation balances across the simulated sample */
  coverage?: Coverage | null;
  /**
   * Real-world messiness for demo data: players quit part-way, attention varies between genuine
   * players, and daily traffic is uneven. Off in tests, so test thresholds stay strict.
   */
  realistic?: boolean;
}

/** Chance of quitting when a screen appears (per question for the adaptive rounds). */
const QUIT_CHANCE: Record<string, number> = {
  label: 0.02,
  gut: 0.015,
  peek: 0.03,
  week: 0.04,
  bid: 0.04,
  shelf: 0.06,
  bar: 0.07,
  crowd: 0.02,
  reality: 0.03,
  stated: 0.01,
  followup: 0.02,
};
/** Relative traffic for each of the last 7 days (oldest first): uneven, like a real launch week. */
const DAY_WEIGHTS = [0.08, 0.11, 0.19, 0.15, 0.1, 0.23, 0.14];

export interface SimEvent {
  type: string;
  round: number | null;
  payload: Record<string, unknown>;
  ts: number;
}

export function simulateSession(opts: SimOptions): {
  session: SessionData;
  theta: Theta | null;
  events: SimEvent[];
} {
  const rng = rngFrom(`sim:${opts.index}:${opts.now}`);
  const arch = opts.archetype ?? drawArchetype(rng);
  const theta = personalTheta(arch, rng);
  const isBot = arch === "bot_ring";
  const segment =
    arch === "protein_led" || arch === "context_switcher" ? (rng() < 0.6 ? "gym-goer" : SEGMENTS[Math.floor(rng() * 3)]) : SEGMENTS[Math.floor(rng() * SEGMENTS.length)];
  const DAY = 1000 * 60 * 60 * 24;
  let startOffset = Math.floor(rng() * DAY * 6); // spread over ~6 days
  if (opts.realistic) {
    let u = rng();
    let d = DAY_WEIGHTS.length - 1;
    for (let i = 0; i < DAY_WEIGHTS.length; i++)
      if ((u -= DAY_WEIGHTS[i]) <= 0) {
        d = i;
        break;
      }
    const daysAgo = DAY_WEIGHTS.length - 1 - d;
    startOffset = Math.floor((daysAgo + rng() * 0.95) * DAY);
  }
  let t = opts.now - startOffset;
  if (isBot) t = opts.now - 1000 * 60 * 60 * 30 + opts.index * 45_000; // burst
  const id = `sim_${opts.index}_${Math.floor(rng() * 1e9).toString(36)}`;
  const s = createSession({
    id,
    participantId: isBot ? `bot_${opts.index}` : `p_${opts.index}`,
    deviceHash: isBot ? "dev_ring_7f3a" : `dev_${Math.floor(rng() * 1e12).toString(36)}`,
    ipHash: isBot ? "ip_ring_10.4" : `ip_${Math.floor(rng() * 1e9).toString(36)}`,
    segment,
    now: t,
    simulated: true,
    archetype: arch,
  });
  const events: SimEvent[] = [];
  const ev = (type: string, round: number | null, payload: Record<string, unknown> = {}) => opts.withEvents && events.push({ type, round, payload, ts: t });
  ev("session_start", null, { framing: s.framing, anchor: s.anchor, segment });
  const pace = Math.exp(normal(rng, 0, 0.2));
  // how attentive this genuine player is: most are focused, about 1 in 4 is distracted (phone, TV…)
  const attention = opts.realistic && theta ? (rng() < 0.25 ? 0.35 + rng() * 0.3 : 0.75 + rng() * 0.25) : 1;
  const lapse = () => rng() < (1 - attention) * 0.65; // a moment of not paying attention

  // ---- Label Detective (memory): price is noticed more than protein, unless you care about protein ----
  const ctx = { coverage: opts.coverage ?? null };
  const playLabel = (lab: Extract<Screen, { kind: "label" }>) => {
    const answers = lab.questions.map((q) => {
      const correct = buildLabelTask(s.id).questions.find((x) => x.snackId === q.snackId && x.kind === q.kind)!.correct;
      const pCorrect = !theta ? 0.25 : q.kind === "price" ? 0.72 : arch === "protein_led" || arch === "context_switcher" ? 0.7 : 0.38;
      const value = rng() < pCorrect ? correct : q.options.filter((o) => o !== correct)[Math.floor(rng() * 3)];
      return { value, ms: theta ? 2500 + rng() * 3000 : 500 + rng() * 400 };
    });
    t += 5000 + answers.reduce((a, b) => a + b.ms, 0);
    ev("label_answered", null, { answers });
    submitLabel(s, { answers, peekMs: 8000 });
  };

  // ---- Gut Check (swipe): fast reactions; protein appeal is "liked" more in gut than in considered choices ----
  const playGut = (gut: Extract<Screen, { kind: "gut" }>) => {
    const swipes = gut.cards.map((c, i) => {
      let right: boolean;
      let ms: number;
      if (theta) {
        const appeal = theta.c * c.snack.indulgence + ((theta.bF + theta.bC) / 2) * (c.snack.proteinG / 10) * 0.8 + (c.snack.virtuous ? 0.35 : 0) - 0.9;
        right = rng() < sigmoid(appeal * 1.6);
        ms = lapse() ? 250 + rng() * 150 : 700 + rng() * 900;
      } else if (arch === "position_tapper") {
        right = true;
        ms = 250 + rng() * 100;
      } else if (isBot) {
        right = i % 2 === 0;
        ms = 400;
      } else {
        right = rng() < 0.5;
        ms = 200 + rng() * 200;
      }
      t += ms;
      ev("gut_swipe", null, { snackId: c.snack.id, right, ms: Math.round(ms) });
      return {
        snackId: c.snack.id,
        right,
        ms,
        reversals: theta && rng() < 0.12 ? 1 : 0,
      };
    });
    submitGut(s, { swipes });
  };

  // ---- Peek & Pick (process tracing): look first at what matters most to you ----
  const playPeek = (pk: Extract<Screen, { kind: "peek" }>) => {
    const order: PeekAttr[] = theta
      ? (
          [
            ["price", theta.a * 10 + normal(rng, 0, 1.2)],
            ["protein", ((theta.bF + theta.bC) / 2) * 2.3 + (arch === "desirability_faker" ? 0.4 : 0) + normal(rng, 0, 1.2)],
            ["taste", theta.c * 0.85 + normal(rng, 0, 1.2)],
            ["sugar", 0.3 + normal(rng, 0, 1)],
          ] as [PeekAttr, number][]
        )
          .sort((x, y) => y[1] - x[1])
          .map((x) => x[0])
      : (["price", "protein", "taste", "sugar"].sort(() => rng() - 0.5) as PeekAttr[]);
    const nPeeks = theta ? 3 + (rng() < 0.6 ? 1 : 0) : Math.floor(rng() * 2);
    const cells: { snackId: string; attr: PeekAttr }[] = [];
    for (const attr of order) for (const sn of pk.snacks) if (cells.length < nPeeks) cells.push({ snackId: sn.id, attr });
    for (const c of cells) {
      t += theta ? 900 + rng() * 1500 : 300;
      revealPeek(s, c, t);
      ev("peek_reveal", null, c);
    }
    let choice = pk.snacks[Math.floor(rng() * pk.snacks.length)].id;
    if (theta) {
      const scored = pk.snacks.map((x) => {
        const sn = getSnack(x.id);
        return {
          id: x.id,
          u: -theta.a * (sn.basePrice / 10) + theta.bF * (sn.proteinG / 10) + theta.c * sn.indulgence + normal(rng, 0, 0.3),
        };
      });
      choice = scored.sort((x, y) => y.u - x.u)[0].id;
    }
    t += theta ? 2000 : 400;
    submitPeek(s, { choice, ms: theta ? 12_000 : 1500 });
  };

  // ---- adaptive rounds ----
  const playRound = (scr: Extract<Screen, { kind: "round" }>) => {
    const item = getItem(scr.itemId);
    const ctx = getMoment(item.momentId).context;
    let position: number;
    let latency: number;
    const expected = s.pendingExpectedMs!;
    if (theta) {
      const feats = scr.options.map((o) => ({
        price: o.price,
        protein: o.snack.proteinG,
        indulgence: o.snack.indulgence,
      }));
      // framing shifts protein salience a little (the causal effect we try to recover)
      const frameBoost = s.framing === "health" ? 0.25 : 0;
      const th = {
        ...theta,
        bF: theta.bF + frameBoost,
        bC: theta.bC + frameBoost,
      };
      const pr = choiceProbs(th, ctx, feats, 0.03);
      let u = rng();
      position = pr.length - 1;
      for (let i = 0; i < pr.length; i++) {
        if ((u -= pr[i]) <= 0) {
          position = i;
          break;
        }
      }
      latency = expected * pace * Math.exp(normal(rng, 0, 0.3));
      if (lapse()) {
        // distracted moment: answers too fast, sometimes without really looking
        latency = expected * (0.18 + rng() * 0.2);
        if (rng() < 0.5) position = Math.floor(rng() * scr.options.length);
      } else if (opts.realistic && rng() < (attention < 0.7 ? 0.08 : 0.02)) {
        // looked away mid-question (a message, the TV): a very slow answer, not careless
        latency = expected * (3.2 + rng() * 3);
      }
    } else if (arch === "rusher") {
      // careless players don't read, so their timing barely depends on how hard the question is
      position = Math.floor(rng() * scr.options.length);
      latency = 900 * Math.exp(normal(rng, 0, 0.3));
    } else if (arch === "position_tapper") {
      position = rng() < 0.92 ? 0 : 1;
      latency = 1400 * Math.exp(normal(rng, 0, 0.25));
    } else if (arch === "rhythm_tapper") {
      position = s.answers.length % scr.options.length;
      latency = 2200 * Math.exp(normal(rng, 0, 0.2));
    } else {
      // bot ring: identical scripted pattern and near-constant timing
      position = [0, 2, 1][s.answers.length % 3] % scr.options.length;
      latency = 700 + rng() * 40;
    }
    const careful = !!theta;
    const firstTouch = Math.round(latency * (careful ? 0.55 : 0.8));
    ev("item_shown", scr.round, {
      itemId: scr.itemId,
      expectedMs: Math.round(expected),
      reason: scr.reason,
    });
    t += firstTouch;
    ev("first_touch", scr.round, { ms: firstTouch });
    const focusCount = careful ? Math.floor(rng() * 3) : 0;
    const changes = careful && rng() < 0.18 ? 1 : 0;
    for (let f = 0; f < focusCount; f++) ev("option_focus", scr.round, { position: Math.floor(rng() * 3) });
    if (changes) ev("option_change", scr.round, {});
    t += Math.round(latency - firstTouch);
    ev("option_select", scr.round, { position });
    ev("confirm", scr.round, { position, latencyMs: Math.round(latency) });
    const r = submitAnswer(s, {
      itemId: scr.itemId,
      position,
      latencyMs: latency,
      changes,
      focusCount,
      tapCancels: careful && rng() < 0.1 ? 1 : 0,
      firstTouchMs: firstTouch,
    });
    if (r.nudge) ev("nudge_shown", scr.round, {});
    t += 600;
  };

  // ---- Bid It (BDM): genuine players bid near their true value; fakers inflate the "healthy" bid ----
  const playBid = (bidScr: Extract<Screen, { kind: "bid" }>) => {
    const bids = bidScr.rounds.map((r) => {
      const ctx = getMoment(r.momentId).context;
      let bid: number;
      if (theta) {
        const truth = modelImpliedPrice({ mean: theta }, ctx);
        bid = truth * Math.exp(normal(rng, 0, 0.2)) + (arch === "desirability_faker" && ctx === "functional" ? 35 : 0);
      } else bid = rng() * 150;
      return {
        momentId: r.momentId,
        bid: Math.max(0, Math.min(150, Math.round(bid / 5) * 5)),
        ms: theta ? 6000 + rng() * 6000 : 900,
        adjustments: theta ? 1 + Math.floor(rng() * 4) : 0,
      };
    });
    ev("bid_submitted", null, { bids });
    t += bids.reduce((a, b) => a + b.ms, 0);
    submitBid(s, { bids });
  };

  // ---- shelf + squeeze ----
  const playShelf = (shelf: Extract<Screen, { kind: "shelf" }>) => {
    const basket: Record<string, number> = {};
    let spent = 0;
    const util = (snackId: string, price: number) => {
      const sn = getSnack(snackId);
      if (!theta) return rng();
      const b = (theta.bF + theta.bC) / 2;
      return -theta.a * (price / 10) + b * (sn.proteinG / 10) + theta.c * sn.indulgence + normal(rng, 0, 0.4);
    };
    for (let k = 0; k < 20; k++) {
      const affordable = shelf.items.filter((i) => spent + i.price <= SHELF_BUDGET);
      if (!affordable.length) break;
      const scored = affordable.map((i) => ({
        i,
        u: util(i.snack.id, i.price) + (basket[i.snack.id] ?? 0) * -0.35,
      }));
      scored.sort((x, y) => y.u - x.u);
      const pickIt = theta ? scored[0].i : affordable[Math.floor(rng() * affordable.length)];
      basket[pickIt.snack.id] = (basket[pickIt.snack.id] ?? 0) + 1;
      spent += pickIt.price;
      ev("shelf_add", null, { snackId: pickIt.snack.id });
    }
    const final = { ...basket };
    const removed: { snackId: string; price: number; order: number }[] = [];
    const priceOf = new Map(shelf.items.map((i) => [i.snack.id, i.price]));
    let order = 0;
    while (spent > SQUEEZE_BUDGET) {
      const inBasket = Object.entries(final).filter(([, q]) => q > 0);
      const ranked = inBasket
        .map(([id]) => ({
          id,
          u: theta ? util(id, priceOf.get(id)!) / Math.sqrt(priceOf.get(id)!) : rng(),
        }))
        .sort((x, y) => x.u - y.u);
      const cut = ranked[0].id;
      final[cut]--;
      spent -= priceOf.get(cut)!;
      removed.push({ snackId: cut, price: priceOf.get(cut)!, order: order++ });
      ev("squeeze_remove", null, { snackId: cut });
    }
    t += theta ? 25_000 + rng() * 20_000 : 5_000;
    submitShelf(s, {
      basket,
      removed,
      finalBasket: final,
      ms: theta ? 30_000 : 5_000,
    });
  };

  // ---- crowd ----
  const playCrowd = () => {
    const trueP = theta ? sigmoid((theta.bF - 0.6) * 1.8) : 0.5;
    const guess = arch === "desirability_faker" ? 20 + rng() * 15 : theta ? Math.max(5, Math.min(95, 100 * (0.5 * trueP + 0.2) + normal(rng, 0, 12))) : rng() * 100;
    ev("crowd_guess", null, { guessPct: Math.round(guess) });
    submitCrowd(s, {
      guessPct: guess,
      adjustments: theta ? 1 + Math.floor(rng() * 3) : 0,
      ms: theta ? 6000 : 1200,
    });
  };

  // ---- optional bonus round (some players skip it) ----
  const playBonus = () => {
    const skip = theta ? rng() < 0.18 : rng() < 0.5;
    const guesses = [0, 1].map(() => (rng() < 0.5 ? 0 : 1));
    ev(skip ? "bonus_skipped" : "bonus_played", null, {});
    submitBonus(s, {
      guesses,
      skipped: skip,
      ms: skip ? 800 : theta ? 7000 : 1500,
    });
  };

  // ---- reality ----
  const playReality = () => {
    const cat =
      arch === "protein_led"
        ? REALITY_CATEGORIES[4]
        : arch === "taste_led"
          ? REALITY_CATEGORIES[rng() < 0.5 ? 1 : 2]
          : REALITY_CATEGORIES[Math.floor(rng() * REALITY_CATEGORIES.length)];
    const whyText =
      theta && rng() < 0.5 ? ["Was hungry and it was cheap", "Felt like something crunchy", "Needed protein after training", "It was on offer"][Math.floor(rng() * 4)] : "";
    submitReality(s, {
      category: cat,
      why: whyText,
      typingMs: whyText ? 4000 + rng() * 5000 : 0,
      pasted: isBot && rng() < 0.5,
      backspaces: whyText ? Math.floor(rng() * 4) : 0,
    });
  };

  // ---- stated (everyone inflates a bit: that's the social-desirability effect) ----
  const playStated = () => {
    const stated =
      arch === "desirability_faker" || isBot
        ? 5
        : theta
          ? Math.round(Math.max(1, Math.min(5, 1 + 4 * sigmoid(theta.bF * 1.4 - 0.4) + 0.9 + normal(rng, 0, 0.4))))
          : 1 + Math.floor(rng() * 5);
    ev("rating_submitted", null, { value: stated });
    submitStated(s, stated);
  };

  // ---- follow-up ----
  const playFollowup = () => {
    if (s.stage === "followup" && s.followup) {
      const opts = s.followup.options;
      let ans = opts[Math.floor(rng() * opts.length)];
      if (theta && s.followup.type === "stated_vs_revealed") ans = arch === "taste_led" || (arch === "desirability_faker" && theta.c > 1) ? opts[1] : opts[0];
      if (arch === "context_switcher" && s.followup.type === "context_switch") ans = opts[rng() < 0.6 ? 0 : 1];
      ev("followup_answered", null, { type: s.followup.type, answer: ans });
      submitFollowup(s, ans, t + 4000);
    }
  };

  // ---- My Snack Week: frequency per moment; the "whole week" check is answered first ----
  const playWeek = (wk: Extract<Screen, { kind: "week" }>) => {
    const band = (x: number) => WEEK_BANDS.reduce((b, c) => (Math.abs(c.value - x) < Math.abs(b.value - x) ? c : b)).value;
    const freq: Record<string, number> = {};
    let changes = 0;
    for (const m of wk.moments) {
      let v: number;
      if (theta) {
        const gym = segment === "gym-goer";
        const base: Record<string, number> = {
          desk_430: 3.5,
          post_gym: gym ? 3.5 : 0.5,
          pre_meeting: 1.5,
          late_night: arch === "taste_led" ? 3.5 : 1.5,
          movie_night: 1.2,
          road_trip: 0.3,
        };
        v = band((base[m.id] ?? 1) * Math.exp(normal(rng, 0, 0.35)));
        if (rng() < 0.15) changes++;
      } else if (isBot) v = WEEK_BANDS[2].value;
      else v = WEEK_BANDS[Math.floor(rng() * WEEK_BANDS.length)].value;
      freq[m.id] = v;
    }
    const sum = Object.values(freq).reduce((a, b) => a + b, 0);
    const near = (x: number) => WEEK_OVERALL.reduce((b, c) => (Math.abs(c.value - x) < Math.abs(b.value - x) ? c : b)).value;
    const overall = theta ? near(sum * Math.exp(normal(rng, 0, 0.25))) : isBot ? WEEK_OVERALL[1].value : WEEK_OVERALL[Math.floor(rng() * WEEK_OVERALL.length)].value;
    const ms = theta ? 14_000 + rng() * 10_000 : 2500 + rng() * 1000;
    t += ms;
    ev("week_submitted", null, { overall, sum });
    submitWeek(s, { freq, overall, changes, ms });
  };

  // ---- Build-a-Bar: spend points by what you value; fakers design a "virtuous" bar they would not buy ----
  const playBar = () => {
    const w: Record<string, number> = theta
      ? {
          // fakers want to look healthy, so their designed bar leans on protein regardless of what they buy
          protein: Math.max(0.05, (theta.bF + theta.bC) / 2) + (arch === "desirability_faker" ? 1.2 : 0),
          lowSugar: 0.35 + (arch === "protein_led" || arch === "desirability_faker" ? 0.5 : 0),
          taste: Math.max(0.05, theta.c * 0.6),
          lowPrice: theta.a * 1.1,
          size: 0.3,
        }
      : Object.fromEntries(BAR_KEYS.map((k) => [k, rng()]));
    const lv: Record<string, number> = Object.fromEntries(BAR_KEYS.map((k) => [k, 0]));
    let moves = 0;
    for (let i = 0; i < BAR_BUDGET; i++) {
      const open = BAR_KEYS.filter((k) => lv[k] < BAR_MAX_LEVEL);
      const pick = theta
        ? open.map((k) => ({ k, u: w[k] / (1 + lv[k]) + normal(rng, 0, 0.08) })).sort((a, b) => b.u - a.u)[0].k
        : isBot
          ? open[i % open.length]
          : open[Math.floor(rng() * open.length)];
      lv[pick]++;
      moves++;
    }
    const alloc = { ...lv };
    const cutOrder: string[] = [];
    for (let i = 0; i < BAR_BUDGET - BAR_SQUEEZE; i++) {
      const have = BAR_KEYS.filter((k) => lv[k] > 0);
      const cut = theta ? have.map((k) => ({ k, u: w[k] / lv[k] + normal(rng, 0, 0.05) })).sort((a, b) => a.u - b.u)[0].k : have[Math.floor(rng() * have.length)];
      lv[cut]--;
      cutOrder.push(cut);
      moves++;
    }
    const ms = theta ? 20_000 + rng() * 15_000 : 3000 + rng() * 1500;
    t += ms;
    ev("bar_submitted", null, { alloc, final: lv });
    submitBar(s, { alloc, final: lv, cutOrder, moves, ms });
  };

  // ---- play whatever the engine serves next (the rotation decides the optional games) ----
  const careless = !theta && !isBot;
  const quits = (kind: string) => {
    if (!opts.realistic || isBot) return false;
    const base = kind === "round" ? 0.006 + 0.003 * s.answers.length : (QUIT_CHANCE[kind] ?? 0);
    const mult = careless ? 1.8 : attention < 0.7 ? 1.6 : 1;
    return rng() < base * mult;
  };
  for (let guard = 0; guard < 40; guard++) {
    const scr = nextScreen(s, t, ctx);
    if (scr.kind === "done") break;
    if (quits(scr.kind)) {
      s.status = "abandoned";
      ev("session_abandon", null, { at: scr.kind });
      break;
    }
    switch (scr.kind) {
      case "label":
        playLabel(scr);
        break;
      case "gut":
        playGut(scr);
        break;
      case "peek":
        playPeek(scr);
        break;
      case "week":
        playWeek(scr);
        break;
      case "round":
        playRound(scr);
        break;
      case "bid":
        playBid(scr);
        break;
      case "shelf":
        playShelf(scr);
        break;
      case "bar":
        playBar();
        break;
      case "crowd":
        playCrowd();
        break;
      case "bonus":
        playBonus();
        break;
      case "reality":
        playReality();
        break;
      case "stated":
        playStated();
        break;
      case "followup":
        playFollowup();
        break;
    }
  }
  if (s.completedAt == null && s.status === "completed") s.completedAt = t + 4000;
  if (opts.realistic && attention < 0.7 && rng() < 0.6) s.counters.hidden = 1 + Math.floor(rng() * 3); // switched apps
  // a few real-world distractions for genuine players
  if (theta && rng() < 0.15) s.counters.hidden = 1 + Math.floor(rng() * 2);
  ev("session_end", null, { status: s.status });
  return { session: s, theta, events };
}
