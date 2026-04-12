import { Prediction } from "@/lib/baccaratEngine";

interface Props {
  prediction: Prediction | null;
}

export function PredictionDisplay({ prediction }: Props) {
  if (!prediction) {
    return (
      <div className="card-shadow rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-lg text-muted-foreground">เพิ่มผลลัพธ์เพื่อเริ่มการทำนาย</p>
      </div>
    );
  }

  const isPlayer = prediction.result === "Player";
  const isSkip = prediction.result === "Skip";
  const toneClasses = isSkip
    ? "border-gold bg-gold/10 text-gold"
    : isPlayer
      ? "border-casino-blue bg-casino-blue/20 text-casino-blue"
      : "border-casino-red bg-casino-red/20 text-casino-red";
  const barClasses = isSkip ? "bg-gold" : isPlayer ? "bg-casino-blue" : "bg-casino-red";
  const label = isSkip ? "SKIP" : prediction.result === "Player" ? "PLAYER" : "BANKER";

  return (
    <div className="card-shadow animate-slide-up rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 text-center font-display text-sm uppercase tracking-widest text-gold">
        ผลแนะนำถัดไป
      </h2>

      <div className="flex flex-col items-center gap-4">
        <div className={`animate-pulse-gold flex h-32 w-32 items-center justify-center rounded-full border-2 text-2xl font-display font-bold ${toneClasses}`}>
          {isSkip ? "—" : prediction.result[0]}
        </div>

        <div className="text-center">
          <p className={`text-2xl font-bold ${isSkip ? "text-gold" : isPlayer ? "text-casino-blue" : "text-casino-red"}`}>
            {label}
          </p>
          <p className="mt-1 text-lg font-semibold text-gold">
            {isSkip ? `ถือรอ ${prediction.confidence}%` : `ความมั่นใจ ${prediction.confidence}%`}
          </p>
        </div>

        <div className="w-full max-w-xs">
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full transition-all duration-500 ${barClasses}`} style={{ width: `${prediction.confidence}%` }} />
          </div>
        </div>

        <p className="max-w-xs text-center text-sm text-muted-foreground">{prediction.reasoning}</p>

        {prediction.signals.length > 0 && (
          <div className="w-full max-w-xs space-y-1">
            {prediction.signals
              .slice()
              .sort((a, b) => b.weight - a.weight)
              .map((signal) => (
                <div key={signal.name} className="flex items-center justify-between rounded bg-secondary/50 px-2 py-1 text-xs">
                  <span className="mr-2 truncate text-muted-foreground">{signal.name}</span>
                  <span className={signal.prediction === "Player" ? "font-semibold text-casino-blue" : "font-semibold text-casino-red"}>
                    {signal.prediction[0]} ({Math.round(signal.weight * 100)}%)
                  </span>
                </div>
              ))}
          </div>
        )}

        <div className="mt-1 grid w-full max-w-xs grid-cols-4 gap-2">
          <FeatureChip label="Streak" value={prediction.features.streak.toString()} />
          <FeatureChip label="P" value={`${(prediction.features.pRatio * 100).toFixed(0)}%`} />
          <FeatureChip label="B" value={`${(prediction.features.bRatio * 100).toFixed(0)}%`} />
          <FeatureChip label="T" value={`${(prediction.features.tRatio * 100).toFixed(0)}%`} />
        </div>
      </div>
    </div>
  );
}

function FeatureChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary px-2 py-1.5 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}
