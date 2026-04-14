import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { BaccaratResult, PredictionResult, predict, computeStats, learnFromOutcome, logPrediction, Signal, getSignalTracker } from "@/lib/baccaratEngine";
import { getTrainingLog } from "@/lib/baccaratTrainingLog";
import { PredictionDisplay } from "@/components/PredictionDisplay";
import { GameHistory } from "@/components/GameHistory";
import { StatsPanel } from "@/components/StatsPanel";
import { ResultButtons } from "@/components/ResultButtons";

export default function Index() {
  const [history, setHistory] = useState<BaccaratResult[]>([]);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [logCount, setLogCount] = useState(0);

  const currentPrediction = useMemo(() => {
    if (history.length < 1) return null;
    return predict(history);
  }, [history]);

  const stats = useMemo(() => computeStats(history, predictions), [history, predictions]);

  const handleResult = useCallback((result: BaccaratResult) => {
    setHistory((prev) => {
      const prevPred = predict(prev);
      
      // สอน AI จากผลจริง
      learnFromOutcome(prev, prevPred.signals, prevPred.result, result);
      
      // บันทึก Training Log
      const newHistory = [...prev, result];
      logPrediction(newHistory, prevPred, result);
      setLogCount(getTrainingLog().getLength());
      
      setPredictions((current) => [...current, prevPred.result]);
      return newHistory;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((prev) => prev.slice(0, -1));
    setPredictions((prev) => prev.slice(0, -1));
  }, []);

  const handleReset = useCallback(() => {
    setHistory([]);
    setPredictions([]);
    getSignalTracker().reset();
    getTrainingLog().reset();
    setLogCount(0);
  }, []);

  const handleExportCSV = useCallback(() => {
    const csv = getTrainingLog().toCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baccarat_training_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportJSON = useCallback(() => {
    const json = getTrainingLog().toJSON();
    if (!json || json === "[]") return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baccarat_training_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  const logSummary = useMemo(() => getTrainingLog().getSummary(), [logCount]);

  return (
    <div className="min-h-screen pb-8">
      <header className="pt-8 pb-6 text-center">
        <h1 className="font-display text-3xl font-bold tracking-wide text-gold-gradient md:text-4xl">
          BACCARAT AI
        </h1>
        <p className="mt-1 text-sm uppercase tracking-widest text-muted-foreground">
          ระบบทำนายอัจฉริยะ + เก็บ Log เทรน
        </p>
        <div className="mx-auto mt-3 h-0.5 w-24 bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="mt-3 inline-flex rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs text-gold">
          🧠 AI เรียนรู้ทุกตา + บันทึก Training Data อัตโนมัติ
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

        {/* Training Log Panel */}
        <div className="card-shadow rounded-lg border border-border bg-card p-6">
          <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">
            📊 Training Log
          </h2>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded bg-secondary px-2 py-2">
              <p className="text-xs text-muted-foreground">บันทึก</p>
              <p className="text-lg font-bold text-foreground">{logSummary.total}</p>
            </div>
            <div className="rounded bg-secondary px-2 py-2">
              <p className="text-xs text-muted-foreground">ถูก</p>
              <p className="text-lg font-bold text-casino-green">{logSummary.correct}</p>
            </div>
            <div className="rounded bg-secondary px-2 py-2">
              <p className="text-xs text-muted-foreground">ผิด</p>
              <p className="text-lg font-bold text-destructive">{logSummary.wrong}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleExportCSV}
              disabled={logSummary.total === 0}
              className="flex-1 rounded-md bg-gold/20 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/30 disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportJSON}
              disabled={logSummary.total === 0}
              className="flex-1 rounded-md bg-gold/20 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/30 disabled:opacity-40"
            >
              Export JSON
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            ดาวน์โหลด Log เพื่อนำไปเทรนโมเดล ML ภายนอก
          </p>
        </div>

        <GameHistory history={history} predictions={predictions} />
      </div>
    </div>
  );
}
