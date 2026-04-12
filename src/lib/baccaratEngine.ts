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

// 1. ปรับปรุง Signal ให้วิเคราะห์แม่นขึ้น เน้นตามเค้าไพ่ (Trend Following) แทนการสวนเค้าไพ่
function streakSignal(history: NonTieResult[]): Signal | null {
  const { count, last } = getStreak(history);
  if (!last) return null;

  if (count >= 4) {
    return {
      name: `เค้าไพ่มังกร (${count} ไม้) → ตามมังกร`,
      prediction: last,
      weight: 0.45,
    };
  }

  if (count === 3) {
    return {
      name: `เค้าไพ่ 3 ตัว → ตามน้ำ`,
      prediction: last,
      weight: 0.30,
    };
  }

  if (count === 2) {
    return {
      name: `เค้าไพ่คู่ → ลุ้นตัวที่ 3`,
      prediction: last,
      weight: 0.20,
    };
  }

  if (count === 1 && history.length >= 3) {
    return {
      name: "เพิ่งตัดหาง → ตามสีใหม่",
      prediction: last,
      weight: 0.15,
    };
  }

  return null;
}

// 2. ปิงปอง (Chop) ให้เช็คแม่นยำขึ้น
function chopSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 4) return null;

  const tail = history.slice(-5);
  let alternates = 0;

  for (let i = 1; i < tail.length; i += 1) {
    if (tail[i] !== tail[i - 1]) alternates += 1;
  }

  if (alternates >= 3) {
    return {
      name: "เค้าไพ่ปิงปองชัดเจน → สลับสี",
      prediction: opposite(tail[tail.length - 1]),
      weight: 0.40,
    };
  }

  return null;
}

// 3. ไพ่สองตัวตัด (Double)
function doubleSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 4) return null;

  const a = history[history.length - 4];
  const b = history[history.length - 3];
  const c = history[history.length - 2];
  const d = history[history.length - 1];

  // ถ้าเป็นแบบคู่ตัด เช่น P P B B -> คาดเดาว่าน่าจะกลับไป P
  if (a === b && c === d && a !== c) {
    return {
      name: "เค้าไพ่ 2 ตัวตัด → สลับสี",
      prediction: opposite(d),
      weight: 0.35,
    };
  }

  // ถ้าเพิ่งขึ้นตัวที่ 2 ของสีใหม่ หลังจากสองตัวตัด เช่น P P B -> คาดเดา B
  if (b === c && a !== b && c !== d) {
    return {
      name: "เค้าไพ่กำลังปิดคู่ → ตามน้ำ",
      prediction: d,
      weight: 0.25,
    };
  }

  return null;
}

// 4. สัดส่วนการออก (Regression) ดึงกลับเมื่อสีใดสีหนึ่งออกมากเกินไป
function ratioSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 10) return null;

  const recent = history.slice(-20);
  const playerRatio = recent.filter((result) => result === "Player").length / recent.length;

  if (playerRatio >= 0.70) {
    return {
      name: `P ออกเยอะเกินไป ${(playerRatio * 100).toFixed(0)}% → ดึงกลับ B`,
      prediction: "Banker",
      weight: 0.25,
    };
  }

  if (playerRatio <= 0.30) {
    return {
      name: `B ออกเยอะเกินไป ${((1 - playerRatio) * 100).toFixed(0)}% → ดึงกลับ P`,
      prediction: "Player",
      weight: 0.25,
    };
  }

  return null;
}

// 5. Pattern Matching ปรับให้ฉลาดและให้น้ำหนักมากขึ้นเมื่อเจอแพทเทิร์นเดิมซ้ำๆ
function patternMatchSignal(history: NonTieResult[]): Signal | null {
  if (history.length < 7) return null;

  const patternLength = Math.min(3, history.length - 1);
  const pattern = history.slice(-patternLength).join(",");
  let playerAfter = 0;
  let bankerAfter = 0;

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
    return {
      name: `AI จำเค้าไพ่ได้ (เจอซ้ำ ${total} ครั้ง)`,
      prediction: playerAfter > bankerAfter ? "Player" : "Banker",
      weight: 0.30 + (total * 0.05), // ยิ่งเจอซ้ำบ่อย น้ำหนักยิ่งเยอะ
    };
  }

  return null;
}

function bankerEdgeSignal(): Signal {
  return {
    name: "Banker edge (สถิติหลัก)",
    prediction: "Banker",
    weight: 0.05,
  };
}

// ลบฟังก์ชัน skipPrediction ออก และบังคับให้ทำนายทุกตา
export function predict(history: BaccaratResult[]): Prediction {
  const features = computeFeatures(history);
  const cleanHistory = nonTie(history);

  // ถ้ายังไม่มีข้อมูลเลย ให้ทำนาย Banker เป็นค่าเริ่มต้น (ตามหลักสถิติ Baccarat)
  if (cleanHistory.length === 0) {
    return {
      result: "Banker",
      confidence: 55,
      features,
      reasoning: "เริ่มเกมใหม่ → แนะนำลง Banker (โอกาสชนะสูงกว่าเล็กน้อย)",
      signals: [bankerEdgeSignal()],
      shouldBet: true,
    };
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
  
  // บังคับให้ตัดสินใจเสมอ ห้ามเสมอหรือข้าม
  const result: NonTieResult = playerScore > bankerScore ? "Player" : "Banker";
  
  const supportSignals = result === "Player" ? playerSignals : bankerSignals;
  const margin = totalScore === 0 ? 0 : Math.abs(playerScore - bankerScore) / totalScore;
  
  // หาสัญญาณที่มีน้ำหนักมากที่สุดมาแสดงเป็นเหตุผลหลัก
  const sortedSupports = [...supportSignals].sort((a, b) => b.weight - a.weight);
  const strongestSignal = sortedSupports[0] || bankerEdgeSignal();

  // คำนวณความมั่นใจ (Confidence) ขั้นต่ำ 65% สูงสุด 98%
  const rawConfidence = 65 + (margin * 25) + (supportSignals.length * 2);
  const confidence = Math.round(Math.max(65, Math.min(98, rawConfidence)) * 10) / 10;

  return {
    result,
    confidence,
    features,
    reasoning: `${strongestSignal.name} | หนุน ${supportSignals.length} สัญญาณ`,
    signals,
    shouldBet: true, // บังคับให้เป็น true เสมอ เพื่อไม่ให้ข้าม
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