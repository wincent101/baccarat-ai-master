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

const SAFE_MODE = {
  minHistory: 4,
  minActiveSignals: 2,
  minStrongSupports: 2,
  strongSignalWeight: 0.18,
  minMargin: 0.18,
  maxOppositionRatio: 0.55,
};

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

export function computeFeatures(history: BaccaratResult[]): Prediction["features"] {
  if (history.length === 0) {
    return { streak: 0, pRatio: 0.5, bRatio: 0.5, tRatio: 0 };
  }

  const last12 = history.slice(-12);
  const total = last12.length;
  const pCount = last12.filter((result) => result === "Player").length;
  const bCount = last12.filter((result) => result === "Banker").length;
  const tCount = last12.filter((result) => result === "Tie").length;
  const { count } = getStreak(history);

  return {
    streak: count,
    pRatio: pCount / total,
    bRatio: bCount / total,
    tRatio: tCount / total,
  };
}

function streakSignal(history: NonTieResult[]): Signal | null {
  const { count, last } = getStreak(history);
  if (!last) return null;

  if (count >= 5) {
    return {
      name: `${last[0]} streak ${count} → กลับฝั่ง`,
      prediction: opposite(last),
      weight: 0.3,
    };
  }

  if (count === 4) {
    return {
      name: `${last[0]} streak 4 → กลับฝั่ง`,
      prediction: opposite(last),
      weight: 0.25,
    };
  }

  if (count === 3) {
    return {
      name: `${last[0]} streak 3 → กลับฝั่ง`,
      prediction: opposite(last),
      weight: 0.19,
    };
  }

  if (count === 1 && history.length >= 4) {
    return {
      name: "เพิ่งตัดหาง → ตามน้ำ",
      prediction: last,
      weight: 0.12,
    };
  }

  return null;
}

function chopSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 5) return null;

  const tail = history.slice(-6);
  let alternates = 0;

  for (let i = 1; i < tail.length; i += 1) {
    if (tail[i] !== tail[i - 1]) alternates += 1;
  }

  const ratio = alternates / (tail.length - 1);
  if (ratio >= 0.8) {
    return {
      name: "Chop ชัด → สลับอีกที",
      prediction: opposite(tail[tail.length - 1]),
      weight: 0.24,
    };
  }

  return null;
}

function doubleSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 4) return null;

  const a = history[history.length - 4];
  const b = history[history.length - 3];
  const c = history[history.length - 2];
  const d = history[history.length - 1];

  if (a === b && c === d && a !== c) {
    return {
      name: "Double pair → สลับ",
      prediction: opposite(d),
      weight: 0.23,
    };
  }

  if (b === c && a !== b && c !== d) {
    return {
      name: "กำลังปิดคู่ → ตามน้ำ",
      prediction: d,
      weight: 0.18,
    };
  }

  return null;
}

function ratioSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 8) return null;

  const recent = history.slice(-18);
  const playerRatio = recent.filter((result) => result === "Player").length / recent.length;

  if (playerRatio >= 0.67) {
    return {
      name: `P นำ ${(playerRatio * 100).toFixed(0)}% → กลับ B`,
      prediction: "Banker",
      weight: 0.19,
    };
  }

  if (playerRatio <= 0.33) {
    return {
      name: `B นำ ${((1 - playerRatio) * 100).toFixed(0)}% → กลับ P`,
      prediction: "Player",
      weight: 0.19,
    };
  }

  return null;
}

function patternMatchSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 9) return null;

  const pattern = history.slice(-3).join(",");
  let playerAfter = 0;
  let bankerAfter = 0;

  for (let i = 0; i <= history.length - 4; i += 1) {
    const sample = history.slice(i, i + 3).join(",");
    if (sample !== pattern) continue;

    const next = history[i + 3];
    if (next === "Player") playerAfter += 1;
    else bankerAfter += 1;
  }

  const total = playerAfter + bankerAfter;
  const dominant = Math.max(playerAfter, bankerAfter);
  if (total < 3 || dominant / total < 0.67) return null;

  return {
    name: `Pattern ซ้ำ ${total} ครั้ง`,
    prediction: playerAfter > bankerAfter ? "Player" : "Banker",
    weight: total >= 4 ? 0.28 : 0.22,
  };
}

