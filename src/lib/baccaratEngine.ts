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
  signals: Signal[];
}

interface Signal {
  name: string;
  prediction: 'Player' | 'Banker';
  weight: number;
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

// Filter out ties for pattern analysis
function nonTie(history: BaccaratResult[]): ('Player' | 'Banker')[] {
  return history.filter((r): r is 'Player' | 'Banker' => r !== 'Tie');
}

export function computeFeatures(history: BaccaratResult[]): Prediction['features'] {
  if (history.length === 0) return { streak: 0, pRatio: 0.5, bRatio: 0.5, tRatio: 0 };

  const last12 = history.slice(-12);
  const total = last12.length;
  const pCount = last12.filter(r => r === 'Player').length;
  const bCount = last12.filter(r => r === 'Banker').length;
  const tCount = last12.filter(r => r === 'Tie').length;

  let streak = 1;
  const lastResult = history[history.length - 1];
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i] === lastResult) streak++;
    else break;
  }

  return { streak, pRatio: pCount / total, bRatio: bCount / total, tRatio: tCount / total };
}

// Signal 1: Streak reversal — long streaks tend to break
function streakSignal(h: ('Player' | 'Banker')[]): Signal | null {
  if (h.length < 2) return null;
  let streak = 1;
  const last = h[h.length - 1];
  for (let i = h.length - 2; i >= 0; i--) {
    if (h[i] === last) streak++;
    else break;
  }
  if (streak >= 3) {
    const opposite = last === 'Player' ? 'Banker' : 'Player';
    return { name: `Streak ${streak}x${last[0]} → สลับ`, prediction: opposite, weight: 0.15 + Math.min(streak - 3, 4) * 0.05 };
  }
  if (streak === 1) {
    // Follow the new direction after a break
    return { name: 'เริ่มทิศทางใหม่', prediction: last, weight: 0.08 };
  }
  return null;
}

// Signal 2: Alternating (chop) pattern — P B P B ...
function chopSignal(h: ('Player' | 'Banker')[]): Signal | null {
  if (h.length < 4) return null;
  const tail = h.slice(-6);
  let alternates = 0;
  for (let i = 1; i < tail.length; i++) {
    if (tail[i] !== tail[i - 1]) alternates++;
  }
  const chopRatio = alternates / (tail.length - 1);
  if (chopRatio >= 0.75) {
    const opposite = h[h.length - 1] === 'Player' ? 'Banker' : 'Player';
    return { name: 'Chop pattern', prediction: opposite, weight: 0.20 };
  }
  return null;
}

// Signal 3: Double pattern — PP BB PP BB ...
function doubleSignal(h: ('Player' | 'Banker')[]): Signal | null {
  if (h.length < 6) return null;
  const tail = h.slice(-8);
  // Check pairs
  let pairMatches = 0;
  let totalPairs = 0;
  for (let i = 0; i + 1 < tail.length; i += 2) {
    totalPairs++;
    if (tail[i] === tail[i + 1]) pairMatches++;
  }
  if (totalPairs >= 3 && pairMatches / totalPairs >= 0.66) {
    const last = h[h.length - 1];
    const secondLast = h.length >= 2 ? h[h.length - 2] : null;
    if (secondLast && secondLast === last) {
      // Pair complete, next should switch
      const opposite = last === 'Player' ? 'Banker' : 'Player';
      return { name: 'Double pair → สลับ', prediction: opposite, weight: 0.18 };
    } else {
      // In middle of pair, continue
      return { name: 'Double pair → ต่อ', prediction: last, weight: 0.18 };
    }
  }
  return null;
}

// Signal 4: Ratio reversion — if one side is over-represented, expect mean reversion
function ratioSignal(h: ('Player' | 'Banker')[]): Signal | null {
  if (h.length < 8) return null;
  const recent = h.slice(-16);
  const pCount = recent.filter(r => r === 'Player').length;
  const ratio = pCount / recent.length;
  if (ratio > 0.62) {
    return { name: `P สูง ${(ratio * 100).toFixed(0)}% → กลับ B`, prediction: 'Banker', weight: 0.15 };
  }
  if (ratio < 0.38) {
    return { name: `B สูง ${((1 - ratio) * 100).toFixed(0)}% → กลับ P`, prediction: 'Player', weight: 0.15 };
  }
  return null;
}

