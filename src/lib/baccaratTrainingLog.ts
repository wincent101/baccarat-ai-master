/**
 * Training Log System — บันทึกลง Supabase DB อัตโนมัติ
 */
import { supabase } from "@/integrations/supabase/client";

export interface TrainingLogEntry {
  round: number;
  timestamp: string;
  historyLength: number;
  streak: number;
  pRatio: number;
  bRatio: number;
  tRatio: number;
  last10: string;
  signals: { name: string; prediction: string; weight: number }[];
  signalCount: number;
  playerScore: number;
  bankerScore: number;
  margin: number;
  predicted: "Player" | "Banker";
  confidence: number;
  actual: string;
  correct: boolean | null;
}

// Generate a unique session ID per page load
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

class TrainingLog {
  private entries: TrainingLogEntry[] = [];
  private pendingInserts: Promise<void>[] = [];

  async add(entry: TrainingLogEntry) {
    this.entries.push(entry);

    // Save to DB async (fire-and-forget with error logging)
    const insertPromise = (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("training_logs").insert({
        session_id: SESSION_ID,
        user_id: user.id,
        round_number: entry.round,
        history_length: entry.historyLength,
        streak: entry.streak,
        p_ratio: entry.pRatio,
        b_ratio: entry.bRatio,
        t_ratio: entry.tRatio,
        last_10: entry.last10,
        signals: entry.signals as any,
        signal_count: entry.signalCount,
        player_score: entry.playerScore,
        banker_score: entry.bankerScore,
        margin: entry.margin,
        predicted: entry.predicted,
        confidence: entry.confidence,
        actual: entry.actual,
        correct: entry.correct,
      });
      if (error) console.error("Failed to save training log:", error.message);
    })();

    this.pendingInserts.push(insertPromise);
  }

  getEntries(): TrainingLogEntry[] {
    return [...this.entries];
  }

  getLength(): number {
    return this.entries.length;
  }

  reset() {
    this.entries = [];
  }

  /** Export เป็น CSV string */
  toCSV(): string {
    if (this.entries.length === 0) return "";

    const headers = [
      "round", "timestamp", "historyLength", "streak",
      "pRatio", "bRatio", "tRatio", "last10",
      "signalCount", "playerScore", "bankerScore", "margin",
      "predicted", "confidence", "actual", "correct", "signals"
    ];

    const rows = this.entries.map((e) => [
      e.round, e.timestamp, e.historyLength, e.streak,
      e.pRatio.toFixed(4), e.bRatio.toFixed(4), e.tRatio.toFixed(4), e.last10,
      e.signalCount, e.playerScore.toFixed(4), e.bankerScore.toFixed(4), e.margin.toFixed(4),
      e.predicted, e.confidence, e.actual,
      e.correct === null ? "tie" : e.correct ? "1" : "0",
      `"${e.signals.map((s) => `${s.name}:${s.prediction[0]}:${s.weight.toFixed(3)}`).join("|")}"`,
    ].join(","));

    return [headers.join(","), ...rows].join("\n");
  }

  getSummary() {
    const scored = this.entries.filter((e) => e.correct !== null);
    const correct = scored.filter((e) => e.correct === true).length;
    const wrong = scored.filter((e) => e.correct === false).length;
    const ties = this.entries.filter((e) => e.correct === null).length;

    return {
      total: this.entries.length,
      scored: scored.length,
      correct,
      wrong,
      ties,
      accuracy: scored.length > 0 ? (correct / scored.length * 100).toFixed(1) : "0",
    };
  }
}

const trainingLog = new TrainingLog();

export function getTrainingLog(): TrainingLog {
  return trainingLog;
}

/** ดึง log จาก DB ทั้งหมด (สำหรับ export หรือ retrain) */
export async function fetchAllLogsFromDB(): Promise<TrainingLogEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return []; // ตรวจสอบ Auth เสมอ

  const { data, error } = await supabase
    .from("training_logs")
    .select("*")
    .eq("user_id", user.id) // ดึงเฉพาะข้อมูลของ user ตัวเอง
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch training logs:", error.message);
    return [];
  }

  return (data || []).map((row) => ({
    round: row.round_number,
    timestamp: row.created_at,
    historyLength: row.history_length,
    streak: row.streak,
    pRatio: row.p_ratio,
    bRatio: row.b_ratio,
    tRatio: row.t_ratio,
    last10: row.last_10,
    signals: (row.signals as any) || [],
    signalCount: row.signal_count,
    playerScore: row.player_score,
    bankerScore: row.banker_score,
    margin: row.margin,
    predicted: row.predicted as "Player" | "Banker",
    confidence: row.confidence,
    actual: row.actual,
    correct: row.correct,
  }));
}

/** นับจำนวน log ทั้งหมดใน DB */
export async function countLogsInDB(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0; // ต้องล็อกอินก่อนถึงจะนับข้อมูลได้แม่นยำ

  const { count, error } = await supabase
    .from("training_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id); // นับเฉพาะของ user ตัวเอง

  if (error) return 0;
  return count || 0;
}