function bankerEdgeSignal(): Signal {
  return {
    name: "Banker edge",
    prediction: "Banker",
    weight: 0.04,
  };
}

function skipPrediction(features: Prediction["features"], signals: Signal[], reasoning: string, confidence: number): Prediction {
  return {
    result: "Skip",
    confidence,
    features,
    reasoning,
    signals,
    shouldBet: false,
  };
}

export function predict(history: BaccaratResult[]): Prediction {
  const features = computeFeatures(history);
  const cleanHistory = nonTie(history);

  if (cleanHistory.length < SAFE_MODE.minHistory) {
    return skipPrediction(features, [], "รอข้อมูลเพิ่มก่อนค่อยยิง", 56);
  }

  const signals = [
    streakSignal(cleanHistory),
    chopSignal(cleanHistory),
    doubleSignal(cleanHistory),
    ratioSignal(cleanHistory),
    patternMatchSignal(cleanHistory),
    bankerEdgeSignal(),
  ].filter((signal): signal is Signal => Boolean(signal));

  const playerSignals = signals.filter((signal) => signal.prediction === "Player");
  const bankerSignals = signals.filter((signal) => signal.prediction === "Banker");
  const playerScore = sumWeights(playerSignals);
  const bankerScore = sumWeights(bankerSignals);
  const totalScore = playerScore + bankerScore;
  const margin = totalScore === 0 ? 0 : Math.abs(playerScore - bankerScore) / totalScore;
  const result: NonTieResult = playerScore > bankerScore ? "Player" : "Banker";
  const supportSignals = result === "Player" ? playerSignals : bankerSignals;
  const opposingSignals = result === "Player" ? bankerSignals : playerSignals;
  const activeSignals = signals.filter((signal) => signal.name !== "Banker edge");
  const strongSupports = supportSignals.filter((signal) => signal.weight >= SAFE_MODE.strongSignalWeight);
  const supportWeight = sumWeights(supportSignals);
  const opposingWeight = sumWeights(opposingSignals);
  const strongestSignal = supportSignals[0] ?? signals[0];
  const supportRatio = supportWeight === 0 ? 1 : opposingWeight / supportWeight;
  const rawConfidence = 55 + strongSupports.length * 7 + margin * 55;
  const confidence = Math.round(Math.max(56, Math.min(92, rawConfidence)) * 10) / 10;

  if (
    activeSignals.length < SAFE_MODE.minActiveSignals ||
    strongSupports.length < SAFE_MODE.minStrongSupports ||
    margin < SAFE_MODE.minMargin ||
    supportRatio > SAFE_MODE.maxOppositionRatio
  ) {
    const skipConfidence = Math.round(Math.max(58, Math.min(88, 60 + margin * 40 + strongSupports.length * 4)) * 10) / 10;
    return skipPrediction(
      features,
      signals,
      `งดทาย: สัญญาณยังไม่ขาด (${supportSignals.length}/${Math.max(activeSignals.length, 1)} เห็นด้วย)`,
      skipConfidence,
    );
  }

  return {
    result,
    confidence,
    features,
    reasoning: `${strongestSignal.name} | ยิงเมื่อสัญญาณหนุน ${supportSignals.length} ตัว`,
    signals,
    shouldBet: true,
  };
}

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
    playerWins: history.filter((result) => result === "Player").length,
    bankerWins: history.filter((result) => result === "Banker").length,
    ties: history.filter((result) => result === "Tie").length,
    correctPredictions,
    incorrectPredictions,
    attemptedPredictions,
    skippedPredictions,
    currentStreak: count,
    streakType: last ?? null,
  };
}
