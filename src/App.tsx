import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  Users,
  Bot,
  Settings,
  BarChart3,
  Shield,
  Dna,
  AlertTriangle,
  Grid,
  Trophy,
  Shuffle,
  Compass,
} from 'lucide-react';
import {
  AIDifficulty,
  AppSettings,
  GameMode,
  MapMode,
  MatchSetupConfig,
  MatchState,
  MatchSummary,
  PlayerColorKey,
  PlayerProfile,
  PlayerSetupConfig,
  PLAYER_PALETTES,
  VictoryMode,
} from './game/types';
import {
  applyConquestMove,
  createNewMatch,
  endCurrentTurn,
  getAIThinkingDelayMs,
  planAITurnSteps,
  rollDiceForActivePlayer,
  updateSelectionPreview,
} from './game/engine';
import {
  clearActiveMatchSave,
  hasActiveMatchSave,
  loadActiveMatch,
  loadMatchHistory,
  loadProfiles,
  loadSettings,
  recordCompletedMatchOnce,
  saveActiveMatch,
  saveSettings,
  updateProfileIdentity,
} from './game/storage';
import { soundManager } from './game/audio';
import { MatchScreen } from './components/MatchScreen';
import { VictoryModal } from './components/VictoryModal';
import { ProfilesStatsModal } from './components/ProfilesStatsModal';
import { SettingsModal } from './components/SettingsModal';
import { BioStrategyModal } from './components/BioStrategyModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import {
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
  syncProfileToCloud,
  syncSavedMatchToCloud,
} from './services/firebase';

const COLOR_KEYS: PlayerColorKey[] = ['blue', 'red', 'green', 'gold'];

