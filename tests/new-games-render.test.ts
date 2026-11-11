import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MySnackWeek } from "@/components/play/games/MySnackWeek";
import { BuildABar } from "@/components/play/games/BuildABar";
import { GuessTheCrowd } from "@/components/play/games/GuessTheCrowd";
import { createSession, nextScreen } from "@/lib/session/engine";
import type { Tracker } from "@/lib/events/tracker";

const tracker = { track: () => {} } as unknown as Tracker;

function screenAt(stage: "week" | "bar" | "crowd") {
  const s = createSession({ id: `render_${stage}`, participantId: "p", deviceHash: "d", ipHash: "i", segment: "gym-goer", now: 0 });
  s.stage = stage;
  return nextScreen(s, 0);
}

describe("new game screens render from real engine screens", () => {
  it("My Snack Week starts with the whole-week check", () => {
    const scr = screenAt("week");
    if (scr.kind !== "week") throw new Error("expected week screen");
    const html = renderToStaticMarkup(createElement(MySnackWeek, { screen: scr, tracker, busy: false, onSubmit: () => {} }));
    expect(html).toContain("how many snacks do you have in a normal week");
    expect(html).toContain("15+");
  });

  it("Build-a-Bar shows all five attributes and the 10-point budget", () => {
    const scr = screenAt("bar");
    if (scr.kind !== "bar") throw new Error("expected bar screen");
    const html = renderToStaticMarkup(createElement(BuildABar, { screen: scr, tracker, busy: false, onSubmit: () => {} }));
    for (const label of ["Protein", "Less sugar", "Indulgent taste", "Lower price", "Bigger size"]) expect(html).toContain(label);
    expect(html).toContain("10 points left to spend");
    expect(html).toContain("The Plain Bar");
  });

  it("Guess the Crowd shows the bonus questions on the same screen (one step)", () => {
    const scr = screenAt("crowd");
    if (scr.kind !== "crowd") throw new Error("expected crowd screen");
    const html = renderToStaticMarkup(createElement(GuessTheCrowd, { screen: scr, tracker, busy: false, onSubmit: () => {} }));
    expect(html).toContain("Out of 100 players");
    expect(html).toContain("Bonus: which did more players pick?");
  });
});
