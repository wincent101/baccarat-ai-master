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

        <div className="w-full max-w-xs">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isPlayer ? 'bg-casino-blue' : 'bg-casino-red'}`}
              style={{ width: `${prediction.confidence}%` }}
            />
          </div>
        </div>

        <p className="text-muted-foreground text-sm text-center max-w-xs">
          {prediction.reasoning}
        </p>

        {/* Signals */}
        {prediction.signals.length > 0 && (
          <div className="w-full max-w-xs space-y-1">
            {prediction.signals.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-secondary/50">
                <span className="text-muted-foreground truncate mr-2">{s.name}</span>
                <span className={`font-semibold ${s.prediction === 'Player' ? 'text-casino-blue' : 'text-casino-red'}`}>
                  {s.prediction[0]} ({(s.weight * 100).toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2 w-full max-w-xs mt-1">
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
    <div className="bg-secondary rounded-md px-2 py-1.5 text-center">
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="text-foreground font-semibold text-xs">{value}</p>
    </div>
  );
}
