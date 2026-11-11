import type { Screen } from "@/lib/session/engine";

export type { Screen };

export interface LiveQuality {
  score: number;
  band: "green" | "amber" | "red";
  cusum: number;
  signals: string[];
}

export interface Results {
  posterior: {
    wtpFunctional: { median: number; lo: number; hi: number };
    wtpCraving: { median: number; lo: number; hi: number };
    driver: string;
    importance: { price: number; protein: number; taste: number };
    pContextSwitch: number;
  } | null;
  divergence: {
    revealedIndex: number;
    stated: number | null;
    sayDoGap: number | null;
    shelfProteinShare: number | null;
    proteinPickRate: number;
    selfVsCrowd: number | null;
  };
  stated: number | null;
  rounds: number;
  points: number;
  rewards: import("./RewardToast").RewardEvent[];
  bid: { rounds: { momentId: string; bid: number; randomPrice: number; won: boolean }[]; coins: number } | null;
  peek: { reveals: { snackId: string; attr: string }[]; choice: string | null } | null;
  bonus: { skipped: boolean } | null;
  week: { freq: Record<string, number>; overall: number; consistency: number | null } | null;
  bar: { alloc: Record<string, number>; final: Record<string, number>; name: string } | null;
  rotation: string[];
  crowd: { guessPct: number; actualPct: number | null } | null;
  followup: { type: string; question: string; answer: string | null } | null;
  quality: { score: number; band: string; signals: { label: string; detail: string; severity: number }[] };
}

export interface PlanStep {
  key: string;
  label: string;
}

export interface StepResponse {
  screen: Screen;
  plan?: PlanStep[];
  rewards?: { total: number; added: import("./RewardToast").RewardEvent[] };
  reveal?: { value: string; left: number } | null;
  nudge?: boolean;
  live?: LiveQuality;
  results?: Results | null;
  error?: string;
}
