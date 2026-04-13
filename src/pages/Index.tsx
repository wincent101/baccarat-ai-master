import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { BaccaratResult, PredictionResult, predict, computeStats, learnFromOutcome, Signal, getSignalTracker } from "@/lib/baccaratEngine";
import { PredictionDisplay } from "@/components/PredictionDisplay";
import { GameHistory } from "@/components/GameHistory";
import { StatsPanel } from "@/components/StatsPanel";
import { ResultButtons } from "@/components/ResultButtons";

export default function Index() {
  const [history, setHistory] = useState<BaccaratResult[]>([]);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const lastSignalsRef = useRef<Signal[]>([]);

  // คำนวณ recent accuracy สำหรับ adaptive skip
  const recentAccuracy = useMemo(() => {
    const last20 = history.slice(-20);
    const last20Pred = predictions.slice(-20);
    let correct = 0, attempted = 0;
    for (let i = 0; i < Math.min(last20.length, last20Pred.length); i++) {
      if (last20Pred[i] === "Skip" || last20[i] === "Tie") continue;
      attempted++;
      if (last20Pred[i] === last20[i]) correct++;
    }
    return attempted > 0 ? correct / attempted : 0.5;
  }, [history, predictions]);

  const currentPrediction = useMemo(() => {
    if (history.length < 1) return null;
    const pred = predict(history, recentAccuracy);
    lastSignalsRef.current = pred.signals;
    return pred;
  }, [history, recentAccuracy]);

  const stats = useMemo(() => computeStats(history, predictions), [history, predictions]);

  const handleResult = useCallback((result: BaccaratResult) => {
    setHistory((prev) => {
      const prevPred = predict(prev, recentAccuracy);
      
      // สอน AI จากผลจริง
      learnFromOutcome(prevPred.signals, prevPred.result, result);
      
      setPredictions((current) => [...current, prevPred.result]);
      return [...prev, result];
    });
  }, [recentAccuracy]);

  const handleUndo = useCallback(() => {
    setHistory((prev) => prev.slice(0, -1));
    setPredictions((prev) => prev.slice(0, -1));
  }, []);

  const handleReset = useCallback(() => {
    setHistory([]);
    setPredictions([]);
    getSignalTracker().reset();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      const key = event.key.toUpperCase();
      if (key === "P") handleResult("Player");
      if (key === "B") handleResult("Banker");
      if (key === "T") handleResult("Tie");
      if (key === "Z" && (event.ctrlKey || event.metaKey)) handleUndo();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleResult, handleUndo]);

  return (
    <div className="min-h-screen pb-8">
      <header className="pt-8 pb-6 text-center">
        <h1 className="font-display text-3xl font-bold tracking-wide text-gold-gradient md:text-4xl">
          BACCARAT AI
        </h1>
        <p className="mt-1 text-sm uppercase tracking-widest text-muted-foreground">
          ระบบทำนายอัจฉริยะ
        </p>
        <div className="mx-auto mt-3 h-0.5 w-24 bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="mt-3 inline-flex rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs text-gold">
          โหมดลดผิด: ถ้าไม่มั่นใจจะ SKIP อัตโนมัติ
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          กด <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">P</kbd>{" "}
          <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">B</kbd>{" "}
          <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">T</kbd> บนคีย์บอร์ด
        </p>
      </header>

      <div className="container mx-auto max-w-lg space-y-5 px-4">
        <PredictionDisplay prediction={currentPrediction} />
        <ResultButtons onResult={handleResult} onUndo={handleUndo} onReset={handleReset} canUndo={history.length > 0} />
        <StatsPanel stats={stats} />
        <GameHistory history={history} predictions={predictions} />
      </div>
    </div>
  );
}
