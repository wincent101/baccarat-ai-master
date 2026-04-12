import { BaccaratResult } from '@/lib/baccaratEngine';

interface Props {
  history: BaccaratResult[];
  predictions: BaccaratResult[];
}

export function GameHistory({ history, predictions }: Props) {
  if (history.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 card-shadow">
        <h2 className="font-display text-gold text-sm tracking-widest uppercase mb-3">ประวัติ</h2>
        <p className="text-muted-foreground text-sm">ยังไม่มีข้อมูล</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 card-shadow">
      <h2 className="font-display text-gold text-sm tracking-widest uppercase mb-3">
        ประวัติ ({history.length} เกม)
      </h2>
      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
        {history.map((result, i) => {
          const predicted = predictions[i];
          const isCorrect = result !== 'Tie' && predicted === result;
          const isTie = result === 'Tie';

          return (
            <div
              key={i}
              className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold relative
                ${result === 'Player' ? 'bg-casino-blue/20 text-casino-blue' : ''}
                ${result === 'Banker' ? 'bg-casino-red/20 text-casino-red' : ''}
                ${result === 'Tie' ? 'bg-casino-green/20 text-casino-green' : ''}
              `}
              title={`#${i + 1}: ${result}${predicted ? ` (ทาย: ${predicted})` : ''}`}
            >
              {result[0]}
              {!isTie && predicted && (
                <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${isCorrect ? 'bg-casino-green' : 'bg-destructive'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
