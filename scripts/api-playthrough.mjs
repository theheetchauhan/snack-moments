// Plays one full session against the running dev server through the public API.
const base = process.argv[2] ?? "http://localhost:3000";
const post = async (path, body) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(path + " " + r.status + " " + JSON.stringify(j));
  return j;
};
let j = await post("/api/sessions", { segment: "gym-goer", deviceHash: "dev_script" });
const id = j.sessionId;
console.log("session", id, "framing", j.framing, "plan:", j.plan.map((p) => p.key).join(" > "));
let screen = j.screen;
const step = async (kind, payload) => { const r = await post(`/api/sessions/${id}/step`, { kind, payload }); screen = r.screen; return r; };
while (screen.kind !== "done") {
  if (screen.kind === "label") {
    console.log("label:", screen.questions.map(q => q.prompt).join(" | "));
    await step("label", { answers: screen.questions.map(q => ({ value: q.options[0], ms: 2400 })), peekMs: 5000 });
  } else if (screen.kind === "gut") {
    await step("gut", { swipes: screen.cards.map((c, i) => ({ snackId: c.snack.id, right: c.snack.proteinG > 8, ms: 900 + i * 50, reversals: 0 })) });
    console.log("gut: swiped", screen.kind);
  } else if (screen.kind === "peek") {
    for (const attr of ["protein", "price"]) for (const sn of screen.snacks.slice(0, 2)) {
      const r = await post(`/api/sessions/${id}/step`, { kind: "peek_reveal", payload: { snackId: sn.id, attr } });
      console.log("peek", sn.id, attr, "=>", r.reveal?.value, "left", r.reveal?.left);
    }
    await step("peek", { choice: screen.snacks[0].id, ms: 9000 });
  } else if (screen.kind === "bid") {
    const r = await step("bid", { bids: screen.rounds.map((x, i) => ({ momentId: x.momentId, bid: i ? 30 : 80, ms: 5000, adjustments: 2 })) });
    console.log("bid rewards", JSON.stringify(r.rewards));
  } else if (screen.kind === "bonus") {
    await step("bonus", { guesses: [0, 1], skipped: false, ms: 6000 });
  } else if (screen.kind === "round") {
    // a protein-loving player: pick highest protein
    const best = screen.options.reduce((a, b) => (b.snack.proteinG > a.snack.proteinG ? b : a));
    const r = await step("answer", { itemId: screen.itemId ?? "", position: best.position, latencyMs: 4200, changes: 0, focusCount: 1, tapCancels: 0, firstTouchMs: 1800 });
    if (r.rewards?.added?.length) console.log("  rewards:", r.rewards.added.map(x => x.label + " +" + x.points).join(", "), "total", r.rewards.total);
    console.log(`round ${r.live ? "Q=" + r.live.score + " " + r.live.band + " cusum " + r.live.cusum : ""} next=${screen.kind}${screen.kind === "round" ? " [" + screen.format + "/" + screen.reason + "] " + screen.moment.label : ""}`);
  } else if (screen.kind === "shelf") {
    console.log("shelf prices", screen.items.map(i => i.snack.id + "=" + i.price).join(", "));
    const basket = { protein_bar: 2, greek_yogurt: 1, masala_chips: 2 };
    await step("shelf", { basket, removed: [{ snackId: "masala_chips", price: 20, order: 0 }], finalBasket: { ...basket, masala_chips: 1 }, ms: 20000 });
  } else if (screen.kind === "week") {
    const freq = Object.fromEntries(screen.moments.map((m) => [m.id, m.context === "functional" ? 3.5 : 1.5]));
    const r = await step("week", { freq, overall: 11, changes: 1, ms: 15000 });
    console.log("week done, plan:", r.plan.map((p) => p.key).join(" > "));
  } else if (screen.kind === "bar") {
    const alloc = { protein: 4, lowSugar: 2, taste: 2, lowPrice: 1, size: 1 };
    const final = { protein: 4, lowSugar: 1, taste: 2, lowPrice: 0, size: 0 };
    const r = await step("bar", { alloc, final, cutOrder: ["size", "lowPrice", "lowSugar"], moves: 13, ms: 25000 });
    console.log("bar rewards", r.rewards.added.map((x) => x.label).join(" | "));
  } else if (screen.kind === "crowd") {
    await step("crowd", { guessPct: 40, adjustments: 2, ms: 5000, bonus: { guesses: [0, 1], skipped: false, ms: 4000 } });
  } else if (screen.kind === "reality") {
    await step("reality", { category: "Protein bar / protein snack", why: "needed protein after training", typingMs: 6000, pasted: false, backspaces: 2 });
  } else if (screen.kind === "stated") {
    const r = await step("stated", { value: 5 });
    if (r.results) console.log("POINTS", r.results.points, r.results.rewards.map(x => x.label + " +" + x.points).join(" | "));
  } else if (screen.kind === "followup") {
    console.log("followup:", screen.question);
    const r = await step("followup", { answer: screen.options[0] });
    if (r.results) console.log("POINTS", r.results.points, r.results.rewards.map(x => x.label + " +" + x.points).join(" | "));
  } else throw new Error("unknown " + screen.kind);
}
console.log("done");
