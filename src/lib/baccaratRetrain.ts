/**
 * Auto-Retrain System
 * โหลด log ทั้งหมดจาก Database มา replay เข้า Pattern Memory + Signal Tracker
 * เพื่อให้ AI ฉลาดขึ้นจากข้อมูลในอดีตทั้งหมด
 */
import { supabase } from "@/integrations/supabase/client";
import { getPatternMemory } from "./baccaratPatternMemory";
import { getSignalTracker, BaccaratResult } from "./baccaratEngine";

export interface RetrainProgress {
  totalLogs: number;
  sessions: number;
  patternsLearned: number;
  signalsCalibrated: number;
  durationMs: number;
}

interface SessionRow {
  session_id: string;
  round_number: number;
  actual: string;
  predicted: string;
  correct: boolean | null;
  signals: any;
}

/**
 * Retrain ทั้งระบบจาก DB:
 * 1. ล้าง Pattern Memory + Signal Tracker
 * 2. ดึง log ทั้งหมด เรียงตาม session + round
 * 3. Replay แต่ละตา → ป้อนเข้า PatternMemory.learn() และ SignalTracker
 */
export async function retrainFromDatabase(): Promise<RetrainProgress> {
  const startedAt = performance.now();

  // 1. Reset memory และ tracker
  getSignalTracker().reset(); // reset() นี้จะ reset PatternMemory ด้วย (ดูใน baccaratEngine.ts)

  const memory = getPatternMemory();
  const tracker = getSignalTracker();

  // 2. ดึง log ทั้งหมด (ใช้ pagination เผื่อข้อมูลเกิน 1000 แถว)
  const all: SessionRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("training_logs")
      .select("session_id, round_number, actual, predicted, correct, signals")
      .order("session_id", { ascending: true })
      .order("round_number", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...(data as SessionRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (all.length === 0) {
    return {
      totalLogs: 0,
      sessions: 0,
      patternsLearned: 0,
      signalsCalibrated: 0,
      durationMs: performance.now() - startedAt,
    };
  }

  // 3. แบ่ง log ตาม session
  const bySession = new Map<string, SessionRow[]>();
  for (const row of all) {
    const arr = bySession.get(row.session_id) ?? [];
    arr.push(row);
    bySession.set(row.session_id, arr);
  }

  let patternsLearned = 0;
  let signalsCalibrated = 0;

  // 4. Replay แต่ละ session
  for (const rows of bySession.values()) {
    rows.sort((a, b) => a.round_number - b.round_number);

    const history: BaccaratResult[] = [];
    for (const row of rows) {
      const actual = row.actual as BaccaratResult;
      if (actual !== "Player" && actual !== "Banker" && actual !== "Tie") continue;

      // ป้อน history-before-round เข้า PatternMemory
      memory.learn(history, actual);
      patternsLearned += 1;

      // Recalibrate signals จาก log เก่า
      if (Array.isArray(row.signals) && actual !== "Tie") {
        for (const sig of row.signals) {
          if (!sig?.name || !sig?.prediction) continue;
          const wasCorrect = sig.prediction === actual;
          tracker.recordOutcome(sig.name, wasCorrect, Number(sig.weight) || 0.1);
          signalsCalibrated += 1;
        }
      }

      history.push(actual);
    }
  }

  return {
    totalLogs: all.length,
    sessions: bySession.size,
    patternsLearned,
    signalsCalibrated,
    durationMs: performance.now() - startedAt,
  };
}