const BOARD_DIMENSION_PRESETS: { key: string; label: string; cols: number; rows: number; badge?: string }[] = [
  { key: '20x20', label: '20×20', cols: 20, rows: 20 },
  { key: '28x18', label: '28×18', cols: 28, rows: 18, badge: 'Geniş' },
  { key: '30x30', label: '30×30', cols: 30, rows: 30 },
  { key: '36x22', label: '36×22', cols: 36, rows: 22, badge: 'Geniş' },
  { key: '40x40', label: '40×40', cols: 40, rows: 40 },
  { key: '50x50', label: '50×50', cols: 50, rows: 50 },
];

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [profiles, setProfiles] = useState<PlayerProfile[]>(() => loadProfiles());
  const [history, setHistory] = useState<MatchSummary[]>(() => loadMatchHistory());
  const [hasSavedMatch, setHasSavedMatch] = useState<boolean>(() => hasActiveMatchSave());

  // Screen state: 'menu' | 'match'
  const [screen, setScreen] = useState<'menu' | 'match'>('menu');
  const [activeMatch, setActiveMatch] = useState<MatchState | null>(null);
  const [isRestoringMatch, setIsRestoringMatch] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // Modals on Main Menu
  const [showProfilesModal, setShowProfilesModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBioModal, setShowBioModal] = useState(false);

  // Setup Form State
  const [gameMode, setGameMode] = useState<GameMode>('vs_ai');
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('orta');
  const [mapMode, setMapMode] = useState<MapMode>('random');
  const [boardPresetKey, setBoardPresetKey] = useState<string>('28x18');
  const [customBoardCols, setCustomBoardCols] = useState<number>(26);
  const [customBoardRows, setCustomBoardRows] = useState<number>(18);
  const [useCustomBoard, setUseCustomBoard] = useState<boolean>(false);
  const [victoryMode, setVictoryMode] = useState<VictoryMode>('full_conquest');
  const [roundPreset, setRoundPreset] = useState<number>(15);
  const [customRounds, setCustomRounds] = useState<number>(18);
  const [useCustomRounds, setUseCustomRounds] = useState<boolean>(false);
  const [randomizeTurnOrder, setRandomizeTurnOrder] = useState<boolean>(false);

  // Custom player names and colors per slot (linked to persistent profile IDs prof-human-1..4)
  const [slotNames, setSlotNames] = useState<Record<string, string>>(() => {
    const loaded = loadProfiles();
    const map: Record<string, string> = {};
    loaded.forEach((p) => {
      map[p.profileId] = p.name;
    });
    return map;
  });

  const [slotColors, setSlotColors] = useState<Record<string, PlayerColorKey>>(() => {
    const loaded = loadProfiles();
    const map: Record<string, PlayerColorKey> = {};
    loaded.forEach((p, idx) => {
      map[p.profileId] = p.colorKey || COLOR_KEYS[idx % COLOR_KEYS.length];
    });
    return map;
  });

  // Cloud backup status
  const [cloudUserName, setCloudUserName] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>(
    'Tüm maçlar ve istatistikler cihazda çevrimdışı saklanır.'
  );

  // Sync audio & theme settings
  useEffect(() => {
    saveSettings(settings);
    soundManager.syncMusicState();
  }, [settings]);

  // Keep body[data-state] updated for automated verification & accessibility
  useEffect(() => {
    if (screen === 'menu') {
      document.body.dataset.state = 'title';
    } else if (activeMatch?.status === 'completed') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screen, activeMatch?.status]);

  // Listen to optional Firebase auth state
  useEffect(() => {
    const unsub = subscribeToAuth((user) => {
      if (user) {
        setCloudUserName(user.displayName || user.email || 'Bulut Kullanıcısı');
        setCloudSyncStatus('Bulut yedekleme bağlı.');
      } else {
        setCloudUserName(null);
        setCloudSyncStatus('Tüm maçlar ve istatistikler cihazda çevrimdışı saklanır.');
      }
    });
    return () => unsub();
  }, []);

  // Screen orientation helper (Section 9.2): Supports both Native Android Bridge (window.KareFetihNative) and Web Screen Orientation API
  const applyOrientationForScreen = useCallback(async (target: 'menu' | 'match') => {
    try {
      const nativeBridge = (window as unknown as {
        KareFetihNative?: { setOrientation?: (mode: string) => void };
      }).KareFetihNative;
      if (nativeBridge && typeof nativeBridge.setOrientation === 'function') {
        nativeBridge.setOrientation(target === 'match' ? 'landscape' : 'portrait');
      }
    } catch {
      // Ignore native bridge errors
    }
    try {
      const orientationApi = (
        window.screen as unknown as {
          orientation?: { lock?: (mode: string) => Promise<void>; unlock?: () => void };
        }
      )?.orientation;
      if (!orientationApi) return;
      if (target === 'match' && typeof orientationApi.lock === 'function') {
        await orientationApi.lock('landscape').catch(() => {});
      } else if (target === 'menu' && typeof orientationApi.unlock === 'function') {
        orientationApi.unlock();
      }
    } catch {
      // Orientation lock is optional on desktop/browsers without fullscreen lock permission
    }
  }, []);

  const buildMatchConfigFromSetup = useCallback((): MatchSetupConfig => {
    const presetObj =
      BOARD_DIMENSION_PRESETS.find((p) => p.key === boardPresetKey) || BOARD_DIMENSION_PRESETS[0];
    const finalCols = useCustomBoard
      ? Math.max(15, Math.min(60, Number(customBoardCols) || 24))
      : presetObj.cols;
    const finalRows = useCustomBoard
      ? Math.max(15, Math.min(60, Number(customBoardRows) || 18))
      : presetObj.rows;

    // Enforce minimum 15 turns (15, 20, 25, 30, or Custom >= 15)
    const finalMaxTurns =
      victoryMode === 'turn_limited'
        ? useCustomRounds
          ? Math.max(15, Math.min(100, Number(customRounds) || 15))
          : Math.max(15, roundPreset)
        : 15;

    const players: PlayerSetupConfig[] = [];
    const usedColorKeys = new Set<PlayerColorKey>();

    for (let i = 0; i < playerCount; i++) {
      const profileId = `prof-human-${i + 1}`;
      const isHuman = gameMode === 'local_multiplayer' ? true : i === 0;
      let preferredColorKey = slotColors[profileId] || COLOR_KEYS[i];
      if (usedColorKeys.has(preferredColorKey)) {
        const fallback = COLOR_KEYS.find((k) => !usedColorKeys.has(k)) || COLOR_KEYS[i];
        preferredColorKey = fallback;
      }
      usedColorKeys.add(preferredColorKey);

      const defaultName = isHuman
        ? slotNames[profileId]?.trim() || `Komutan ${i + 1}`
        : `YZ Komutan ${i}`;

      players.push({
        id: `p${i + 1}`,
        profileId: isHuman ? profileId : `ai-bot-${i}`,
        name: defaultName,
        colorKey: preferredColorKey,
        isAI: !isHuman,
        aiDifficulty,
      });
    }

    return {
      gameMode,
      victoryMode,
      maxTurns: finalMaxTurns,
      boardSize: Math.max(finalCols, finalRows),
      boardCols: finalCols,
      boardRows: finalRows,
      mapMode,
      players,
      randomizeTurnOrder,
    };
  }, [
    useCustomBoard,
    customBoardCols,
    customBoardRows,
    boardPresetKey,
    mapMode,
    victoryMode,
    useCustomRounds,
    customRounds,
    roundPreset,
    playerCount,
    gameMode,
    slotColors,
    slotNames,
    aiDifficulty,
    randomizeTurnOrder,
  ]);

  const startFreshMatch = useCallback(
    (configOverride?: MatchSetupConfig) => {
      const cfg = configOverride || buildMatchConfigFromSetup();
      clearActiveMatchSave();
      const freshMatch = createNewMatch(cfg);
      saveActiveMatch(freshMatch);
      setHasSavedMatch(true);
      setActiveMatch(freshMatch);
      setShowOverwriteConfirm(false);
      setScreen('match');
      applyOrientationForScreen('match');
      soundManager.startMusic();
    },
    [buildMatchConfigFromSetup, applyOrientationForScreen]
  );

  // Support ?autostart=1 for automated browser verification
  const autostartHandledRef = useRef(false);
  useEffect(() => {
    if (autostartHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      autostartHandledRef.current = true;
      startFreshMatch();
    }
  }, [startFreshMatch]);

  // Handle "Yeni Maç Başlat" click — check if an active saved match exists first (Section 14.5)
  const handleStartNewMatchClick = () => {
    if (hasActiveMatchSave()) {
      setShowOverwriteConfirm(true);
      return;
    }
    startFreshMatch();
  };

  // Handle "Devam Et" click — restore saved match without regenerating starting areas or turn order (Section 14.3)
  const handleResumeSavedMatch = () => {
    setIsRestoringMatch(true);
    const loaded = loadActiveMatch();
    if (!loaded || loaded.status !== 'playing') {
      setHasSavedMatch(false);
      setIsRestoringMatch(false);
      return;
    }
    setActiveMatch(loaded);
    setIsRestoringMatch(false);
    setScreen('match');
    applyOrientationForScreen('match');
    soundManager.startMusic();
  };

  // Auto-save active match & record stats strictly once when completed (Sections 14.4 & 14.5)
  useEffect(() => {
    if (!activeMatch) return;
    if (activeMatch.status === 'completed') {
      if (!activeMatch.statsRecorded) {
        const res = recordCompletedMatchOnce(activeMatch);
        setActiveMatch((prev) => (prev ? { ...prev, statsRecorded: true } : prev));
        setProfiles(res.profiles);
        setHistory(res.history);
        setHasSavedMatch(false);
        soundManager.playVictory();
      } else {
        clearActiveMatchSave();
        setHasSavedMatch(false);
      }
    } else {
      saveActiveMatch(activeMatch);
      setHasSavedMatch(true);
    }
  }, [activeMatch]);

  // Save on visibilitychange / pagehide so unexpected app backgrounding never loses state (Section 14.4)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && activeMatch && activeMatch.status === 'playing') {
        saveActiveMatch(activeMatch);
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
    };
  }, [activeMatch]);

  // CRITICAL AI TURN MANAGEMENT WITH DICE ROLL & PLAY ANIMATION (Section 8 & 8.1):
  // - Runs ONLY when screen === 'match', status === 'playing', and activePlayer is AI.
  // - Keyed by matchId + turnNumber + activeTurnIndex + activePlayerId so the same AI turn NEVER runs twice.
  // - Animates: (1) AI Dice Roll -> (2) Target Preview Highlight -> (3) Conquest Application -> (4) End Turn.
  const runningAiStepKeyRef = useRef<string | null>(null);
  const aiTimersRef = useRef<number[]>([]);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [isAIRollingDice, setIsAIRollingDice] = useState(false);
  const [aiStatusText, setAiStatusText] = useState<string | null>(null);

  const clearAllAiTimers = useCallback(() => {
    for (const id of aiTimersRef.current) {
      window.clearTimeout(id);
    }
    aiTimersRef.current = [];
  }, []);

  useEffect(() => {
    if (
      screen !== 'match' ||
      !activeMatch ||
      activeMatch.status !== 'playing' ||
      isRestoringMatch
    ) {
      clearAllAiTimers();
      setIsAIThinking(false);
      setIsAIRollingDice(false);
      setAiStatusText(null);
      return;
    }

    const currentPlayer = activeMatch.players.find((p) => p.id === activeMatch.activePlayerId);
    if (!currentPlayer || !currentPlayer.isAI || currentPlayer.eliminated) {
      clearAllAiTimers();
      setIsAIThinking(false);
      setIsAIRollingDice(false);
      setAiStatusText(null);
      return;
    }

    const stepKey = `${activeMatch.matchId}:${activeMatch.turnNumber}:${activeMatch.activeTurnIndex}:${activeMatch.activePlayerId}`;
    if (runningAiStepKeyRef.current === stepKey) {
      return;
    }

    runningAiStepKeyRef.current = stepKey;
    clearAllAiTimers();
    setIsAIThinking(true);

    // Pre-compute the AI turn steps from the current state snapshot
    const plan = planAITurnSteps(activeMatch);
    const baseDelayMs = getAIThinkingDelayMs(currentPlayer.aiDifficulty);
    const diceRollAnimMs = 420;
    let elapsed = 0;

    // Phase 1: AI Dice Rolling animation if dice hasn't been rolled yet
    if (!activeMatch.dice) {
      setIsAIRollingDice(true);
      setAiStatusText(`${currentPlayer.name} zar atıyor...`);
      soundManager.playDiceRoll();

      const tRoll = window.setTimeout(() => {
        setIsAIRollingDice(false);
        setAiStatusText(
          `${currentPlayer.name} ${plan.rolledState.dice?.die1}×${plan.rolledState.dice?.die2}=${plan.rolledState.dice?.totalRights} hak kazandı, hedef seçiyor...`
        );
        setActiveMatch((prev) => {
          if (!prev || prev.status !== 'playing') return prev;
          const keyNow = `${prev.matchId}:${prev.turnNumber}:${prev.activeTurnIndex}:${prev.activePlayerId}`;
          if (keyNow !== stepKey) return prev;
          return plan.rolledState;
        });
      }, diceRollAnimMs);
      aiTimersRef.current.push(tRoll);
      elapsed += diceRollAnimMs;
    } else {
      setAiStatusText(`${currentPlayer.name} hamle planlıyor...`);
    }

    // Phase 2: Step-by-step AI target preview & conquest animations
    const stepThinkMs = Math.max(240, Math.round(baseDelayMs * 0.42));
    const stepConquerPauseMs = 340;

    if (plan.moveSteps.length === 0) {
      elapsed += Math.max(300, Math.round(baseDelayMs * 0.5));
    } else {
      plan.moveSteps.forEach((step, idx) => {
        // 2a. Highlight AI selected target cells on the board
        elapsed += stepThinkMs;
        const previewAt = elapsed;
        const tPreview = window.setTimeout(() => {
          setAiStatusText(
            `${currentPlayer.name} ${idx + 1}. hamle hedefini seçti (${step.previewCells.length} kare)...`
          );
          setActiveMatch((prev) => {
            if (!prev || prev.status !== 'playing') return prev;
            const keyNow = `${prev.matchId}:${prev.turnNumber}:${prev.activeTurnIndex}:${prev.activePlayerId}`;
            if (keyNow !== stepKey) return prev;
            return {
              ...prev,
              selectedCells: step.previewCells,
              validationError: null,
            };
          });
        }, previewAt);
        aiTimersRef.current.push(tPreview);

        // 2b. Apply the conquest move (triggers Framer Motion tile color transition)
        elapsed += stepConquerPauseMs;
        const applyAt = elapsed;
        const tApply = window.setTimeout(() => {
          soundManager.playConquest(step.previewCells.length);
          setAiStatusText(
            `${currentPlayer.name} +${step.previewCells.length} kare fethetti!`
          );
          setActiveMatch((prev) => {
            if (!prev || prev.status !== 'playing') return prev;
            const keyNow = `${prev.matchId}:${prev.turnNumber}:${prev.activeTurnIndex}:${prev.activePlayerId}`;
            if (keyNow !== stepKey) return prev;
            return step.afterMoveState;
          });
        }, applyAt);
        aiTimersRef.current.push(tApply);
      });
    }

    // Phase 3: End AI turn cleanly and pass turn to next active player
    elapsed += 320;
    const finishAt = elapsed;
    const tFinish = window.setTimeout(() => {
      setIsAIThinking(false);
      setIsAIRollingDice(false);
      setAiStatusText(null);
      setActiveMatch((prev) => {
        if (!prev || prev.status !== 'playing') return prev;
        const keyNow = `${prev.matchId}:${prev.turnNumber}:${prev.activeTurnIndex}:${prev.activePlayerId}`;
        if (keyNow !== stepKey) return prev;
        if (plan.finalState.status === 'completed') {
          return plan.finalState;
        }
        soundManager.playTurnChange();
        return endCurrentTurn(plan.finalState);
      });
    }, finishAt);
    aiTimersRef.current.push(tFinish);

    return () => {
      clearAllAiTimers();
    };
  }, [
    screen,
    activeMatch?.matchId,
    activeMatch?.turnNumber,
    activeMatch?.activeTurnIndex,
    activeMatch?.activePlayerId,
    activeMatch?.status,
    isRestoringMatch,
    clearAllAiTimers,
  ]);

  // Human Match Controls
  const handleRollDice = () => {
    if (!activeMatch || activeMatch.status !== 'playing') return;
    const current = activeMatch.players.find((p) => p.id === activeMatch.activePlayerId);
    if (!current || current.isAI || activeMatch.dice !== null) return;

    soundManager.playDiceRoll();
    setActiveMatch((prev) => (prev ? rollDiceForActivePlayer(prev) : prev));
  };

  const handleUpdateSelection = (cells: number[]) => {
    if (!activeMatch || activeMatch.status !== 'playing') return;
    const current = activeMatch.players.find((p) => p.id === activeMatch.activePlayerId);
    if (!current || current.isAI || !activeMatch.dice) return;

    setActiveMatch((prev) => (prev ? updateSelectionPreview(prev, cells) : prev));
  };

  const handleClearSelection = () => {
    setActiveMatch((prev) =>
      prev
        ? {
            ...prev,
            selectedCells: [],
            validationError: null,
          }
        : prev
    );
  };

  const handleConfirmConquest = () => {
    if (!activeMatch || activeMatch.status !== 'playing') return;
    const current = activeMatch.players.find((p) => p.id === activeMatch.activePlayerId);
    if (!current || current.isAI) return;

    const result = applyConquestMove(activeMatch, activeMatch.selectedCells);
    if (!result.success) {
      soundManager.playInvalidMove();
      setActiveMatch(result.state);
      return;
    }

    soundManager.playConquest(activeMatch.selectedCells.length);
    setActiveMatch(result.state);
  };

  const handleEndTurn = () => {
    if (!activeMatch || activeMatch.status !== 'playing') return;
    const current = activeMatch.players.find((p) => p.id === activeMatch.activePlayerId);
    if (!current || current.isAI) return;

    soundManager.playTurnChange();
    setActiveMatch((prev) => (prev ? endCurrentTurn(prev) : prev));
  };

  // Exit menu actions (Section 14.1)
  const handleSaveAndExit = (): { success: boolean; error: string | null } => {
    if (!activeMatch) return { success: true, error: null };
    clearAllAiTimers();
    runningAiStepKeyRef.current = null;
    const result = saveActiveMatch(activeMatch);
    if (result.success) {
      setHasSavedMatch(true);
      setScreen('menu');
      applyOrientationForScreen('menu');
      soundManager.stopMusic();
    }
    return result;
  };

  const handleTerminateMatchWithoutSaving = () => {
    clearAllAiTimers();
    runningAiStepKeyRef.current = null;
    clearActiveMatchSave();
    setHasSavedMatch(false);
    setActiveMatch(null);
    setScreen('menu');
    applyOrientationForScreen('menu');
    soundManager.stopMusic();
  };

  // Profile update handler (Section 15)
  const handleUpdateProfile = (profileId: string, newName: string, colorKey: PlayerColorKey) => {
    const updated = updateProfileIdentity(profileId, newName, colorKey);
    setProfiles(updated);
    setSlotNames((prev) => ({ ...prev, [profileId]: newName }));
    setSlotColors((prev) => ({ ...prev, [profileId]: colorKey }));
  };

  // Optional Cloud Sync handlers
  const handleCloudSignIn = async () => {
    try {
      setCloudSyncStatus('Bulut hesabı bağlanıyor...');
      await signInWithGoogle();
    } catch {
      setCloudSyncStatus('Bulut girişi iptal edildi; çevrimdışı yerel mod aktif.');
    }
  };

  const handleCloudSignOut = async () => {
    await signOutUser();
  };

  const handleCloudSyncNow = async () => {
    try {
      setCloudSyncStatus('Buluta yedekleniyor...');
      for (const p of profiles) {
        await syncProfileToCloud(p);
      }
      if (activeMatch) {
        await syncSavedMatchToCloud(activeMatch);
      }
      setCloudSyncStatus('Tüm profiller ve kayıtlı maç buluta yedeklendi.');
    } catch {
      setCloudSyncStatus('Bulut yedekleme sırasında bağlantı hatası oluştu; yerel veriler güvende.');
    }
  };

  const isLightTheme = settings.themeMode === 'light';

  if (screen === 'match' && activeMatch) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-stone-950 select-none">
        <MatchScreen
          match={activeMatch}
          renderMode={settings.renderMode}
          themeMode={settings.themeMode}
          isAIThinking={isAIThinking}
          isAIRollingDice={isAIRollingDice}
          aiStatusText={aiStatusText}
          onToggleRenderMode={() =>
            setSettings((prev) => ({
              ...prev,
              renderMode: prev.renderMode === '2d' ? '3d' : '2d',
            }))
          }
          onToggleThemeMode={() =>
            setSettings((prev) => ({
              ...prev,
              themeMode: prev.themeMode === 'light' ? 'dark' : 'light',
            }))
          }
          onRollDice={handleRollDice}
          onUpdateSelection={handleUpdateSelection}
          onConfirmConquest={handleConfirmConquest}
          onClearSelection={handleClearSelection}
          onEndTurn={handleEndTurn}
          onSaveAndExit={handleSaveAndExit}
          onTerminateMatchWithoutSaving={handleTerminateMatchWithoutSaving}
        />

        {activeMatch.status === 'completed' && (
          <VictoryModal
            match={activeMatch}
            onPlayAgain={() => {
              const replayConfig: MatchSetupConfig = {
                boardSize: activeMatch.boardSize,
                boardCols: activeMatch.boardCols,
                boardRows: activeMatch.boardRows,
                mapMode: activeMatch.mapMode,
                gameMode: activeMatch.gameMode,
                victoryMode: activeMatch.victoryMode,
                maxTurns: activeMatch.maxTurns,
                randomizeTurnOrder: false,
                players: activeMatch.players.map((p) => ({
                  id: p.id,
                  profileId: p.profileId,
                  name: p.name,
                  colorKey: p.colorKey,
                  isAI: p.isAI,
                  aiDifficulty: p.aiDifficulty,
                })),
              };
              startFreshMatch(replayConfig);
            }}
            onReturnHome={() => {
              clearActiveMatchSave();
              setHasSavedMatch(false);
              setActiveMatch(null);
              setScreen('menu');
              applyOrientationForScreen('menu');
              soundManager.stopMusic();
            }}
          />
        )}
      </div>
    );
  }

  // Portrait Main Menu & Match Setup Screen (Sections 2, 3, 7, 9.2, 14.3, 15, 16)
  return (
    <div
      className={`h-screen w-full overflow-y-auto touch-pan-y flex flex-col items-center justify-start py-6 px-4 p-safe transition-colors ${
        isLightTheme ? 'bg-stone-200 text-stone-900' : 'bg-stone-950 text-stone-100'
      }`}
    >
      <div className="w-full max-w-md space-y-5">
        {/* Header & Emblem */}
        <header className="rounded-2xl bg-stone-900 border-2 border-amber-500/50 p-5 shadow-2xl text-stone-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-stone-950 border-2 border-amber-500/70 flex items-center justify-center shrink-0 shadow-inner">
                <svg className="w-10 h-10" viewBox="0 0 64 64" aria-hidden="true">
                  <rect x="6" y="6" width="22" height="22" rx="4" fill="#2563eb" stroke="#93c5fd" strokeWidth="2" />
                  <rect x="36" y="6" width="22" height="22" rx="4" fill="#d97706" stroke="#fde68a" strokeWidth="2" />
                  <rect x="6" y="36" width="22" height="22" rx="4" fill="#16a34a" stroke="#86efac" strokeWidth="2" />
                  <rect x="36" y="36" width="22" height="22" rx="4" fill="#dc2626" stroke="#fca5a5" strokeWidth="2" />
                  <circle cx="32" cy="32" r="9" fill="#1c1917" stroke="#fbbf24" strokeWidth="2.5" />
                </svg>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                  Sıra Tabanlı Strateji
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white">KareFetih</h1>
                <p className="text-xs text-stone-400 mt-0.5">
                  Zarla fetih hakkı kazan, 2×2+ kompakt cephelerle haritaya hükmet!
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-stone-800 flex flex-wrap items-center justify-between gap-2">
            <PWAInstallButton />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowProfilesModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold border border-stone-700 cursor-pointer"
                title="Oyuncu Profilleri ve İstatistikler"
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                <span>İstatistikler</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBioModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold border border-stone-700 cursor-pointer"
                title="Geometrik Strateji & AlphaFold Analizi"
              >
                <Dna className="w-3.5 h-3.5 text-amber-400" />
                <span>Rehber</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 cursor-pointer"
                title="Ayarlar"
              >
                <Settings className="w-4 h-4 text-amber-400" />
              </button>
            </div>
          </div>
        </header>

        {/* Active Saved Match Resume Banner (Section 14.3) */}
        {hasSavedMatch && (
          <div className="rounded-2xl bg-amber-950/40 border-2 border-amber-500/70 p-4 shadow-xl text-stone-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <RotateCcw className="w-4 h-4" />
                <span>Kayıtlı Maç Mevcut</span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                Kaldığın Yerden
              </span>
            </div>
            <p className="text-xs text-stone-300">
              Kaydedilmiş aktif maçınız tüm kare sahiplikleri, sıra, zar ve kalan fetih haklarıyla korundu.
            </p>
            <button
              type="button"
              data-resume="true"
              onClick={handleResumeSavedMatch}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Devam Et (Kayıtlı Maçı Aç)</span>
            </button>
          </div>
        )}

        {/* Match Setup Card */}
        <section className="rounded-2xl bg-stone-900 border border-stone-800 p-5 shadow-2xl text-stone-100 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-amber-300">
                Maç Kurulumu
              </h2>
            </div>
            <span className="text-[11px] text-stone-400">Her oyuncu 10 kareyle (2×5) başlar</span>
          </div>

          {/* 1. Game Mode */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-300 block">Oyun Modu</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGameMode('vs_ai')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
                  gameMode === 'vs_ai'
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>Yapay Zekâya Karşı</span>
              </button>
              <button
                type="button"
                onClick={() => setGameMode('local_multiplayer')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
                  gameMode === 'local_multiplayer'
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Aynı Telefonda</span>
              </button>
            </div>
          </div>

          {/* 2. Player Count */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-300 block">
              Oyuncu Sayısı (Uzak Köşe Yerleşimi)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([2, 3, 4] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setPlayerCount(cnt)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                    playerCount === cnt
                      ? 'bg-amber-600 border-amber-400 text-stone-950'
                      : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  {cnt} Oyuncu
                </button>
              ))}
            </div>
          </div>

          {/* 3. AI Difficulty (only in vs_ai mode) */}
          {gameMode === 'vs_ai' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-300 block">
                Yapay Zekâ Zorluk Seviyesi
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'kolay', label: 'Kolay' },
                    { id: 'orta', label: 'Orta' },
                    { id: 'zor', label: 'Zor' },
                    { id: 'uzman', label: 'Uzman' },
                  ] as const
                ).map((diff) => (
                  <button
                    key={diff.id}
                    type="button"
                    onClick={() => setAiDifficulty(diff.id)}
                    className={`py-2 px-2 rounded-xl border text-xs font-bold cursor-pointer ${
                      aiDifficulty === diff.id
                        ? 'bg-amber-600 border-amber-400 text-stone-950'
                        : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    {diff.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Player Names & Colors */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-300 block">
              Oyuncular ve Köşe Renkleri
            </label>
            <div className="space-y-1.5">
              {Array.from({ length: playerCount }).map((_, idx) => {
                const profileId = `prof-human-${idx + 1}`;
                const isHuman = gameMode === 'local_multiplayer' ? true : idx === 0;
                const colorKey = slotColors[profileId] || COLOR_KEYS[idx];
                const palette = PLAYER_PALETTES[colorKey] || PLAYER_PALETTES.blue;

                return (
                  <div
                    key={profileId}
                    className="flex items-center gap-2 bg-stone-950/90 border border-stone-800 rounded-xl px-3 py-2"
                  >
                    <span
                      className="w-4 h-4 rounded-sm border border-white/40 shrink-0"
                      style={{ backgroundColor: palette.fillHex }}
                    />
                    {isHuman ? (
                      <input
                        type="text"
                        value={slotNames[profileId] ?? `Komutan ${idx + 1}`}
                        onChange={(e) =>
                          setSlotNames((prev) => ({ ...prev, [profileId]: e.target.value }))
                        }
                        maxLength={18}
                        className="flex-1 bg-transparent text-xs font-semibold text-white focus:outline-none border-b border-stone-800 focus:border-amber-500 pb-0.5"
                      />
                    ) : (
                      <div className="flex-1 text-xs font-semibold text-stone-300">
                        YZ Komutan {idx} ({aiDifficulty.toUpperCase()})
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      {COLOR_KEYS.map((k) => {
                        const c = PLAYER_PALETTES[k];
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() =>
                              setSlotColors((prev) => ({ ...prev, [profileId]: k }))
                            }
                            className={`w-4 h-4 rounded-sm border cursor-pointer ${
                              colorKey === k
                                ? 'border-white scale-110'
                                : 'border-transparent opacity-60'
                            }`}
                            style={{ backgroundColor: c.fillHex }}
                            title={c.label}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Map Mode (Rastgele Taktik Harita vs Klasik Düz) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>Harita Modu ve Arazi</span>
              </span>
              <span className="text-[10px] font-semibold text-amber-400">
                {mapMode === 'random' ? 'Nehir, Dağ Engelleri & Köprüler' : 'Açık Düz Meydan'}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMapMode('random')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                  mapMode === 'random'
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                Rastgele Taktik Harita
              </button>
              <button
                type="button"
                onClick={() => setMapMode('classic')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                  mapMode === 'classic'
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                Klasik Düz Harita
              </button>
            </div>
          </div>

          {/* 6. Board Dimensions (Square & Non-Square Rectangular) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5 text-amber-400" />
                <span>Harita Boyutu (Kare & Dikdörtgen)</span>
              </span>
              <span className="text-[11px] font-mono text-amber-400">
                {useCustomBoard
                  ? `${customBoardCols}×${customBoardRows}`
                  : (BOARD_DIMENSION_PRESETS.find((p) => p.key === boardPresetKey)?.label ??
                    '28×18')}
              </span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {BOARD_DIMENSION_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setUseCustomBoard(false);
                    setBoardPresetKey(preset.key);
                  }}
                  className={`py-1.5 px-1.5 rounded-xl border text-xs font-bold font-mono cursor-pointer flex flex-col items-center justify-center ${
                    !useCustomBoard && boardPresetKey === preset.key
                      ? 'bg-amber-600 border-amber-400 text-stone-950'
                      : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <span>{preset.label}</span>
                  {preset.badge && (
                    <span className="text-[9px] font-sans uppercase tracking-tighter opacity-80">
                      {preset.badge}
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUseCustomBoard(true)}
                className={`col-span-2 py-1.5 px-2 rounded-xl border text-xs font-bold cursor-pointer ${
                  useCustomBoard
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                Özel Boyut (G×Y)
              </button>
            </div>
            {useCustomBoard && (
              <div className="flex flex-wrap items-center gap-2 pt-1 bg-stone-950/70 p-2.5 rounded-xl border border-stone-800">
                <span className="text-xs text-stone-300 font-semibold">Genişlik × Yükseklik (15–60):</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={15}
                    max={60}
                    value={customBoardCols}
                    onChange={(e) => setCustomBoardCols(Number(e.target.value))}
                    className="w-16 px-2 py-1 rounded-lg bg-stone-900 border border-stone-700 text-xs font-mono text-white text-center"
                    aria-label="Harita Genişliği"
                  />
                  <span className="text-xs font-bold text-amber-400">×</span>
                  <input
                    type="number"
                    min={15}
                    max={60}
                    value={customBoardRows}
                    onChange={(e) => setCustomBoardRows(Number(e.target.value))}
                    className="w-16 px-2 py-1 rounded-lg bg-stone-900 border border-stone-700 text-xs font-mono text-white text-center"
                    aria-label="Harita Yüksekliği"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 7. Win Mode & Turn Limit (Minimum 15 turns: 15, 20, 25, 30, Özel) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Kazanma Koşulu</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVictoryMode('full_conquest')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                  victoryMode === 'full_conquest'
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                Tam Fetih (Son Kalan)
              </button>
              <button
                type="button"
                onClick={() => setVictoryMode('turn_limited')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                  victoryMode === 'turn_limited'
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-950 border-stone-800 text-stone-300 hover:bg-stone-800'
                }`}
              >
                Tur Sınırlı Mod
              </button>
            </div>

            {victoryMode === 'turn_limited' && (
              <div className="pt-1.5 space-y-1.5">
                <div className="grid grid-cols-5 gap-1.5">
                  {[15, 20, 25, 30].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setUseCustomRounds(false);
                        setRoundPreset(r);
                      }}
                      className={`py-1.5 px-1 rounded-lg border text-xs font-bold font-mono cursor-pointer ${
                        !useCustomRounds && roundPreset === r
                          ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                          : 'bg-stone-950 border-stone-800 text-stone-400'
                      }`}
                    >
                      {r} Tur
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setUseCustomRounds(true)}
                    className={`py-1.5 px-1 rounded-lg border text-xs font-bold cursor-pointer ${
                      useCustomRounds
                        ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                        : 'bg-stone-950 border-stone-800 text-stone-400'
                    }`}
                  >
                    Özel
                  </button>
                </div>
                {useCustomRounds && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-400">Özel Tur Sayısı (En az 15, 15–100):</span>
                    <input
                      type="number"
                      min={15}
                      max={100}
                      value={customRounds}
                      onChange={(e) => setCustomRounds(Number(e.target.value))}
                      className="w-20 px-2.5 py-1 rounded-lg bg-stone-950 border border-stone-700 text-xs font-mono text-white"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 7. First Turn Order Option (Section 3: random first turn must not alter starting corner locations) */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 text-xs text-stone-300">
              <Shuffle className="w-3.5 h-3.5 text-amber-400" />
              <span>Rastgele İlk Oynama Sırası (Köşeler Sabit Kalır)</span>
            </div>
            <button
              type="button"
              onClick={() => setRandomizeTurnOrder((prev) => !prev)}
              className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                randomizeTurnOrder
                  ? 'bg-amber-600 border-amber-400 text-stone-950'
                  : 'bg-stone-950 border-stone-800 text-stone-400'
              }`}
            >
              {randomizeTurnOrder ? 'RASTGELE' : 'SIRALI'}
            </button>
          </div>

          {/* Primary Start Button */}
          <button
            type="button"
            data-start="true"
            onClick={handleStartNewMatchClick}
            className="w-full py-3.5 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-extrabold text-base flex items-center justify-center gap-2.5 shadow-xl transition-colors cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Yeni Maç Başlat</span>
          </button>
        </section>
      </div>

      {/* Overwrite Active Saved Match Confirmation Modal (Section 14.5) */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-md rounded-2xl bg-stone-900 border-2 border-amber-500/60 p-5 text-stone-100 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Kayıtlı Maç Mevcut</h3>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              Devam eden kayıtlı bir maçınız bulunuyor. <strong>Yeni Maç</strong> başlatırsanız eski devam kaydı silinecektir (tamamlanmış maç istatistikleriniz korunur). Ne yapmak istersiniz?
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowOverwriteConfirm(false);
                  handleResumeSavedMatch();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer"
              >
                Kayıtlı Maça Devam Et
              </button>
              <button
                type="button"
                onClick={() => startFreshMatch()}
                className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer"
              >
                Eski Devam Kaydını Sil ve Yeni Maç Başlat
              </button>
              <button
                type="button"
                onClick={() => setShowOverwriteConfirm(false)}
                className="w-full py-2 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-xs cursor-pointer"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfilesModal && (
        <ProfilesStatsModal
          profiles={profiles}
          history={history}
          onClose={() => setShowProfilesModal(false)}
          onUpdateProfile={handleUpdateProfile}
          cloudUserName={cloudUserName}
          cloudSyncStatus={cloudSyncStatus}
          onCloudSignIn={handleCloudSignIn}
          onCloudSignOut={handleCloudSignOut}
          onCloudSyncNow={handleCloudSyncNow}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onUpdate={setSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {showBioModal && <BioStrategyModal onClose={() => setShowBioModal(false)} />}
    </div>
  );
}
