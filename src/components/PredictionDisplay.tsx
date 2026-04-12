import { Prediction } from '@/lib/baccaratEngine';

interface Props {
  prediction: Prediction | null;
}

export function PredictionDisplay({ prediction }: Props) {
  if (!prediction) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center card-shadow">
        <p className="text-muted-foreground text-lg">เพิ่มผลลัพธ์เพื่อเริ่มการทำนาย</p>
      </div>
    );
  }

  const isPlayer = prediction.result === 'Player';

  return (
    <div className="bg-card border border-border rounded-lg p-6 card-shadow animate-slide-up">
      <h2 className="font-display text-gold text-center text-sm tracking-widest uppercase mb-4">
        ผลทำนายถัดไป
      </h2>

      <div className="flex flex-col items-center gap-4">
        <div
          className={`w-32 h-32 rounded-full flex items-center justify-center text-2xl font-display font-bold animate-pulse-gold ${
            isPlayer
              ? 'bg-casino-blue/20 border-2 border-casino-blue text-casino-blue'
              : 'bg-casino-red/20 border-2 border-casino-red text-casino-red'
          }`}
        >
          {prediction.result === 'Player' ? 'P' : 'B'}
        </div>

        <div className="text-center">
          <p className={`text-2xl font-bold ${isPlayer ? 'text-casino-blue' : 'text-casino-red'}`}>
            {prediction.result === 'Player' ? 'PLAYER' : 'BANKER'}
          </p>
          <p className="text-gold text-lg font-semibold mt-1">
            ความมั่นใจ {prediction.confidence}%
          </p>
        </div>

        {/* Confidence bar */}
        <div className="w-full max-w-xs">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isPlayer ? 'bg-casino-blue' : 'bg-casino-red'
              }`}
              style={{ width: `${prediction.confidence}%` }}
            />
          </div>
        </div>

        <p className="text-muted-foreground text-sm text-center max-w-xs">
          {prediction.reasoning}
        </p>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-xs mt-2">
          <FeatureChip label="Streak" value={prediction.features.streak.toString()} />
          <FeatureChip label="P Ratio" value={`${(prediction.features.pRatio * 100).toFixed(0)}%`} />
          <FeatureChip label="B Ratio" value={`${(prediction.features.bRatio * 100).toFixed(0)}%`} />
          <FeatureChip label="T Ratio" value={`${(prediction.features.tRatio * 100).toFixed(0)}%`} />
        </div>
      </div>
    </div>
  );
}

function FeatureChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary rounded-md px-3 py-2 text-center">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground font-semibold text-sm">{value}</p>
    </div>
  );
}
