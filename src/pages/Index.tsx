import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { BaccaratResult, PredictionResult, predict, computeStats, learnFromOutcome, logPrediction, getSignalTracker } from "@/lib/baccaratEngine";
import { getTrainingLog, fetchAllLogsFromDB, countLogsInDB } from "@/lib/baccaratTrainingLog";
import { retrainFromDatabase, RetrainProgress } from "@/lib/baccaratRetrain";
import { PredictionDisplay } from "@/components/PredictionDisplay";
import { GameHistory } from "@/components/GameHistory";
import { StatsPanel } from "@/components/StatsPanel";
import { ResultButtons } from "@/components/ResultButtons";
import { useAuth } from "@/contexts/AuthContext";
import { hasPinOnDevice } from "@/lib/devicePin";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Index() {
  const { user, role, signOut } = useAuth();
  const [history, setHistory] = useState<BaccaratResult[]>([]);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [logCount, setLogCount] = useState(0);
  const [dbLogCount, setDbLogCount] = useState(0);
  const [isRetraining, setIsRetraining] = useState(false);
  const [lastRetrain, setLastRetrain] = useState<RetrainProgress | null>(null);
  
  // State สำหรับ External AI (Gemini)
  const [externalAiLoading, setExternalAiLoading] = useState(false);
  const [externalAiResult, setExternalAiResult] = useState<string | null>(null);

  const showPinPrompt = !!user && !hasPinOnDevice();
  
  // ใช้ ref เพื่อป้องกัน StrictMode เผลอยิงคำสั่งซ้ำ
  const hasRetrained = useRef(false);

  // Load DB log count on mount + auto-retrain on first load
  useEffect(() => {
    // ต้องรอให้ Auth ตรวจสอบเสร็จและมี user ก่อนถึงจะสั่งดึงข้อมูล
    if (!user) return;
    if (hasRetrained.current) return;

    let isMounted = true;

    (async () => {
      const count = await countLogsInDB();
      if (!isMounted) return;
      setDbLogCount(count);

      // Auto-retrain ถ้ามีข้อมูลใน DB เพียงพอ
      if (count >= 10) {
        setIsRetraining(true);
        try {
          hasRetrained.current = true;
          const progress = await retrainFromDatabase();
          if (!isMounted) return;
          setLastRetrain(progress);
          toast.success(`🧠 AI พร้อมใช้งาน — เรียนรู้จาก ${progress.totalLogs} ตาใน DB`);
        } catch (e: any) {
          console.error("Auto-retrain failed:", e);
          if (isMounted) toast.error(`Auto-retrain ล้มเหลว: ${e?.message ?? "unknown error"}`);
        } finally {
          if (isMounted) setIsRetraining(false);
        }
      }
    })();

    return () => { isMounted = false; };
  }, [user]);

  const handleRetrain = useCallback(async () => {
    setIsRetraining(true);
    try {
      const progress = await retrainFromDatabase();
      setLastRetrain(progress);
      toast.success(
        `✅ Retrain สำเร็จ: ${progress.totalLogs} ตา / ${progress.sessions} เซสชัน (${(progress.durationMs / 1000).toFixed(1)}s)`
      );
    } catch (e: any) {
      toast.error(`Retrain ล้มเหลว: ${e?.message ?? "unknown error"}`);
    } finally {
      setIsRetraining(false);
    }
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
      
      // ล้างผลลัพธ์ของ AI ภายนอกเมื่อมีการเพิ่มตาใหม่
      setExternalAiResult(null); 
      
      return newHistory;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((prev) => prev.slice(0, -1));
    setPredictions((prev) => prev.slice(0, -1));
    setExternalAiResult(null);
  }, []);

  const handleReset = useCallback(() => {
    setHistory([]);
    setPredictions([]);
    getSignalTracker().reset();
    getTrainingLog().reset();
    setLogCount(0);
    setExternalAiResult(null);
  }, []);

  const handleExportCSV = useCallback(async () => {
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

  // ฟังก์ชันยิง API ไปหา AI ฟรี (Google Gemini)
  const handleAskExternalAi = async () => {
    if (history.length < 3) {
      toast.error("ให้ใส่ข้อมูลอย่างน้อย 3 ตาก่อนให้ AI ภายนอกวิเคราะห์ครับ");
      return;
    }
    
    setExternalAiLoading(true);
    
    try {
      // 🔑 ใส่ API Key ของ Gemini ที่ขอมาฟรีตรงนี้
      // สังเกตว่าเพิ่ม : string ไว้เพื่อป้องกัน TypeScript error
      // บรรทัดที่ประกาศตัวแปร (ประมาณบรรทัดที่ 179)
const GEMINI_API_KEY: string = import.meta.env.VITE_GEMINI_API_KEY || "";

// บรรทัดเงื่อนไขเช็คคีย์ (ประมาณบรรทัดที่ 183)
if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === "") {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const recent = history.slice(-5);
  const pCount = history.filter((h) => h === "Player").length;
  const bCount = history.filter((h) => h === "Banker").length;
  const prediction = bCount > pCount ? "Banker" : "Player";
  
  setExternalAiResult(
    `⚠️ [ยังไม่ได้ใส่ API Key ในไฟล์ .env - นี่คือการจำลอง]\nจากการวิเคราะห์ ${history.length} ตา และแนวโน้ม 5 ตาล่าสุด (${recent.join(", ")})\nโมเมนตัมเอนเอียงไปทาง ${prediction} แนะนำให้วางเดิมพัน ${prediction} ครับ`
  );
  return;
}

      // ยิง API ของจริงไปหา Google Gemini 1.5 Flash (โมเดลตัวเร็วและฟรี)
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 150,
          }
        })
      });

      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }
      
      const aiResponseText = data.candidates[0].content.parts[0].text;
      setExternalAiResult(`✨ [Google Gemini AI]:\n${aiResponseText}`);

    } catch (error: any) {
      toast.error(`เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini AI: ${error.message}`);
    } finally {
      setExternalAiLoading(false);
    }
  };

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

  // ========================== 
  // แผง System AI Analysis (ตัวหลัก)
  // ==========================
  const aiAnalysisPanel = (
    <div className="card-shadow rounded-lg border border-border bg-card p-5 lg:p-6">
      <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold flex items-center gap-2">
        <span>⚙️</span> System AI Analysis
      </h2>
      
      {!currentPrediction ? (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border/50 bg-secondary/20">
          <p className="text-xs text-muted-foreground">รอข้อมูลรอบแรกเพื่อวิเคราะห์...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md bg-secondary/40 p-3 text-sm border border-border/30">
            <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">สรุปเหตุผลหลัก</p>
            <p className="font-medium text-foreground text-xs leading-relaxed">{currentPrediction.reasoning}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">สัญญาณที่ตรวจพบ</span>
              <span className="rounded bg-gold/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">
                {currentPrediction.signals.length} SIGNALS
              </span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              {currentPrediction.signals.map((sig, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-background px-2.5 py-2 text-xs border border-border/40">
                  <span className="text-muted-foreground font-medium">{sig.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={sig.prediction === "Player" ? "text-blue-400 font-bold" : "text-red-400 font-bold"}>
                      {sig.prediction === "Player" ? "Player" : "Banker"}
                    </span>
                    <span className="w-10 text-right font-mono text-[10px] text-gold">
                      {(sig.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-background p-2 border border-border/40 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase text-muted-foreground mb-0.5">เค้าไพ่ปัจจุบัน</span>
              <span className="font-bold text-foreground">{currentPrediction.features.streak} ตาติด</span>
            </div>
            <div className="rounded-md bg-background p-2 border border-border/40 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase text-muted-foreground mb-0.5">สัดส่วน P / B</span>
              <span className="font-mono font-bold text-foreground">
                {(currentPrediction.features.pRatio * 100).toFixed(0)}% / {(currentPrediction.features.bRatio * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ========================== 
  // แผง External AI (Gemini ฟรี)
  // ==========================
  const externalAiPanel = (
    <div className="card-shadow rounded-lg border border-purple-500/30 bg-card p-5 lg:p-6">
      <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-purple-400 flex items-center gap-2">
        <span>🔮</span> Gemini AI (Free)
      </h2>
      
      <p className="text-xs text-muted-foreground mb-3">
        เรียกใช้ Google Gemini AI เพื่อขอความเห็นที่สอง (Second Opinion) วิเคราะห์สดจากประวัติไพ่
      </p>

      <Button 
        onClick={handleAskExternalAi} 
        disabled={externalAiLoading || history.length < 3}
        className="w-full bg-purple-600/80 hover:bg-purple-600 text-white transition-all"
        variant="outline"
      >
        {externalAiLoading ? "กำลังเชื่อมต่อ Gemini AI..." : "ให้ Gemini AI ช่วยวิเคราะห์รอบนี้"}
      </Button>

      {externalAiResult && (
        <div className="mt-4 rounded-md bg-purple-900/10 p-3.5 text-sm border border-purple-500/20">
          <p className="font-medium text-purple-100 text-xs leading-relaxed whitespace-pre-wrap">
            {externalAiResult}
          </p>
        </div>
      )}
    </div>
  );

  const trainingLogPanel = (
    <div className="card-shadow rounded-lg border border-border bg-card p-5 lg:p-6">
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
          Export CSV
        </button>
        <button
          onClick={handleExportJSON}
          disabled={dbLogCount === 0}
          className="flex-1 rounded-md bg-gold/20 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/30 disabled:opacity-40"
        >
          Export JSON
        </button>
      </div>

      <button
        onClick={handleRetrain}
        disabled={isRetraining || dbLogCount === 0}
        className="mt-2 w-full rounded-md bg-gradient-to-r from-gold/30 to-gold/20 px-3 py-2.5 text-sm font-bold text-gold transition hover:from-gold/40 hover:to-gold/30 disabled:opacity-40"
      >
        {isRetraining ? "🔄 กำลัง Retrain..." : `🧠 Retrain AI จาก DB ทั้งหมด (${dbLogCount} ตา)`}
      </button>

      {lastRetrain && (
        <div className="mt-2 rounded bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          ✅ Retrain ล่าสุด: <span className="text-gold font-semibold">{lastRetrain.totalLogs}</span> ตา •{" "}
          <span className="text-gold font-semibold">{lastRetrain.sessions}</span> เซสชัน •{" "}
          <span className="text-gold font-semibold">{lastRetrain.patternsLearned}</span> patterns •{" "}
          {(lastRetrain.durationMs / 1000).toFixed(1)}s
        </div>
      )}

      <p className="mt-2 text-center text-xs text-muted-foreground">
        AI Auto-Retrain ตอนเปิดเว็บ • กดปุ่มเพื่อ Retrain ใหม่หลังเล่นจบเซสชัน
      </p>
    </div>
  );

  return (
    <div className="min-h-screen pb-8">
      {/* Top Nav */}
      <div className="mx-auto flex max-w-[1800px] items-center justify-between px-4 pt-4 lg:px-10">
        <div className="text-xs text-muted-foreground">
          เข้าใช้: <span className="text-foreground font-mono">{user?.email?.split("@")[0]}</span>
          {role === "admin" && <span className="ml-2 rounded bg-gold/20 px-2 py-0.5 text-gold">ADMIN</span>}
        </div>
        <div className="flex gap-2">
          {showPinPrompt && (
            <Link to="/pin-setup">
              <Button size="sm" variant="outline">🔢 ตั้ง PIN</Button>
            </Link>
          )}
          {role === "admin" && (
            <Link to="/admin">
              <Button size="sm" variant="outline">⚙️ Admin</Button>
            </Link>
          )}
          <Button size="sm" variant="ghost" onClick={async () => { await signOut(); toast.info("ออกจากระบบแล้ว"); }}>
            ออก
          </Button>
        </div>
      </div>

      <header className="pt-4 pb-5 text-center lg:pt-6 lg:pb-6">
        <h1 className="font-display text-3xl font-bold tracking-wide text-gold-gradient md:text-4xl lg:text-5xl">
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

      {/* Mobile / Tablet: stacked single column */}
      <div className="container mx-auto max-w-lg space-y-5 px-4 lg:hidden">
        <PredictionDisplay prediction={currentPrediction} />
        <ResultButtons onResult={handleResult} onUndo={handleUndo} onReset={handleReset} canUndo={history.length > 0} />
        {aiAnalysisPanel}
        {externalAiPanel}
        <StatsPanel stats={stats} />
        {trainingLogPanel}
        <GameHistory history={history} predictions={predictions} />
      </div>

      {/* Desktop (lg+): 3-column dashboard layout */}
      <div className="hidden lg:block">
        <div className="mx-auto grid w-full max-w-[1800px] grid-cols-12 gap-6 px-6 xl:gap-8 xl:px-10">
          {/* Left column — Prediction + Controls + AI Panels */}
          <div className="col-span-4 space-y-5">
            <PredictionDisplay prediction={currentPrediction} />
            <ResultButtons
              onResult={handleResult}
              onUndo={handleUndo}
              onReset={handleReset}
              canUndo={history.length > 0}
            />
            {aiAnalysisPanel}
            {externalAiPanel}
          </div>

          {/* Middle column — Stats + Training Log */}
          <div className="col-span-4 space-y-5">
            <StatsPanel stats={stats} />
            {trainingLogPanel}
          </div>

          {/* Right column — Game History (full height, scrollable) */}
          <div className="col-span-4">
            <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
              <GameHistory history={history} predictions={predictions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}