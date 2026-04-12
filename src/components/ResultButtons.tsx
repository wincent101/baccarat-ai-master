import { BaccaratResult } from '@/lib/baccaratEngine';

interface Props {
  onResult: (result: BaccaratResult) => void;
  onUndo: () => void;
  onReset: () => void;
  canUndo: boolean;
}

export function ResultButtons({ onResult, onUndo, onReset, canUndo }: Props) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-gold text-sm tracking-widest uppercase text-center">
        ใส่ผลลัพธ์
      </h2>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => onResult('Player')}
          className="flex-1 max-w-[120px] py-4 rounded-lg bg-casino-blue/20 border-2 border-casino-blue text-casino-blue font-display font-bold text-lg hover:bg-casino-blue/30 active:scale-95 transition-all"
        >
          PLAYER
        </button>
        <button
          onClick={() => onResult('Tie')}
          className="flex-1 max-w-[80px] py-4 rounded-lg bg-casino-green/20 border-2 border-casino-green text-casino-green font-display font-bold text-lg hover:bg-casino-green/30 active:scale-95 transition-all"
        >
          TIE
        </button>
        <button
          onClick={() => onResult('Banker')}
          className="flex-1 max-w-[120px] py-4 rounded-lg bg-casino-red/20 border-2 border-casino-red text-casino-red font-display font-bold text-lg hover:bg-casino-red/30 active:scale-95 transition-all"
        >
          BANKER
        </button>
      </div>
      <div className="flex gap-2 justify-center">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 disabled:opacity-30 transition-all"
        >
          ↩ ย้อนกลับ
        </button>
        <button
          onClick={onReset}
          disabled={!canUndo}
          className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 disabled:opacity-30 transition-all"
        >
          🗑 รีเซ็ต
        </button>
      </div>
    </div>
  );
}
