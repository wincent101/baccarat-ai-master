export type BaccaratResult = "Player" | "Banker" | "Tie";
export type PredictionResult = "Player" | "Banker" | "Skip";
type NonTieResult = Exclude<BaccaratResult, "Tie">;

export interface Prediction {
  result: PredictionResult;
  confidence: number;
  features: {
    streak: number;
    pRatio: number;
    bRatio: number;
    tRatio: number;
  };
  reasoning: string;
  signals: Signal[];
  shouldBet: boolean;
}

export interface Signal {
  name: string;
  prediction: NonTieResult;
  weight: number;
}

export interface GameStats {
  total: number;
  playerWins: number;
  bankerWins: number;
  ties: number;
  correctPredictions: number;
  incorrectPredictions: number;
  attemptedPredictions: number;
  skippedPredictions: number;
  currentStreak: number;
  streakType: BaccaratResult | null;
}

// ==================== Self-Learning System ====================

interface SignalRecord {
  name: string;
  correct: number;
  wrong: number;
  baseWeight: number;
}

/**
 * ระบบเรียนรู้ด้วยตัวเอง:
 * - ติดตามความแม่นยำของแต่ละ Signal
 * - ปรับน้ำหนักอัตโนมัติตามผลลัพธ์จริง
 * - Signal ที่ทายถูกบ่อย → น้ำหนักเพิ่ม
 * - Signal ที่ทายผิดบ่อย → น้ำหนักลด (ถึงขั้นติดลบ = สวนทาง)
 */
class SignalTracker {
  private records: Map<string, SignalRecord> = new Map();

  recordOutcome(signalName: string, wasCorrect: boolean, baseWeight: number) {
    let rec = this.records.get(signalName);
    if (!rec) {
      rec = { name: signalName, correct: 0, wrong: 0, baseWeight };
      this.records.set(signalName, rec);
    }
    if (wasCorrect) rec.correct++;
    else rec.wrong++;
  }

  /** คืนค่า multiplier สำหรับปรับน้ำหนัก: >1 = เก่ง, <1 = แย่ */
  getMultiplier(signalName: string): number {
    const rec = this.records.get(signalName);
    if (!rec) return 1.0;
    const total = rec.correct + rec.wrong;
    if (total < 3) return 1.0; // ข้อมูลน้อยเกินไป ยังไม่ปรับ

    const accuracy = rec.correct / total;
    // accuracy 50% → multiplier 0.3 (ลดมาก เพราะเท่ากับมัว)
    // accuracy 60% → multiplier 1.0 (ปกติ)
    // accuracy 70% → multiplier 1.5
    // accuracy 80%+ → multiplier 2.0
    if (accuracy < 0.45) return 0.1;  // แย่มาก แทบไม่ใช้
    if (accuracy < 0.50) return 0.2;
    if (accuracy < 0.55) return 0.5;
    if (accuracy < 0.60) return 0.8;
    if (accuracy < 0.65) return 1.0;
    if (accuracy < 0.70) return 1.3;
    if (accuracy < 0.75) return 1.6;
    return 2.0;
  }

  getStats(): Map<string, { accuracy: number; total: number }> {
    const stats = new Map<string, { accuracy: number; total: number }>();
    this.records.forEach((rec, name) => {
      const total = rec.correct + rec.wrong;
      stats.set(name, {
        accuracy: total > 0 ? rec.correct / total : 0,
        total,
      });
    });
    return stats;
  }

  reset() {
    this.records.clear();
  }
}

// Global tracker instance
const tracker = new SignalTracker();

export function getSignalTracker(): SignalTracker {
  return tracker;
}

// ==================== Utility Functions ====================

function nonTie(history: BaccaratResult[]): NonTieResult[] {
  return history.filter((result): result is NonTieResult => result !== "Tie");
}

function opposite(result: NonTieResult): NonTieResult {
  return result === "Player" ? "Banker" : "Player";
}

function getStreak<T extends string>(history: T[]): { count: number; last: T | null } {
  if (history.length === 0) return { count: 0, last: null };
  const last = history[history.length - 1];
  let count = 1;
  for (let i = history.length - 2; i >= 0; i -= 1) {
    if (history[i] === last) count += 1;
    else break;
  }
  return { count, last };
}

function sumWeights(signals: Signal[]): number {
  return signals.reduce((total, signal) => total + signal.weight, 0);
}

// ==================== Feature Extraction ====================

export function computeFeatures(history: BaccaratResult[]): Prediction["features"] {
  if (history.length === 0) {
    return { streak: 0, pRatio: 0.5, bRatio: 0.5, tRatio: 0 };
  }
  const last12 = history.slice(-12);
  const total = last12.length;
  const pCount = last12.filter((r) => r === "Player").length;
  const bCount = last12.filter((r) => r === "Banker").length;
  const tCount = last12.filter((r) => r === "Tie").length;
  const { count } = getStreak(history);
  return { streak: count, pRatio: pCount / total, bRatio: bCount / total, tRatio: tCount / total };
}

// ==================== Signal Functions ====================

