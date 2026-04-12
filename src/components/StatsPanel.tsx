import { GameStats } from "@/lib/baccaratEngine";

interface Props {
  stats: GameStats;
}

export function StatsPanel({ stats }: Props) {
  const accuracy = stats.attemptedPredictions > 0
    ? ((stats.correctPredictions / stats.attemptedPredictions) * 100).toFixed(1)
    : "—";

  return (
    <div className="card-shadow rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-gold">สถิติ</h2>

      <div className="grid grid-cols-2 gap-3">
        <StatItem label="ทั้งหมด" value={stats.total} />
        <StatItem label="ความแม่นยำ" value={`${accuracy}%`} highlight />
        <StatItem label="ยิงจริง" value={stats.attemptedPredictions} color="text-gold" />
        <StatItem label="SKIP" value={stats.skippedPredictions} color="text-gold" />
        <StatItem label="ทายถูก" value={stats.correctPredictions} color="text-casino-green" />
        <StatItem label="ทายผิด" value={stats.incorrectPredictions} color="text-destructive" />
        <StatItem label="Player" value={stats.playerWins} color="text-casino-blue" />
        <StatItem label="Banker" value={stats.bankerWins} color="text-casino-red" />
        <StatItem label="Tie" value={stats.ties} color="text-casino-green" />
        <StatItem label="Streak" value={`${stats.currentStreak} ${stats.streakType?.[0] ?? ""}`} />
      </div>

      {stats.total > 0 && (
        <div className="mt-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-casino-blue transition-all" style={{ width: `${(stats.playerWins / stats.total) * 100}%` }} />
            <div className="h-full bg-casino-green transition-all" style={{ width: `${(stats.ties / stats.total) * 100}%` }} />
            <div className="h-full bg-casino-red transition-all" style={{ width: `${(stats.bankerWins / stats.total) * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>P {((stats.playerWins / stats.total) * 100).toFixed(0)}%</span>
            <span>T {((stats.ties / stats.total) * 100).toFixed(0)}%</span>
            <span>B {((stats.bankerWins / stats.total) * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: string | number;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-md px-3 py-2 ${highlight ? "border border-primary/30 bg-primary/10" : "bg-secondary"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color ?? (highlight ? "text-gold" : "text-foreground")}`}>{value}</p>
    </div>
  );
}
