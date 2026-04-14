import { useEffect, useMemo, useState, useCallback } from "react";
import { BaccaratResult, PredictionResult, predict, computeStats, learnFromOutcome, logPrediction, getSignalTracker } from "@/lib/baccaratEngine";
import { getTrainingLog, fetchAllLogsFromDB, countLogsInDB } from "@/lib/baccaratTrainingLog";
import { PredictionDisplay } from "@/components/PredictionDisplay";
import { GameHistory } from "@/components/GameHistory";
import { StatsPanel } from "@/components/StatsPanel";
import { ResultButtons } from "@/components/ResultButtons";

export default function Index() {
  const [history, setHistory] = useState<BaccaratResult[]>([]);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [logCount, setLogCount] = useState(0);
  const [dbLogCount, setDbLogCount] = useState(0);

  // Load DB log count on mount
  useEffect(() => {
    countLogsInDB().then(setDbLogCount);
  }, []);

  const currentPrediction = useMemo(() => {
    if (history.length < 1) return null;
    return predict(history);
  }, [history]);

  const stats = useMemo(() => computeStats(history, predictions), [history, predictions]);

  const handleResult = useCallback((result: BaccaratResult) => {
    setHistory((prev) => {
      const prevPred = predict(prev);
      
      learnFromOutcome(prev, prevPred.signals, prevPred.result, result);
      
      const newHistory = [...prev, result];
      logPrediction(newHistory, prevPred, result);
      setLogCount(getTrainingLog().getLength());
      setDbLogCount((c) => c + 1);
      
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

  const handleExportCSV = useCallback(async () => {
    // Export all from DB
    const entries = await fetchAllLogsFromDB();
    if (entries.length === 0) return;

    const headers = [
      "round", "timestamp", "historyLength", "streak",
      "pRatio", "bRatio", "tRatio", "last10",
      "signalCount", "playerScore", "bankerScore", "margin",
      "predicted", "confidence", "actual", "correct", "signals"
    ];

    const rows = entries.map((e) => [
      e.round, e.timestamp, e.historyLength, e.streak,
      e.pRatio.toFixed(4), e.bRatio.toFixed(4), e.tRatio.toFixed(4), e.last10,
      e.signalCount, e.playerScore.toFixed(4), e.bankerScore.toFixed(4), e.margin.toFixed(4),
      e.predicted, e.confidence, e.actual,
      e.correct === null ? "tie" : e.correct ? "1" : "0",
      `"${(e.signals || []).map((s: any) => `${s.name}:${s.prediction[0]}:${Number(s.weight).toFixed(3)}`).join("|")}"`,
    ].join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baccarat_training_ALL_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportJSON = useCallback(async () => {
    const entries = await fetchAllLogsFromDB();
    if (entries.length === 0) return;
    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baccarat_training_ALL_${new Date().toISOString().slice(0, 10)}.json`;
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
          ระบบทำนายอัจฉริยะ + เก็บ Log ลง DB
        </p>
        <div className="mx-auto mt-3 h-0.5 w-24 bg-gradient-to-r from-transparent via-gold to-transparent" />
        <div className="mt-3 inline-flex rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-xs text-gold">
          🧠 AI เรียนรู้ทุกตา + บันทึก Training Data ลง Database อัตโนมัติ
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
            📊 Training Log (Database)
          </h2>
          
          <div className="grid grid-cols-2 gap-2 text-center text-sm mb-3">
            <div className="rounded bg-secondary px-2 py-2">
              <p className="text-xs text-muted-foreground">เซสชันนี้</p>
              <p className="text-lg font-bold text-foreground">{logSummary.total}</p>
            </div>
            <div className="rounded bg-secondary px-2 py-2">
              <p className="text-xs text-muted-foreground">ทั้งหมดใน DB</p>
              <p className="text-lg font-bold text-gold">{dbLogCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded bg-secondary px-2 py-2">
              <p className="text-xs text-muted-foreground">ถูก</p>
              <p className="text-lg font-bold text-casino-green">{logSummary.correct}</p>
            </div>
            <div className="rounded bg-secondary px-2 py-2">
              <p className="text-xs text-muted-foreground">ผิด</p>
              <p className="text-lg font-bold text-destructive">{logSummary.wrong}</p>
            </div>
            <div className="rounded bg-secondary px-2 py-2">
              <p className="text-xs text-muted-foreground">Accuracy</p>
              <p className="text-lg font-bold text-gold">{logSummary.accuracy}%</p>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleExportCSV}
              disabled={dbLogCount === 0}
              className="flex-1 rounded-md bg-gold/20 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/30 disabled:opacity-40"
            >
              Export CSV (DB ทั้งหมด)
            </button>
            <button
              onClick={handleExportJSON}
              disabled={dbLogCount === 0}
              className="flex-1 rounded-md bg-gold/20 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/30 disabled:opacity-40"
            >
              Export JSON (DB ทั้งหมด)
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            ทุกตาถูกบันทึกลง Database อัตโนมัติ • Export เพื่อนำไปเทรนโมเดล ML
          </p>
        </div>

        <GameHistory history={history} predictions={predictions} />
      </div>
    </div>
  );
}