// Signal 5: Last 3 pattern matching — find repeating 3-result patterns
function patternMatchSignal(h: ('Player' | 'Banker')[]): Signal | null {
  if (h.length < 8) return null;
  const last3 = h.slice(-3).join(',');
  // Search history for same pattern and what came after
  let pAfter = 0, bAfter = 0;
  for (let i = 0; i < h.length - 3; i++) {
    const pat = h.slice(i, i + 3).join(',');
    if (pat === last3 && i + 3 < h.length) {
      if (h[i + 3] === 'Player') pAfter++;
      else bAfter++;
    }
  }
  const total = pAfter + bAfter;
  if (total >= 2) {
    const pred = pAfter > bAfter ? 'Player' : 'Banker';
    const ratio = Math.max(pAfter, bAfter) / total;
    if (ratio >= 0.6) {
      return { name: `Pattern match (${total}x)`, prediction: pred, weight: 0.22 };
    }
  }
  return null;
}

// Signal 6: Banker edge — natural house edge
function bankerEdgeSignal(): Signal {
  return { name: 'Banker edge ธรรมชาติ', prediction: 'Banker', weight: 0.05 };
}

// Adaptive weight adjustment based on session accuracy
function adaptiveBoost(
  signals: Signal[],
  history: BaccaratResult[],
  pastSignalResults: Map<string, { correct: number; total: number }>
): Signal[] {
  return signals.map(s => {
    const record = pastSignalResults.get(s.name);
    if (record && record.total >= 3) {
      const accuracy = record.correct / record.total;
      const boost = accuracy > 0.55 ? 1.3 : accuracy < 0.45 ? 0.5 : 1.0;
      return { ...s, weight: s.weight * boost };
    }
    return s;
  });
}

export function predict(history: BaccaratResult[]): Prediction {
  const features = computeFeatures(history);
  const h = nonTie(history);

  if (h.length < 3) {
    return {
      result: 'Banker',
      confidence: 52.0,
      features,
      reasoning: 'ข้อมูลยังน้อย — Banker มีขอบเล็กน้อย',
      signals: [],
    };
  }

  // Collect all signals
  const signals: Signal[] = [];
  const s1 = streakSignal(h); if (s1) signals.push(s1);
  const s2 = chopSignal(h); if (s2) signals.push(s2);
  const s3 = doubleSignal(h); if (s3) signals.push(s3);
  const s4 = ratioSignal(h); if (s4) signals.push(s4);
  const s5 = patternMatchSignal(h); if (s5) signals.push(s5);
  signals.push(bankerEdgeSignal());

  // Weighted vote
  let playerScore = 0, bankerScore = 0;
  for (const s of signals) {
    if (s.prediction === 'Player') playerScore += s.weight;
    else bankerScore += s.weight;
  }

  const total = playerScore + bankerScore;
  const playerProb = total > 0 ? playerScore / total : 0.5;

  const isPlayer = playerProb > 0.5;
  const margin = Math.abs(playerProb - 0.5);
  const confidence = Math.max(52, Math.min(88, 50 + margin * 80));

  // Build reasoning from strongest signal
  const strongestSignal = signals.reduce((a, b) => a.weight > b.weight ? a : b);
  const agreeCount = signals.filter(s => s.prediction === (isPlayer ? 'Player' : 'Banker')).length;
  const reasoning = `${strongestSignal.name} | สัญญาณเห็นด้วย ${agreeCount}/${signals.length}`;

  return {
    result: isPlayer ? 'Player' : 'Banker',
    confidence: Math.round(confidence * 10) / 10,
    features,
    reasoning,
    signals,
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

  let correct = 0, incorrect = 0;
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
