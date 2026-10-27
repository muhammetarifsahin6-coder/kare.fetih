import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { validateConquestSelection } from '../game/engine';
import {
  BoardThemePalette,
  MatchState,
  PlayerColorKey,
  resolveBoardTheme,
} from '../game/types';
import { GameBoard2D } from './GameBoard2D';
import { GameBoard3D } from './GameBoard3D';
import { soundManager } from '../game/audio';

interface MatchScreenProps {
  match: MatchState;
  renderMode: '2d' | '3d';
  themeMode: 'dark' | 'light' | 'system';
  isAIThinking: boolean;
  isAIRollingDice?: boolean;
  aiStatusText?: string | null;
  onToggleRenderMode: () => void;
  onToggleThemeMode: () => void;
  onRollDice: () => void;
  onUpdateSelection: (cells: number[]) => void;
  onConfirmConquest: () => void;
  onClearSelection: () => void;
  onEndTurn: () => void;
  onSaveAndExit: () => { success: boolean; error: string | null };
  onTerminateMatchWithoutSaving: () => void;
}

const DiceFaceSVG: React.FC<{
  value: number;
  rolling: boolean;
  seedOffset?: number;
  themePalette: BoardThemePalette;
}> = ({ value, rolling, seedOffset = 0, themePalette }) => {
  const [tumbleFace, setTumbleFace] = useState(value);

  useEffect(() => {
    if (!rolling) {
      setTumbleFace(value);
      return;
    }
    let step = seedOffset;
    const seq = [3, 6, 2, 5, 1, 4];
    const id = window.setInterval(() => {
      step = (step + 1) % seq.length;
      setTumbleFace(seq[step]);
    }, 65);
    return () => window.clearInterval(id);
  }, [rolling, value, seedOffset]);

  const pipCoords: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [
      [7, 7],
      [17, 17],
    ],
    3: [
      [6, 6],
      [12, 12],
      [18, 18],
    ],
    4: [
      [7, 7],
      [17, 7],
      [7, 17],
      [17, 17],
    ],
    5: [
      [6, 6],
      [18, 6],
      [12, 12],
      [6, 18],
      [18, 18],
    ],
    6: [
      [7, 6],
      [17, 6],
      [7, 12],
      [17, 12],
      [7, 18],
      [17, 18],
    ],
  };

  const displayFace = rolling ? tumbleFace : value;
  const dots = pipCoords[displayFace] || pipCoords[1];

  return (
    <motion.div
      animate={
        rolling
          ? {
              rotate: [0, -22, 24, -16, 18, 0],
              scale: [1, 1.18, 0.94, 1.14, 1],
              y: [0, -4, 2, -3, 0],
            }
          : { rotate: 0, scale: 1, y: 0 }
      }
      transition={{ duration: 0.36, ease: 'easeInOut' }}
      className="inline-flex"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-9 h-9 rounded-lg border-2 shadow-inner"
        style={{
          backgroundColor: themePalette.diceBg,
          borderColor: rolling ? themePalette.accentGold : themePalette.diceBorder,
        }}
        aria-label={`Zar ${value}`}
      >
        <rect x="1.5" y="1.5" width="21" height="21" rx="3.5" fill={themePalette.diceBg} />
        {dots.map(([cx, cy], idx) => (
          <circle key={idx} cx={cx} cy={cy} r="2.15" fill={themePalette.dicePip} />
        ))}
      </svg>
    </motion.div>
  );
};

