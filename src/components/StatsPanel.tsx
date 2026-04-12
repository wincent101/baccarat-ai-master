import { GameStats } from '@/lib/baccaratEngine';

interface Props {
  stats: GameStats;
}

export function StatsPanel({ stats }: Props) {
  const accuracy = stats.correctPredictions + stats.incorrectPredictions > 0
    ? ((stats.correctPredictions / (stats.correctPredictions + stats.incorrectPredictions)) * 100).toFixed(1)
    : '—';

  return (
    <div className="bg-card border border-border rounded-lg p-6 card-shadow">
      <h2 className="font-display text-gold text-sm tracking-widest uppercase mb-4">สถิติ</h2>
      
      <div className="grid grid-cols-2 gap-3">
        <StatItem label="ทั้งหมด" value={stats.total} />
        <StatItem label="ความแม่นยำ" value={`${accuracy}%`} highlight />
        <StatItem label="Player" value={stats.playerWins} color="text-casino-blue" />
        <StatItem label="Banker" value={stats.bankerWins} color="text-casino-red" />
        <StatItem label="Tie" value={stats.ties} color="text-casino-green" />
        <StatItem label="Streak" value={`${stats.currentStreak} ${stats.streakType?.[0] ?? ''}`} />
        <StatItem label="ทายถูก" value={stats.correctPredictions} color="text-casino-green" />
        <StatItem label="ทายผิด" value={stats.incorrectPredictions} color="text-destructive" />
      </div>

      {/* Win ratio bar */}
      {stats.total > 0 && (
        <div className="mt-4">
          <div className="h-3 bg-secondary rounded-full overflow-hidden flex">
            <div
              className="bg-casino-blue h-full transition-all"
              style={{ width: `${(stats.playerWins / stats.total) * 100}%` }}
            />
            <div
              className="bg-casino-green h-full transition-all"
              style={{ width: `${(stats.ties / stats.total) * 100}%` }}
            />
            <div
              className="bg-casino-red h-full transition-all"
              style={{ width: `${(stats.bankerWins / stats.total) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>P {((stats.playerWins / stats.total) * 100).toFixed(0)}%</span>
            <span>T {((stats.ties / stats.total) * 100).toFixed(0)}%</span>
            <span>B {((stats.bankerWins / stats.total) * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value, color, highlight }: { label: string; value: string | number; color?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md px-3 py-2 ${highlight ? 'bg-primary/10 border border-primary/30' : 'bg-secondary'}`}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-bold text-lg ${color ?? (highlight ? 'text-gold' : 'text-foreground')}`}>{value}</p>
    </div>
  );
}
