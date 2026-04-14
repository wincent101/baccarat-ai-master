import { getPatternMemory } from "./baccaratPatternMemory";
import { getTrainingLog, TrainingLogEntry } from "./baccaratTrainingLog";

export type BaccaratResult = "Player" | "Banker" | "Tie";
export type PredictionResult = "Player" | "Banker";
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

  getMultiplier(signalName: string): number {
    const rec = this.records.get(signalName);
    if (!rec) return 1.0;
    const total = rec.correct + rec.wrong;
    if (total < 3) return 1.0;

    const accuracy = rec.correct / total;
    if (accuracy < 0.45) return 0.1;
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
    getPatternMemory().reset();
  }
}

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
  MEMORY: "MemoryAI",
  MEMORY_CONSENSUS: "MemoryFusion",
} as const;

function streakSignal(history: NonTieResult[]): Signal | null {
  const { count, last } = getStreak(history);
  if (!last) return null;

  if (count >= 5) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.DRAGON);
    return { name: SIGNAL_NAMES.DRAGON, prediction: last, weight: 0.34 * m };
  }
  if (count === 3 || count === 4) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.STREAK3);
    return { name: SIGNAL_NAMES.STREAK3, prediction: last, weight: 0.28 * m };
  }
  if (count === 2) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.PAIR);
    return { name: SIGNAL_NAMES.PAIR, prediction: last, weight: 0.22 * m };
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
    return { name: SIGNAL_NAMES.RATIO_B, prediction: "Banker", weight: 0.18 * m };
  }
  if (playerRatio <= 0.30) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.RATIO_P);
    return { name: SIGNAL_NAMES.RATIO_P, prediction: "Player", weight: 0.18 * m };
  }
  return null;
}

function patternMatchSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 6) return null;
  const patternLength = 3;
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
  if (total < 2) return null;
  const dominant = Math.max(playerAfter, bankerAfter);
  if (dominant / total >= 0.60) {
    const m = tracker.getMultiplier(SIGNAL_NAMES.PATTERN);
    return {
      name: SIGNAL_NAMES.PATTERN,
      prediction: playerAfter > bankerAfter ? "Player" : "Banker",
      weight: Math.min(0.46, (0.18 + total * 0.03) * m),
    };
  }
  return null;
}

function bankerEdgeSignal(): Signal {
  const m = tracker.getMultiplier(SIGNAL_NAMES.BANKER_EDGE);
  return { name: SIGNAL_NAMES.BANKER_EDGE, prediction: "Banker", weight: 0.05 * m };
}

function memorySignal(history: BaccaratResult[]): Signal | null {
  const learned = getPatternMemory().evaluate(history);
  if (!learned) return null;

  const weight = Math.max(
    0.28,
    Math.min(0.78, 0.22 + (learned.confidence - 0.5) * 1.4 + Math.min(learned.support, 18) * 0.012)
  );

  return {
    name: learned.source === "consensus" ? SIGNAL_NAMES.MEMORY_CONSENSUS : SIGNAL_NAMES.MEMORY,
    prediction: learned.prediction,
    weight,
  };
}

// ==================== Learning Function ====================

export function learnFromOutcome(
  historyBeforeRound: BaccaratResult[],
  signalsUsed: Signal[],
  predictedResult: PredictionResult,
  actualResult: BaccaratResult
) {
  getPatternMemory().learn(historyBeforeRound, actualResult);
  if (actualResult === "Tie") return;

  for (const signal of signalsUsed) {
    const wasCorrect = signal.prediction === actualResult;
    tracker.recordOutcome(signal.name, wasCorrect, signal.weight);
  }
}

// ==================== Main Prediction ====================

export function predict(history: BaccaratResult[]): Prediction {
  const features = computeFeatures(history);
  const cleanHistory = nonTie(history);

  // Collect all signals
  const signals = [
    memorySignal(history),
    streakSignal(cleanHistory),
    chopSignal(cleanHistory),
    doubleSignal(cleanHistory),
    ratioSignal(cleanHistory),
    patternMatchSignal(cleanHistory),
  ].filter((s): s is Signal => Boolean(s));

  // Always add banker edge as tiebreaker
  const bankerEdge = bankerEdgeSignal();

  const allSignals = signals.length > 0 ? signals : [bankerEdge];

  const playerSignals = allSignals.filter((s) => s.prediction === "Player");
  const bankerSignals = allSignals.filter((s) => s.prediction === "Banker");

  const playerScore = sumWeights(playerSignals);
  const bankerScore = sumWeights(bankerSignals);
  const totalScore = playerScore + bankerScore;

  const margin = totalScore === 0 ? 0 : Math.abs(playerScore - bankerScore) / totalScore;
  
  // Always pick a side - never skip
  let result: PredictionResult;
  if (playerScore > bankerScore) {
    result = "Player";
  } else if (bankerScore > playerScore) {
    result = "Banker";
  } else {
    // Tie-break: use banker edge (statistical advantage)
    result = "Banker";
  }

  const supportSignals = result === "Player" ? playerSignals : bankerSignals;
  const sortedSupports = [...supportSignals].sort((a, b) => b.weight - a.weight);
  const strongestSignal = sortedSupports[0] || bankerEdge;

  const rawConfidence = 50 + margin * 40 + Math.min(supportSignals.length, 4) * 3;
  const confidence = Math.round(Math.max(50, Math.min(95, rawConfidence)) * 10) / 10;

  const signalNames = sortedSupports.slice(0, 3).map((s) => s.name).join(" + ");
  const reasoning = signals.length > 0
    ? `${signalNames} | ${supportSignals.length} สัญญาณ (${(margin * 100).toFixed(0)}%)`
    : `BankerEdge (ค่าเริ่มต้น)`;

  return {
    result,
    confidence,
    features,
    reasoning,
    signals: allSignals,
    shouldBet: true,
  };
}

// ==================== Training Log Integration ====================

export function logPrediction(
  history: BaccaratResult[],
  prediction: Prediction,
  actualResult: BaccaratResult
) {
  const features = prediction.features;
  const playerScore = sumWeights(prediction.signals.filter((s) => s.prediction === "Player"));
  const bankerScore = sumWeights(prediction.signals.filter((s) => s.prediction === "Banker"));
  const totalScore = playerScore + bankerScore;

  const entry: TrainingLogEntry = {
    round: history.length,
    timestamp: new Date().toISOString(),
    historyLength: history.length - 1,
    streak: features.streak,
    pRatio: features.pRatio,
    bRatio: features.bRatio,
    tRatio: features.tRatio,
    last10: history.slice(-11, -1).map((r) => r[0]).join(""),
    signals: prediction.signals.map((s) => ({
      name: s.name,
      prediction: s.prediction,
      weight: s.weight,
    })),
    signalCount: prediction.signals.length,
    playerScore,
    bankerScore,
    margin: totalScore === 0 ? 0 : Math.abs(playerScore - bankerScore) / totalScore,
    predicted: prediction.result,
    confidence: prediction.confidence,
    actual: actualResult,
    correct: actualResult === "Tie" ? null : prediction.result === actualResult,
  };

  getTrainingLog().add(entry);
}

// ==================== Stats ====================

export function computeStats(history: BaccaratResult[], predictions: PredictionResult[]): GameStats {
  const { count, last } = getStreak(history);

  let correctPredictions = 0;
  let incorrectPredictions = 0;
  let attemptedPredictions = 0;

  for (let i = 0; i < Math.min(history.length, predictions.length); i += 1) {
    const actual = history[i];
    const predicted = predictions[i];

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
    currentStreak: count,
    streakType: last ?? null,
  };
}