export const MatchScreen: React.FC<MatchScreenProps> = ({
  match,
  renderMode,
  themeMode,
  isAIThinking,
  isAIRollingDice = false,
  aiStatusText = null,
  onToggleRenderMode,
  onToggleThemeMode,
  onRollDice,
  onUpdateSelection,
  onConfirmConquest,
  onClearSelection,
  onEndTurn,
  onSaveAndExit,
  onTerminateMatchWithoutSaving,
}) => {
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [confirmTerminateStep, setConfirmTerminateStep] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isRollingAnim, setIsRollingAnim] = useState(false);

  const themePalette = resolveBoardTheme(themeMode);
  const isLight = themePalette.mode === 'light';
  const boardCols = match.boardCols || match.boardSize;
  const boardRows = match.boardRows || match.boardSize;

  // Intercept Android Hardware Back button ('backbutton', 'karefetih-hardware-back', 'popstate') and Escape key to open Exit Confirmation Dialog (Section 14.1)
  useEffect(() => {
    const openExitDialog = () => {
      setExitModalOpen(true);
      setConfirmTerminateStep(false);
      setSaveError(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
        e.preventDefault();
        openExitDialog();
      }
    };

    const onHardwareBack = (e: Event) => {
      e.preventDefault();
      openExitDialog();
    };

    // Push a guard state so browser/WebView swipe-back triggers popstate instead of closing the app
    window.history.pushState({ kareFetihMatchGuard: true }, '');
    const onPopState = () => {
      openExitDialog();
      window.history.pushState({ kareFetihMatchGuard: true }, '');
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('backbutton', onHardwareBack);
    window.addEventListener('karefetih-hardware-back', onHardwareBack);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('backbutton', onHardwareBack);
      window.removeEventListener('karefetih-hardware-back', onHardwareBack);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const activePlayer =
    match.players.find((p) => p.id === match.activePlayerId) || match.players[0];
  const activePalette =
    themePalette.players[activePlayer.colorKey as PlayerColorKey] || themePalette.players.blue;
  const isHumanTurn = !activePlayer.isAI && !activePlayer.eliminated && match.status === 'playing';
  const diceRollingNow = isRollingAnim || isAIRollingDice;

  const currentValidation =
    match.selectedCells.length > 0
      ? validateConquestSelection(
          match.board,
          boardCols,
          activePlayer.slotIndex,
          match.selectedCells,
          match.remainingRights,
          boardRows,
          match.terrain
        )
      : { valid: false, reason: null, cost: 0 };

  const previewRemainingRights = Math.max(0, match.remainingRights - match.selectedCells.length);

  // Section 4 & 9.1: Dice animation updates ONLY the dice component and prevents double rolls
  const handleDiceButtonClick = () => {
    if (!isHumanTurn || match.dice !== null || isRollingAnim) return;
    setIsRollingAnim(true);
    onRollDice();
    window.setTimeout(() => {
      setIsRollingAnim(false);
    }, 340);
  };

  const handleSaveAndExitClick = () => {
    setSaveError(null);
    const result = onSaveAndExit();
    if (!result.success) {
      setSaveError(
        result.error || 'Kayıt başarısız oldu. Lütfen tekrar deneyin veya maça dönün.'
      );
    }
  };

  return (
    <main
      aria-label="KareFetih Maç Ekranı"
      data-board-theme={themePalette.mode}
      className="fixed inset-0 w-screen h-screen flex flex-col overflow-hidden select-none transition-colors pt-safe pl-safe pr-safe pb-safe"
      style={{
        backgroundColor: themePalette.appBg,
        color: themePalette.textPrimary,
      }}
    >
      {/* TOP / PRIMARY AREA: Game Board (Occupies top primary viewport area, maximizing usable screen ratio) */}
      <section
        aria-label="Oyun Tahtası Alanı"
        className="flex-1 w-full relative overflow-hidden"
        style={{ backgroundColor: themePalette.boardViewportBg }}
      >
        {renderMode === '3d' ? (
          <GameBoard3D
            match={match}
            isHumanTurn={isHumanTurn}
            isSelectionValid={currentValidation.valid}
            themePalette={themePalette}
            onUpdateSelection={onUpdateSelection}
          />
        ) : (
          <GameBoard2D
            match={match}
            isHumanTurn={isHumanTurn}
            isSelectionValid={currentValidation.valid}
            themePalette={themePalette}
            onUpdateSelection={onUpdateSelection}
          />
        )}
      </section>

      {/* BOTTOM PANEL: Ultra-Compact Turn Info, Dice, Status & Action Controls Dock */}
      <aside
        aria-label="Tur Bilgileri ve Hamle Kontrolleri Paneli"
        className="w-full shrink-0 border-t-2 flex flex-col p-1.5 space-y-1 transition-colors overflow-hidden"
        style={{
          backgroundColor: themePalette.panelBg,
          borderColor: themePalette.panelBorder,
          paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(0.4rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.4rem, env(safe-area-inset-right))',
        }}
      >
        {/* Row 1: Top Bar (Turn Counter, Active Player, Scores, Quick Toggles) */}
        <div className="flex flex-wrap items-center justify-between gap-1 pb-1 border-b text-[11px]" style={{ borderColor: themePalette.cardBorder }}>
          {/* Active Player & Turn Badge */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              data-testid="turn-counter-badge"
              className="text-[11px] font-extrabold font-mono tabular-nums px-1.5 py-0.5 rounded border"
              style={{
                color: themePalette.accentGold,
                backgroundColor: themePalette.cardBg,
                borderColor: themePalette.cardBorder,
              }}
            >
              {match.victoryMode === 'turn_limited'
                ? `Tur ${match.turnNumber}/${match.maxTurns}`
                : `Tur ${match.turnNumber}`}
              <span className="ml-1 opacity-70 text-[9px]" data-testid="board-dimensions-badge">
                ({boardCols}×{boardRows})
              </span>
            </span>

            {/* Active Player Banner */}
            <motion.div
              key={activePlayer.id}
              initial={{ opacity: 0.75, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              data-testid="active-player-banner"
              className="rounded-lg border px-1.5 py-0.5 flex items-center gap-1 transition-colors"
              style={{
                backgroundColor: themePalette.cardBg,
                borderColor: activePalette.fillHex,
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0 border border-white/50"
                style={{ backgroundColor: activePalette.fillHex }}
              />
              <span
                data-testid="active-player-name"
                className="text-[11px] font-bold truncate max-w-[90px]"
                style={{ color: themePalette.textPrimary }}
              >
                {activePlayer.name}
              </span>
              <span
                className="text-[9px] font-extrabold font-mono tabular-nums shrink-0 px-1 py-0.2 rounded"
                style={{
                  backgroundColor: isLight ? activePalette.lightHex : '#262B38',
                  color: activePalette.textHex,
                }}
              >
                {activePlayer.isAI ? `AI` : 'İNSAN'}
              </span>
            </motion.div>
          </div>

          {/* Player Standings Summary Pills */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5">
            {match.players.map((p) => {
              const pal =
                themePalette.players[p.colorKey as PlayerColorKey] || themePalette.players.blue;
              const isCurrent = p.id === match.activePlayerId;
              return (
                <span
                  key={p.id}
                  className={`rounded px-1 py-0.2 border flex items-center gap-1 text-[10px] font-mono font-bold transition-colors whitespace-nowrap ${
                    p.eliminated ? 'opacity-40 line-through' : ''
                  }`}
                  style={{
                    backgroundColor: isCurrent
                      ? isLight
                        ? '#FEF3C7'
                        : '#252A36'
                      : themePalette.cardBg,
                    borderColor: isCurrent ? themePalette.boardFrameOuter : themePalette.cardBorder,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: pal.fillHex }}
                  />
                  <span className="truncate max-w-[50px]" style={{ color: themePalette.textPrimary }}>
                    {p.name}
                  </span>
                  <span style={{ color: themePalette.accentGold }}>
                    {p.eliminated ? 'x' : p.tileCount}
                  </span>
                </span>
              );
            })}
          </div>

          {/* Quick Controls: Theme, 2D/3D, Exit */}
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <button
              type="button"
              data-testid="toggle-theme-mode-btn"
              onClick={onToggleThemeMode}
              aria-label={isLight ? 'Karanlık Moda Geç' : 'Aydınlık Moda Geç'}
              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isLight
                  ? 'bg-[#EAE2CE] hover:bg-[#DDD3BC] text-[#1C1917] border-[#B89758]'
                  : 'bg-[#232733] hover:bg-[#2E3342] text-[#FBBF24] border-[#3E3729]'
              }`}
            >
              {isLight ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
              <span>{isLight ? 'Koyu' : 'Açık'}</span>
            </button>
            <button
              type="button"
              data-testid="toggle-render-mode-btn"
              onClick={onToggleRenderMode}
              aria-label={renderMode === '2d' ? '3D Görünüme Geç' : '2D Görünüme Geç'}
              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isLight
                  ? 'bg-[#EAE2CE] hover:bg-[#DDD3BC] text-[#1C1917] border-[#B89758]'
                  : 'bg-[#232733] hover:bg-[#2E3342] text-[#D4CFC7] border-[#3E3729]'
              }`}
            >
              {renderMode === '2d' ? '3D' : '2D'}
            </button>
            <button
              type="button"
              data-testid="exit-match-btn"
              onClick={() => {
                setExitModalOpen(true);
                setConfirmTerminateStep(false);
                setSaveError(null);
              }}
              aria-label="Oyundan Çıkış Menüsü"
              className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isLight
                  ? 'bg-[#FEE2E2] hover:bg-[#FECACA] text-[#991B1B] border-[#F87171]'
                  : 'bg-[#2B1F22] hover:bg-[#3D262B] text-[#FCA5A5] border-[#5C2B33]'
              }`}
            >
              Çıkış
            </button>
          </div>
        </div>

        {/* Row 2: Dice & Rights Info + Dynamic Status / Validation Box */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 items-stretch">
          {/* Dice & Rights Box */}
          <div
            className="rounded-lg border px-1.5 py-0.5 flex items-center justify-between gap-1.5 transition-colors"
            style={{
              backgroundColor: themePalette.cardBg,
              borderColor: themePalette.cardBorder,
            }}
          >
            <div className="flex items-center gap-1 shrink-0">
              <DiceFaceSVG
                value={match.dice?.die1 ?? 1}
                rolling={diceRollingNow}
                seedOffset={0}
                themePalette={themePalette}
              />
              <span
                className="text-xs font-extrabold"
                style={{ color: themePalette.accentGold }}
              >
                ×
              </span>
              <DiceFaceSVG
                value={match.dice?.die2 ?? 1}
                rolling={diceRollingNow}
                seedOffset={3}
                themePalette={themePalette}
              />
            </div>

            <div className="flex items-center gap-2 text-right">
              <div>
                <div className="text-[9px]" style={{ color: themePalette.textMuted }}>
                  Zar
                </div>
                <div
                  data-testid="dice-result-readout"
                  className="text-xs font-extrabold font-mono tabular-nums"
                  style={{ color: themePalette.accentGold }}
                >
                  {diceRollingNow
                    ? 'Atılıyor...'
                    : match.dice
                    ? `${match.dice.die1}×${match.dice.die2}=${match.dice.totalRights}`
                    : '-'}
                </div>
              </div>

              <div>
                <div className="text-[9px]" style={{ color: themePalette.textMuted }}>
                  Hak (Top/Seç/Kal)
                </div>
                <div className="text-xs font-bold font-mono tabular-nums space-x-0.5">
                  <span data-testid="total-rights-readout" style={{ color: themePalette.textPrimary }}>
                    {match.dice ? match.dice.totalRights : 0}
                  </span>
                  <span>/</span>
                  <span data-testid="selected-cells-count" style={{ color: isLight ? '#1D4ED8' : '#60A5FA' }}>
                    {match.selectedCells.length}
                  </span>
                  <span>/</span>
                  <span data-testid="remaining-rights-readout" style={{ color: isLight ? '#15803D' : '#4ADE80' }}>
                    {match.selectedCells.length > 0 ? previewRemainingRights : match.remainingRights}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Status / Validation Box */}
          <AnimatePresence mode="wait">
            <motion.div
              key={
                aiStatusText ||
                match.validationError ||
                (currentValidation.valid ? 'valid' : match.lastActionMessage || 'default')
              }
              initial={{ opacity: 0.75, y: 1 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0.75 }}
              transition={{ duration: 0.14 }}
              data-testid="right-panel-status-box"
              className={`rounded-lg border px-2 py-0.5 text-[10px] sm:text-[11px] leading-tight transition-colors flex items-center min-h-[36px] ${
                match.validationError
                  ? isLight
                    ? 'bg-[#FEF2F2] border-[#DC2626] text-[#991B1B]'
                    : 'bg-[#2D161B] border-[#DC2626] text-[#FECACA]'
                  : isAIThinking || activePlayer.isAI
                  ? isLight
                    ? 'bg-[#EFF6FF] border-[#2563EB] text-[#1E3A8A]'
                    : 'bg-[#1D2432] border-[#3B82F6] text-[#BFDBFE]'
                  : currentValidation.valid
                  ? isLight
                    ? 'bg-[#F0FDF4] border-[#16A34A] text-[#14532D]'
                    : 'bg-[#14291E] border-[#16A34A] text-[#BBF7D0]'
                  : isLight
                  ? 'bg-[#FAF6EC] border-[#D5CBB4] text-[#44403C]'
                  : 'bg-[#1B1F28] border-[#2E3342] text-[#D4CFC7]'
              }`}
            >
              {isAIThinking || activePlayer.isAI ? (
                <div className="font-semibold truncate">
                  {aiStatusText ||
                    `${activePlayer.name} hamlesini hazırlıyor... Lütfen bekleyin.`}
                </div>
              ) : match.validationError ? (
                <div data-testid="validation-error-message" className="font-semibold truncate">
                  {match.validationError}
                </div>
              ) : currentValidation.valid ? (
                <div className="font-semibold truncate">
                  Seçilen {match.selectedCells.length} kare geçerli. &ldquo;Fethet&rdquo; butonuna bas.
                </div>
              ) : (
                <div className="truncate">
                  {match.lastActionMessage ||
                    (match.dice
                      ? match.remainingRights <= 3
                        ? `1–${match.remainingRights} bitişik kare seç.`
                        : 'Toprağına komşu alan seç.'
                      : 'Zar At butonuna bas.')}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Row 3: Action Buttons Dock (Zar At, Fethet, Seçimi Temizle, Turu Bitir) - Always 4-col grid */}
        <div className="grid grid-cols-4 gap-1 pt-0.5">
          <button
            type="button"
            data-testid="roll-dice-btn"
            onClick={handleDiceButtonClick}
            disabled={!isHumanTurn || match.dice !== null || isRollingAnim}
            className="w-full min-h-[38px] py-1 px-1 rounded-lg font-extrabold text-[11px] tracking-tight bg-[#C89B3C] hover:bg-[#D9AD4B] active:scale-[0.97] active:brightness-110 disabled:opacity-45 text-[#111318] transition-all whitespace-nowrap cursor-pointer shadow-xs flex items-center justify-center gap-1"
          >
            {match.dice ? `Zar Atıldı` : 'Zar At'}
          </button>

          <button
            type="button"
            data-testid="confirm-conquest-btn"
            onClick={() => {
              soundManager.vibrate(25);
              onConfirmConquest();
            }}
            disabled={!isHumanTurn || !match.dice || !currentValidation.valid}
            className="w-full min-h-[38px] py-1 px-1 rounded-lg font-extrabold text-[11px] bg-[#16A34A] hover:bg-[#22C55E] active:scale-[0.97] active:brightness-110 disabled:opacity-40 text-white transition-all whitespace-nowrap cursor-pointer shadow-xs flex items-center justify-center"
          >
            Fethet
          </button>

          <button
            type="button"
            data-testid="clear-selection-btn"
            onClick={() => {
              soundManager.vibrate(15);
              onClearSelection();
            }}
            disabled={!isHumanTurn || match.selectedCells.length === 0}
            className={`w-full min-h-[38px] py-1 px-1 rounded-lg font-bold text-[11px] border transition-all whitespace-nowrap cursor-pointer disabled:opacity-40 active:scale-[0.97] flex items-center justify-center ${
              isLight
                ? 'bg-[#EAE2CE] hover:bg-[#DDD3BC] text-[#1C1917] border-[#B89758]'
                : 'bg-[#262B38] hover:bg-[#323846] text-[#E5E0D8] border-[#3E4556]'
            }`}
          >
            Seçimi Temizle
          </button>

          <button
            type="button"
            data-testid="end-turn-btn"
            onClick={() => {
              soundManager.vibrate(18);
              onEndTurn();
            }}
            disabled={!isHumanTurn}
            className="w-full min-h-[38px] py-1 px-1 rounded-lg font-extrabold text-[11px] bg-[#2563EB] hover:bg-[#3B82F6] active:scale-[0.97] active:brightness-110 disabled:opacity-40 text-white transition-all whitespace-nowrap cursor-pointer shadow-xs flex items-center justify-center"
          >
            Turu Bitir
          </button>
        </div>
      </aside>

      {/* EXIT CONFIRMATION DIALOG (Section 14.1) */}
      {exitModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-dialog-title"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 p-5 shadow-2xl space-y-4"
            style={{
              backgroundColor: themePalette.panelBg,
              borderColor: themePalette.boardFrameOuter,
              color: themePalette.textPrimary,
            }}
          >
            <h2 id="exit-dialog-title" className="text-lg font-bold">
              {confirmTerminateStep ? 'Oyunu Kaydetmeden Sonlandır?' : 'Maç Çıkış Seçenekleri'}
            </h2>

            {saveError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-[#2D161B] border border-[#DC2626] text-xs text-[#FECACA]"
              >
                {saveError}
              </div>
            )}

            {!confirmTerminateStep ? (
              <>
                <p className="text-xs" style={{ color: themePalette.textSecondary }}>
                  Mevcut maçınıza devam edebilir, ilerlemenizi kaydedip ana menüye dönebilir veya
                  maçı sonlandırabilirsiniz.
                </p>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExitModalOpen(false);
                      setSaveError(null);
                    }}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm bg-[#C89B3C] hover:bg-[#D9AD4B] text-[#111318] transition-colors cursor-pointer"
                  >
                    Oyuna Devam Et
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAndExitClick}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm bg-[#2563EB] hover:bg-[#3B82F6] text-white transition-colors cursor-pointer"
                  >
                    Kaydet ve Çık
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmTerminateStep(true)}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm bg-[#991B1B] hover:bg-[#B91C1C] text-white transition-colors cursor-pointer"
                  >
                    Oyunu Sonlandır
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setExitModalOpen(false);
                      setSaveError(null);
                    }}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-semibold text-sm border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: themePalette.cardBg,
                      borderColor: themePalette.cardBorder,
                      color: themePalette.textPrimary,
                    }}
                  >
                    Vazgeç
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-[#FECACA] bg-[#2D161B] border border-[#DC2626] rounded-lg p-3">
                  Dikkat: Mevcut maç kaydedilmeden sonlandırılacak ve devam kaydı silinecektir.
                  Tamamlanmış maç istatistikleriniz ve oyuncu profilleriniz korunur. Onaylıyor
                  musunuz?
                </p>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setExitModalOpen(false);
                      setConfirmTerminateStep(false);
                      onTerminateMatchWithoutSaving();
                    }}
                    className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-sm bg-[#DC2626] hover:bg-[#EF4444] text-white transition-colors cursor-pointer"
                  >
                    Evet, Sonlandır
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmTerminateStep(false)}
                    className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl font-semibold text-sm border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: themePalette.cardBg,
                      borderColor: themePalette.cardBorder,
                      color: themePalette.textPrimary,
                    }}
                  >
                    Vazgeç
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
