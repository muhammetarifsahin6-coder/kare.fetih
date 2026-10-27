import React from 'react';
import { Trophy, RotateCcw, Home, Award } from 'lucide-react';
import { MatchState, PLAYER_PALETTES } from '../game/types';

interface VictoryModalProps {
  match: MatchState;
  onPlayAgain: () => void;
  onReturnHome: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  match,
  onPlayAgain,
  onReturnHome,
}) => {
  const rankedPlayers = [...match.players].sort((a, b) => b.tileCount - a.tileCount);
  const winner =
    match.winnerIds.length === 1
      ? match.players.find((p) => p.id === match.winnerIds[0])
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-stone-900 border-2 border-amber-500/60 shadow-2xl p-6 text-stone-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
            <Trophy className="w-7 h-7" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-amber-400 font-bold">
              {match.victoryMode === 'full_conquest'
                ? 'Tam Fetih Sonucu'
                : `Tur Sınırlı (${match.maxTurns} Tur) Sonucu`}
            </div>
            <h2 className="text-2xl font-bold text-white">
              {match.isDraw
                ? 'Maç Berabere Bitti!'
                : winner
                ? `${winner.name} Kazandı!`
                : 'Maç Tamamlandı'}
            </h2>
          </div>
        </div>

        <p className="text-xs text-stone-300 mb-4 bg-stone-950/90 border border-stone-800 rounded-lg px-3 py-2">
          Toplam {match.turnNumber} tur oynandı • {match.boardSize}×{match.boardSize} Harita • İstatistiklere kaydedildi.
        </p>

        <div className="space-y-2 mb-6">
          {rankedPlayers.map((player, idx) => {
            const isWinner = match.winnerIds.includes(player.id);
            const palette = PLAYER_PALETTES[player.colorKey] || PLAYER_PALETTES.blue;
            return (
              <div
                key={player.id}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border ${
                  isWinner
                    ? 'bg-amber-950/40 border-amber-500/60'
                    : 'bg-stone-950/60 border-stone-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center font-mono font-bold text-sm text-amber-400">
                    #{idx + 1}
                  </span>
                  <span
                    className="w-4 h-4 rounded-sm shrink-0 border border-white/30"
                    style={{ backgroundColor: palette.fillHex }}
                  />
                  <div>
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      <span>{player.name}</span>
                      {isWinner && <Award className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className="text-[11px] text-stone-400">
                      {!player.isAI ? 'İnsan Oyuncu' : `Yapay Zekâ (${player.aiDifficulty.toUpperCase()})`}
                      {player.eliminated ? ' • Elendi' : ''}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-base font-bold text-amber-300">{player.tileCount} Kare</div>
                  <div className="text-[11px] text-stone-400">
                    Fethedilen: {player.conqueredCount}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-sm transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Aynı Ayarlarla Tekrar</span>
          </button>
          <button
            type="button"
            onClick={onReturnHome}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-600 text-stone-100 font-semibold text-sm transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Ana Menüye Dön</span>
          </button>
        </div>
      </div>
    </div>
  );
};
