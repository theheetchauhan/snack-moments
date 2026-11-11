"use client";
/** Full-screen play of the game the Question Lab just designed (handed over via session storage). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { GamePreview } from "@/components/studio/GamePreview";
import type { GameSpecT } from "@/lib/studio/contract";

export default function LabPlay() {
  const [game, setGame] = useState<{ spec: GameSpecT; mechanic: string } | null | "none">(null);
  useEffect(() => {
    document.title = "Lab game · Snack Moments";
    try {
      const raw = sessionStorage.getItem("lab-game");
      setGame(raw ? JSON.parse(raw) : "none");
    } catch {
      setGame("none");
    }
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
      <Link href="/studio" className="self-start text-sm text-muted underline">
        ← Back to the Question Lab
      </Link>
      {game === "none" ? (
        <p className="mt-20 text-center text-muted">No game here yet. Run the engine in the Question Lab, then open it from Step 4.</p>
      ) : game ? (
        <div className="w-full max-w-sm">
          <GamePreview spec={game.spec} mechanic={game.mechanic} />
          <p className="mt-3 text-center text-xs text-muted">Designed by the Question Lab. Hidden checks and scoring run in the background in a live study.</p>
        </div>
      ) : null}
    </main>
  );
}