const SIGNAL_NAMES = {
  DRAGON: "มังกร",
  STREAK3: "เค้า3ตัว",
  PAIR: "เค้าคู่",
  CUT: "ตัดหาง",
  CHOP: "ปิงปอง",
  DOUBLE_CUT: "2ตัวตัด",
  DOUBLE_FOLLOW: "ปิดคู่",
  RATIO_B: "ดึงกลับB",
  RATIO_P: "ดึงกลับP",
  PATTERN: "จำเค้าไพ่",
  BANKER_EDGE: "BankerEdge",
} as const;

function streakSignal(history: NonTieResult[]): Signal | null {
  const { count, last } = getStreak(history);
  if (!last) return null;

  if (count >= 4) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.DRAGON);
    return { name: SIGNAL_NAMES.DRAGON, prediction: last, weight: 0.45 * m };
  }
  if (count === 3) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.STREAK3);
    return { name: SIGNAL_NAMES.STREAK3, prediction: last, weight: 0.30 * m };
  }
  if (count === 2) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.PAIR);
    return { name: SIGNAL_NAMES.PAIR, prediction: last, weight: 0.20 * m };
  }
  if (count === 1 && history.length >= 3) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.CUT);
    return { name: SIGNAL_NAMES.CUT, prediction: last, weight: 0.15 * m };
  }
  return null;
}

function chopSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 4) return null;
  const tail = history.slice(-5);
  let alternates = 0;
  for (let i = 1; i < tail.length; i += 1) {
    if (tail[i] !== tail[i - 1]) alternates += 1;
  }
  if (alternates >= 3) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.CHOP);
    return { name: SIGNAL_NAMES.CHOP, prediction: opposite(tail[tail.length - 1]), weight: 0.40 * m };
  }
  return null;
}

function doubleSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 4) return null;
  const a = history[history.length - 4], b = history[history.length - 3];
  const c = history[history.length - 2], d = history[history.length - 1];

  if (a === b && c === d && a !== c) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.DOUBLE_CUT);
    return { name: SIGNAL_NAMES.DOUBLE_CUT, prediction: opposite(d), weight: 0.35 * m };
  }
  if (b === c && a !== b && c !== d) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.DOUBLE_FOLLOW);
    return { name: SIGNAL_NAMES.DOUBLE_FOLLOW, prediction: d, weight: 0.25 * m };
  }
  return null;
}

function ratioSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 10) return null;
  const recent = history.slice(-20);
  const playerRatio = recent.filter((r) => r === "Player").length / recent.length;

  if (playerRatio >= 0.70) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.RATIO_B);
    return { name: SIGNAL_NAMES.RATIO_B, prediction: "Banker", weight: 0.25 * m };
  }
  if (playerRatio <= 0.30) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.RATIO_P);
    return { name: SIGNAL_NAMES.RATIO_P, prediction: "Player", weight: 0.25 * m };
  }
  return null;
}

function patternMatchSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 7) return null;
  const patternLength = Math.min(3, history.length - 1);
  const pattern = history.slice(-patternLength).join(",");
  let playerAfter = 0, bankerAfter = 0;

  for (let i = 0; i <= history.length - (patternLength + 1); i += 1) {
    const sample = history.slice(i, i + patternLength).join(",");
    if (sample !== pattern) continue;
    const next = history[i + patternLength];
    if (next === "Player") playerAfter += 1;
    else bankerAfter += 1;
  }

  const total = playerAfter + bankerAfter;
  if (total === 0) return null;
  const dominant = Math.max(playerAfter, bankerAfter);
  if (dominant / total >= 0.6) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.PATTERN);
    return {
      name: SIGNAL_NAMES.PATTERN,
      prediction: playerAfter > bankerAfter ? "Player" : "Banker",
      weight: (0.30 + total * 0.05) * m,
    };
  }
  return null;
}

function bankerEdgeSignal(): Signal {
  const m = tracker.getMultiplier(SIGNAL_NAMES.BANKER_EDGE);
  return { name: SIGNAL_NAMES.BANKER_EDGE, prediction: "Banker", weight: 0.05 * m };
}

// ==================== Adaptive Skip Logic ====================

/**
 * ระบบ skip อัจฉริยะ:
 * - ใช้ margin (ความต่างระหว่าง Player กับ Banker score)
 * - ใช้จำนวน signals ที่เห็นด้วย
 * - ปรับ threshold ตาม recent accuracy (ถ้าทายผิดบ่อย → เข้มขึ้น)
 */
