import { TRAINING_RESULT_SEED } from "./baccaratTrainingSeed";

type BaccaratResultLike = "Player" | "Banker" | "Tie";
type NonTieResult = "Player" | "Banker";

export interface MemoryPrediction {
  prediction: NonTieResult;
  confidence: number;
  support: number;
  source: "sequence" | "neighbour" | "consensus";
}

interface SequenceRecord {
  player: number;
  banker: number;
}

interface FeatureSample {
  streak: number;
  pRatio: number;
  bRatio: number;
  tRatio: number;
  actual: NonTieResult;
}

const SEQUENCE_LENGTHS = [5, 4, 3] as const;
const MIN_HISTORY = 5;
const MIN_SEQUENCE_SUPPORT = 5;
const MIN_SEQUENCE_CONFIDENCE = 0.6;
const NEIGHBOUR_COUNT = 11;
const MIN_NEIGHBOUR_CONFIDENCE = 0.6;
const CONFLICT_CONFIDENCE = 0.58;
const MAX_SAMPLES = 2200;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nonTie(history: BaccaratResultLike[]): NonTieResult[] {
  return history.filter((result): result is NonTieResult => result !== "Tie");
}

function encodeSequence(history: NonTieResult[]): string {
  return history.map((result) => (result === "Player" ? "P" : "B")).join("");
}

function decodeSeed(seed: string): BaccaratResultLike[] {
  return seed.split("").map((char) => {
    if (char === "P") return "Player";
    if (char === "B") return "Banker";
    return "Tie";
  });
}

function getStreak(history: BaccaratResultLike[]): number {
  if (history.length === 0) return 0;
  const last = history[history.length - 1];
  let count = 1;
  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index] === last) count += 1;
    else break;
  }
  return count;
}

function snapshot(history: BaccaratResultLike[]) {
  if (history.length === 0) {
    return { streak: 0, pRatio: 0.5, bRatio: 0.5, tRatio: 0 };
  }

  const last12 = history.slice(-12);
  const total = last12.length;

  return {
    streak: getStreak(history),
    pRatio: last12.filter((result) => result === "Player").length / total,
    bRatio: last12.filter((result) => result === "Banker").length / total,
    tRatio: last12.filter((result) => result === "Tie").length / total,
  };
}

export class BaccaratPatternMemory {
  private sequenceCounts = new Map<string, SequenceRecord>();

  private samples: FeatureSample[] = [];

  constructor(seed: string = TRAINING_RESULT_SEED) {
    this.bootstrap(seed);
  }

  private bootstrap(seed: string) {
    const history: BaccaratResultLike[] = [];
    for (const result of decodeSeed(seed)) {
      this.learn(history, result);
      history.push(result);
    }
  }

  private getRecord(key: string): SequenceRecord {
    const existing = this.sequenceCounts.get(key);
    if (existing) return existing;

    const record: SequenceRecord = { player: 0, banker: 0 };
    this.sequenceCounts.set(key, record);
    return record;
  }

  reset() {
    this.sequenceCounts.clear();
    this.samples = [];
    this.bootstrap(TRAINING_RESULT_SEED);
  }

  learn(historyBeforeRound: BaccaratResultLike[], actualResult: BaccaratResultLike) {
    const cleanHistory = nonTie(historyBeforeRound);

    if (actualResult !== "Tie") {
      for (const length of SEQUENCE_LENGTHS) {
        if (cleanHistory.length < length) continue;

        const key = encodeSequence(cleanHistory.slice(-length));
        const record = this.getRecord(key);

        if (actualResult === "Player") record.player += 1;
        else record.banker += 1;
      }

      this.samples.push({ ...snapshot(historyBeforeRound), actual: actualResult });
      if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    }
  }

  evaluate(history: BaccaratResultLike[]): MemoryPrediction | null {
    const cleanHistory = nonTie(history);
    if (cleanHistory.length < MIN_HISTORY) return null;

    const sequencePrediction = this.resolveSequence(cleanHistory);
    const neighbourPrediction = this.resolveNeighbours(snapshot(history));

    if (sequencePrediction && neighbourPrediction) {
      if (
        sequencePrediction.prediction !== neighbourPrediction.prediction &&
        sequencePrediction.confidence >= CONFLICT_CONFIDENCE &&
        neighbourPrediction.confidence >= CONFLICT_CONFIDENCE
      ) {
        return null;
      }

      if (sequencePrediction.prediction === neighbourPrediction.prediction) {
        return {
          prediction: sequencePrediction.prediction,
          confidence: clamp(sequencePrediction.confidence * 0.6 + neighbourPrediction.confidence * 0.4 + 0.03, 0.5, 0.92),
          support: sequencePrediction.support + neighbourPrediction.support,
          source: "consensus",
        };
      }

      return sequencePrediction.confidence >= neighbourPrediction.confidence ? sequencePrediction : neighbourPrediction;
    }

    return sequencePrediction ?? neighbourPrediction;
  }

  private resolveSequence(cleanHistory: NonTieResult[]): MemoryPrediction | null {
    for (const length of SEQUENCE_LENGTHS) {
      if (cleanHistory.length < length) continue;

      const key = encodeSequence(cleanHistory.slice(-length));
      const record = this.sequenceCounts.get(key);
      if (!record) continue;

      const support = record.player + record.banker;
      if (support < MIN_SEQUENCE_SUPPORT) continue;

      const confidence = Math.max(record.player, record.banker) / support;
      if (confidence < MIN_SEQUENCE_CONFIDENCE) continue;

      return {
        prediction: record.player > record.banker ? "Player" : "Banker",
        confidence,
        support,
        source: "sequence",
      };
    }

    return null;
  }

  private resolveNeighbours(current: Omit<FeatureSample, "actual">): MemoryPrediction | null {
    if (this.samples.length < NEIGHBOUR_COUNT) return null;

    const topNeighbours = [...this.samples]
      .map((sample) => ({
        sample,
        distance:
          Math.abs(current.streak - sample.streak) / 4 +
          Math.abs(current.pRatio - sample.pRatio) / 0.35 +
          Math.abs(current.bRatio - sample.bRatio) / 0.35 +
          Math.abs(current.tRatio - sample.tRatio) / 0.15,
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, NEIGHBOUR_COUNT);

    let playerScore = 0;
    let bankerScore = 0;

    for (const neighbour of topNeighbours) {
      const weight = 1 / (neighbour.distance + 0.15);
      if (neighbour.sample.actual === "Player") playerScore += weight;
      else bankerScore += weight;
    }

    const totalScore = playerScore + bankerScore;
    if (totalScore === 0) return null;

    const confidence = Math.max(playerScore, bankerScore) / totalScore;
    if (confidence < MIN_NEIGHBOUR_CONFIDENCE) return null;

    return {
      prediction: playerScore > bankerScore ? "Player" : "Banker",
      confidence,
      support: topNeighbours.length,
      source: "neighbour",
    };
  }
}

const patternMemory = new BaccaratPatternMemory();

export function getPatternMemory(): BaccaratPatternMemory {
  return patternMemory;
}