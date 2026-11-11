"use client";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface RewardEvent {
  id: string;
  kind: "progress" | "gift" | "skill" | "bonus" | "quality" | "badge";
  label: string;
  points: number;
  emoji: string;
  at: string;
}

export interface ToastLine {
  emoji: string;
  label: string;
  points: number;
}

export interface Toast {
  id: string;
  lines: ToastLine[];
}

/**
 * One small toast per step with everything earned in that step (points, gift, badge, level-up).
 * It never blocks play, disappears on its own, and a newer toast replaces the old one,
 * so rewards never stack up on screen.
 */
export function RewardToast({ toast, onDone }: { toast: Toast | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  const total = toast?.lines.reduce((a, l) => a + l.points, 0) ?? 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4" role="status" aria-live="polite">
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full max-w-sm rounded-2xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg"
          >
            <div className="flex items-start gap-3">
              <ul className="min-w-0 flex-1 space-y-0.5">
                {toast.lines.map((l, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span aria-hidden>{l.emoji}</span>
                    <span className="truncate">{l.label}</span>
                  </li>
                ))}
              </ul>
              {total > 0 && <b className="shrink-0 font-display text-lg text-butter">+{total}</b>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
