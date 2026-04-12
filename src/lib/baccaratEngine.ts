export type BaccaratResult = 'Player' | 'Banker' | 'Tie';

export interface Prediction {
  result: BaccaratResult;
  confidence: number;
  features: {
    streak: number;
    pRatio: number;
    bRatio: number;
    tRatio: number;
  };
  reasoning: string;
}

export interface GameStats {
  total: number;
  playerWins: number;
  bankerWins: number;
  ties: number;
  correctPredictions: number;
  incorrectPredictions: number;
  currentStreak: number;
  streakType: BaccaratResult | null;
}

// Pattern weights derived from trained model feature importances
const WEIGHTS = {
  streak: 0.254,
  pRatio: 0.373,
  bRatio: 0.231,
  tRatio: 0.142,
};

// Streak-based probabilities from training data
const STREAK_PROBS: Record<number, number> = {
  1: 0.521, 2: 0.566, 3: 0.448, 4: 0.556, 5: 0.273, 6: 0.5,
};

// PRatio-based probabilities
function getPRatioBias(pRatio: number): number {
  if (pRatio < 0.4) return 0.533;
  if (pRatio < 0.5) return 0.580;
  if (pRatio < 0.6) return 0.525;
  return 0.410;
}

export function computeFeatures(history: BaccaratResult[]): Prediction['features'] {
  if (history.length === 0) {
    return { streak: 0, pRatio: 0.5, bRatio: 0.5, tRatio: 0 };
  }

  const last12 = history.slice(-12);
  const pCount = last12.filter(r => r === 'Player').length;
  const bCount = last12.filter(r => r === 'Banker').length;
  const tCount = last12.filter(r => r === 'Tie').length;
  const total = last12.length;

  // Calculate streak
  let streak = 1;
  const lastResult = history[history.length - 1];
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i] === lastResult) streak++;
    else break;
  }

  return {
    streak,
    pRatio: pCount / total,
    bRatio: bCount / total,
    tRatio: tCount / total,
  };
}

export function predict(history: BaccaratResult[]): Prediction {
  const features = computeFeatures(history);

  if (history.length < 3) {
    return {
      result: 'Banker',
      confidence: 51.0,
      features,
      reasoning: 'ข้อมูลยังน้อย — Banker มีขอบเล็กน้อยตามสถิติ',
    };
  }

  // Combine multiple signals
  const streakProb = STREAK_PROBS[Math.min(features.streak, 6)] ?? 0.5;
  const ratioProb = getPRatioBias(features.pRatio);

  // Weighted ensemble
  const playerProb =
    streakProb * WEIGHTS.streak +
    ratioProb * WEIGHTS.pRatio +
    (1 - features.bRatio) * WEIGHTS.bRatio +
    (1 - features.tRatio * 2) * WEIGHTS.tRatio;

  // Trend reversal detection
  const last5 = history.slice(-5);
  const last5P = last5.filter(r => r === 'Player').length;
  const trendFactor = last5P >= 4 ? -0.08 : last5P <= 1 ? 0.08 : 0;

  const adjustedProb = Math.max(0.3, Math.min(0.7, playerProb + trendFactor));
  const isPlayer = adjustedProb > 0.5;
  const confidence = Math.abs(adjustedProb - 0.5) * 200;
  const clampedConf = Math.max(35, Math.min(92, 50 + confidence));

  let reasoning = '';
  if (features.streak >= 4) {
    reasoning = `ตรวจพบ Streak ${features.streak} ครั้ง — มีโอกาสเปลี่ยนฝั่ง`;
  } else if (Math.abs(features.pRatio - features.bRatio) > 0.2) {
    reasoning = features.pRatio > features.bRatio
      ? 'Player ออกบ่อยกว่า — อาจจะกลับ Banker'
      : 'Banker ออกบ่อยกว่า — อาจจะกลับ Player';
  } else {
    reasoning = 'สมดุลใกล้เคียง — ใช้แพทเทิร์นรวม';
  }

  return {
    result: isPlayer ? 'Player' : 'Banker',
    confidence: Math.round(clampedConf * 10) / 10,
    features,
    reasoning,
  };
}

export function computeStats(
  history: BaccaratResult[],
  predictions: BaccaratResult[]
): GameStats {
  let streak = 0;
  let streakType: BaccaratResult | null = null;
  if (history.length > 0) {
    streakType = history[history.length - 1];
    streak = 1;
    for (let i = history.length - 2; i >= 0; i--) {
      if (history[i] === streakType) streak++;
      else break;
    }
  }

  let correct = 0;
  let incorrect = 0;
  for (let i = 0; i < Math.min(history.length, predictions.length); i++) {
    if (history[i] === 'Tie') continue;
    if (predictions[i] === history[i]) correct++;
    else incorrect++;
  }

  return {
    total: history.length,
    playerWins: history.filter(r => r === 'Player').length,
    bankerWins: history.filter(r => r === 'Banker').length,
    ties: history.filter(r => r === 'Tie').length,
    correctPredictions: correct,
    incorrectPredictions: incorrect,
    currentStreak: streak,
    streakType,
  };
}
