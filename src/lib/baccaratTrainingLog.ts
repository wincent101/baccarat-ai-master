/**
 * Training Log System
 * บันทึกทุกตาเพื่อนำไปเทรนโมเดลอัตโนมัติ
 */

export interface TrainingLogEntry {
  round: number;
  timestamp: string;
  // Features ณ ตอนทำนาย
  historyLength: number;
  streak: number;
  pRatio: number;
  bRatio: number;
  tRatio: number;
  // Last 10 results
  last10: string;
  // Signals
  signals: { name: string; prediction: string; weight: number }[];
  signalCount: number;
  playerScore: number;
  bankerScore: number;
  margin: number;
  // Prediction
  predicted: "Player" | "Banker";
  confidence: number;
  // Actual
  actual: string;
  correct: boolean | null; // null if Tie
}

class TrainingLog {
  private entries: TrainingLogEntry[] = [];

  add(entry: TrainingLogEntry) {
    this.entries.push(entry);
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

  /** Export เป็น CSV string สำหรับดาวน์โหลด */
  toCSV(): string {
    if (this.entries.length === 0) return "";

    const headers = [
      "round", "timestamp", "historyLength", "streak",
      "pRatio", "bRatio", "tRatio", "last10",
      "signalCount", "playerScore", "bankerScore", "margin",
      "predicted", "confidence", "actual", "correct",
      "signals"
    ];

    const rows = this.entries.map((e) => [
      e.round,
      e.timestamp,
      e.historyLength,
      e.streak,
      e.pRatio.toFixed(4),
      e.bRatio.toFixed(4),
      e.tRatio.toFixed(4),
      e.last10,
      e.signalCount,
      e.playerScore.toFixed(4),
      e.bankerScore.toFixed(4),
      e.margin.toFixed(4),
      e.predicted,
      e.confidence,
      e.actual,
      e.correct === null ? "tie" : e.correct ? "1" : "0",
      `"${e.signals.map((s) => `${s.name}:${s.prediction[0]}:${s.weight.toFixed(3)}`).join("|")}"`,
    ].join(","));

    return [headers.join(","), ...rows].join("\n");
  }

  /** Export เป็น JSON string */
  toJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /** สรุปสถิติจาก log */
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
