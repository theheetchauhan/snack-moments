export type ContextKind = "functional" | "craving";

export interface Moment {
  id: string;
  label: string; // "4:30pm at your desk"
  scene: string; // one-line scene setting
  emoji: string;
  context: ContextKind;
}

export interface Snack {
  id: string;
  name: string;
  emoji: string;
  proteinG: number;
  /** 0 = plain / functional taste, 1 = very indulgent */
  indulgence: number;
  basePrice: number;
  tasteCue: string; // shown when framing = taste
  /** tagged "virtuous" = the socially desirable pick */
  virtuous: boolean;
  sugarG: number;
  kcal: number;
}

export interface Option {
  snackId: string;
  price: number;
}

export type ProbeType = "none" | "repeat" | "dominated";

/** Presentation format of a choice item: 3-card triad or 2-card head-to-head duel. */
export type ItemFormat = "triad" | "duel";

export interface Item {
  id: string;
  momentId: string;
  options: Option[];
  format: ItemFormat;
  probe: ProbeType;
  /** for repeat probes: the original item id */
  repeatOf?: string;
  /** for dominated probes: index (in options) of the dominated option */
  dominatedIndex?: number;
}

export type FramingArm = "health" | "taste";
export type AnchorArm = "low" | "high";

export interface StudyDefinition {
  id: string;
  version: number;
  brand: string;
  title: string;
  originalQuestion: string;
  constructId: string;
  moments: Moment[];
  snacks: Snack[];
  items: Item[];
}
