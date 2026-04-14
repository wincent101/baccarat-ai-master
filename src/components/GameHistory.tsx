import { BaccaratResult, PredictionResult } from "@/lib/baccaratEngine";

interface Props {
  history: BaccaratResult[];
  predictions: PredictionResult[];
}

export function GameHistory({ history, predictions }: Props) {
  if (history.length === 0) {
    return (
      <div className="card-shadow rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">ประวัติ</h2>
        <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
      </div>
    );
  }

  return (
    <div className="card-shadow rounded-lg border border-border bg-card p-6">
      <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-gold">ประวัติ ({history.length} เกม)</h2>
      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
        {history.map((result, index) => {
          const predicted = predictions[index];
          const isScored = predicted && result !== "Tie";
          const isCorrect = isScored && predicted === result;
          const cellClasses =
            result === "Player"
              ? "bg-casino-blue/20 text-casino-blue"
              : result === "Banker"
                ? "bg-casino-red/20 text-casino-red"
                : "bg-casino-green/20 text-casino-green";
          const indicatorClasses = isCorrect ? "bg-casino-green" : "bg-destructive";

          return (
            <div
              key={`${result}-${index}`}
              className={`relative flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold ${cellClasses}`}
              title={`#${index + 1}: ${result}${predicted ? ` | ทาย: ${predicted}` : ""}`}
            >
              {result[0]}
              {predicted && result !== "Tie" && (
                <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ${indicatorClasses}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
