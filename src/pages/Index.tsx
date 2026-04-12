import { useEffect, useState, useCallback, useMemo } from 'react';
import { BaccaratResult, predict, computeStats } from '@/lib/baccaratEngine';
import { PredictionDisplay } from '@/components/PredictionDisplay';
import { GameHistory } from '@/components/GameHistory';
import { StatsPanel } from '@/components/StatsPanel';
import { ResultButtons } from '@/components/ResultButtons';

export default function Index() {
  const [history, setHistory] = useState<BaccaratResult[]>([]);
  const [predictions, setPredictions] = useState<BaccaratResult[]>([]);

  const currentPrediction = useMemo(() => {
    if (history.length < 1) return null;
    return predict(history);
  }, [history]);

  const stats = useMemo(() => computeStats(history, predictions), [history, predictions]);

  const handleResult = useCallback((result: BaccaratResult) => {
    setHistory(prev => {
      const pred = predict(prev);
      setPredictions(p => [...p, pred.result]);
      return [...prev, result];
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistory(prev => prev.slice(0, -1));
    setPredictions(prev => prev.slice(0, -1));
  }, []);

  const handleReset = useCallback(() => {
    setHistory([]);
    setPredictions([]);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toUpperCase();
      if (key === 'P') handleResult('Player');
      else if (key === 'B') handleResult('Banker');
      else if (key === 'T') handleResult('Tie');
      else if (key === 'Z' && (e.ctrlKey || e.metaKey)) handleUndo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleResult, handleUndo]);

  return (
    <div className="min-h-screen pb-8">
      <header className="pt-8 pb-6 text-center">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-gold-gradient tracking-wide">
          BACCARAT AI
        </h1>
        <p className="text-muted-foreground text-sm mt-1 tracking-widest uppercase">
          ระบบทำนายอัจฉริยะ
        </p>
        <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent mx-auto mt-3" />
        <p className="text-muted-foreground text-xs mt-2">
          กด <kbd className="px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-xs">P</kbd>{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-xs">B</kbd>{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-xs">T</kbd> บนคีย์บอร์ด
        </p>
      </header>

      <div className="container max-w-lg mx-auto px-4 space-y-5">
        <PredictionDisplay prediction={currentPrediction} />
        <ResultButtons onResult={handleResult} onUndo={handleUndo} onReset={handleReset} canUndo={history.length > 0} />
        <StatsPanel stats={stats} />
        <GameHistory history={history} predictions={predictions} />
      </div>
    </div>
  );
}