function shouldSkip(
  margin: number,
  agreeingSignals: number,
  totalSignals: number,
  recentAccuracy: number,
  historyLength: number
): { skip: boolean; reason: string } {
  // ข้อมูลน้อยเกินไป
  if (historyLength < 5) {
    return { skip: true, reason: "ข้อมูลยังน้อย รอดูก่อน" };
  }

  // ปรับ threshold ตาม recent accuracy
  // ถ้าทายผิดบ่อย → ต้อง margin สูงขึ้นถึงจะยิง
  let marginThreshold = 0.15;
  let minAgree = 2;

  if (recentAccuracy < 0.45) {
    // ผิดเยอะมาก → เข้มสุด
    marginThreshold = 0.35;
    minAgree = 3;
  } else if (recentAccuracy < 0.50) {
    marginThreshold = 0.28;
    minAgree = 3;
  } else if (recentAccuracy < 0.55) {
    marginThreshold = 0.22;
    minAgree = 2;
  }

  if (margin < marginThreshold) {
    return { skip: true, reason: `สัญญาณก้ำกึ่ง (margin ${(margin * 100).toFixed(0)}% < ${(marginThreshold * 100).toFixed(0)}%)` };
  }

  if (agreeingSignals < minAgree && totalSignals >= 3) {
    return { skip: true, reason: `สัญญาณหนุนน้อย (${agreeingSignals}/${totalSignals})` };
  }

  return { skip: false, reason: "" };
}

// ==================== Learning Function ====================

/**
 * เรียกหลังจากได้ผลจริง เพื่อสอน AI
 * @param signalsUsed - สัญญาณที่ใช้ในการทำนายรอบก่อน
 * @param predictedResult - ผลที่ AI ทำนาย
 * @param actualResult - ผลจริง
 */
export function learnFromOutcome(
  signalsUsed: Signal[],
  predictedResult: PredictionResult,
  actualResult: BaccaratResult
) {
  if (predictedResult === "Skip" || actualResult === "Tie") return;

  for (const signal of signalsUsed) {
    const wasCorrect = signal.prediction === actualResult;
    tracker.recordOutcome(signal.name, wasCorrect, signal.weight);
  }
}

// ==================== Main Prediction ====================

export function predict(history: BaccaratResult[], recentAccuracy: number = 0.5): Prediction {
  const features = computeFeatures(history);
  const cleanHistory = nonTie(history);

  if (cleanHistory.length < 5) {
    return {
      result: "Skip",
      confidence: 0,
      features,
      reasoning: "รอข้อมูลเพิ่ม (ต้องมีอย่างน้อย 5 ตาที่ไม่ใช่ Tie)",
      signals: [],
      shouldBet: false,
    };
  }

  const signals = [
    streakSignal(cleanHistory),
    chopSignal(cleanHistory),
    doubleSignal(cleanHistory),
    ratioSignal(cleanHistory),
    patternMatchSignal(cleanHistory),
    bankerEdgeSignal(),
  ].filter((s): s is Signal => Boolean(s));

  const playerSignals = signals.filter((s) => s.prediction === "Player");
  const bankerSignals = signals.filter((s) => s.prediction === "Banker");

  const playerScore = sumWeights(playerSignals);
  const bankerScore = sumWeights(bankerSignals);
  const totalScore = playerScore + bankerScore;

  const margin = totalScore === 0 ? 0 : Math.abs(playerScore - bankerScore) / totalScore;
  const result: NonTieResult = playerScore > bankerScore ? "Player" : "Banker";
  const supportSignals = result === "Player" ? playerSignals : bankerSignals;

  // Adaptive skip
  const skipCheck = shouldSkip(margin, supportSignals.length, signals.length, recentAccuracy, cleanHistory.length);

  if (skipCheck.skip) {
    return {
      result: "Skip",
      confidence: Math.round(margin * 100),
      features,
      reasoning: `⏸ ${skipCheck.reason}`,
      signals,
      shouldBet: false,
    };
  }

  const sortedSupports = [...supportSignals].sort((a, b) => b.weight - a.weight);
  const strongestSignal = sortedSupports[0] || bankerEdgeSignal();

  const rawConfidence = 60 + margin * 30 + supportSignals.length * 3;
  const confidence = Math.round(Math.max(60, Math.min(95, rawConfidence)) * 10) / 10;

  return {
    result,
    confidence,
    features,
    reasoning: `${strongestSignal.name} | หนุน ${supportSignals.length} สัญญาณ`,
    signals,
    shouldBet: true,
  };
}

// ==================== Stats ====================

export function computeStats(history: BaccaratResult[], predictions: PredictionResult[]): GameStats {
  const { count, last } = getStreak(history);

  let correctPredictions = 0;
  let incorrectPredictions = 0;
  let skippedPredictions = 0;
  let attemptedPredictions = 0;

  for (let i = 0; i < Math.min(history.length, predictions.length); i += 1) {
    const actual = history[i];
    const predicted = predictions[i];

    if (predicted === "Skip") {
      skippedPredictions += 1;
      continue;
    }
    if (actual === "Tie") continue;

    attemptedPredictions += 1;
    if (predicted === actual) correctPredictions += 1;
    else incorrectPredictions += 1;
  }

  return {
    total: history.length,
    playerWins: history.filter((r) => r === "Player").length,
    bankerWins: history.filter((r) => r === "Banker").length,
    ties: history.filter((r) => r === "Tie").length,
    correctPredictions,
    incorrectPredictions,
    attemptedPredictions,
    skippedPredictions,
    currentStreak: count,
    streakType: last ?? null,
  };
}
