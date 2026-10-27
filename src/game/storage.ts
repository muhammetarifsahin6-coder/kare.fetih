import { buildMatchSummary } from './engine';
import {
  AppSettings,
  MatchState,
  MatchSummary,
  PlayerColorKey,
  PlayerProfile,
} from './types';

const ACTIVE_MATCH_KEY = 'KAREFETIH_ACTIVE_MATCH_V2';
const ACTIVE_MATCH_BACKUP_KEY = 'KAREFETIH_ACTIVE_MATCH_BACKUP_V2';
const PROFILES_KEY = 'KAREFETIH_PROFILES_V2';
const HISTORY_KEY = 'KAREFETIH_HISTORY_V2';
const RECORDED_MATCH_IDS_KEY = 'KAREFETIH_RECORDED_MATCH_IDS_V2';
const SETTINGS_KEY = 'KAREFETIH_SETTINGS_V2';

// In-memory fallback store for Node unit tests or restricted storage environments
const memoryStore = new Map<string, string>();

function getRawItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Fallback to memoryStore
  }
  return memoryStore.get(key) ?? null;
}

function setRawItem(key: string, value: string): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
    memoryStore.set(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeRawItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
  memoryStore.delete(key);
}

export function isValidSavedMatchState(obj: unknown): obj is MatchState {
  if (!obj || typeof obj !== 'object') return false;
  const m = obj as Partial<MatchState>;
  if (typeof m.matchId !== 'string' || !m.matchId) return false;
  if (m.status !== 'playing' && m.status !== 'completed') return false;
  if (typeof m.boardSize !== 'number' || m.boardSize < 10 || m.boardSize > 60) return false;
  const cols = typeof m.boardCols === 'number' ? m.boardCols : m.boardSize;
  const rows = typeof m.boardRows === 'number' ? m.boardRows : m.boardSize;
  if (cols < 10 || cols > 60 || rows < 10 || rows > 60) return false;
  if (!Array.isArray(m.board) || m.board.length !== rows * cols) return false;
  if (!Array.isArray(m.players) || m.players.length < 2 || m.players.length > 4) return false;
  if (!Array.isArray(m.turnOrder) || m.turnOrder.length !== m.players.length) return false;
  if (typeof m.activePlayerId !== 'string' || !m.activePlayerId) return false;
  if (typeof m.turnNumber !== 'number' || m.turnNumber < 1) return false;
  if (typeof m.remainingRights !== 'number' || m.remainingRights < 0) return false;
  return true;
}

let saveInProgress = false;

/**
 * Saves an active match state reliably.
 * Preserves the previous valid save in backup before writing, preventing corruption.
 */
export function saveActiveMatch(state: MatchState): { success: boolean; error: string | null } {
  if (saveInProgress) {
    return { success: true, error: null };
  }
  if (state.status !== 'playing') {
    clearActiveMatchSave();
    return { success: true, error: null };
  }

  saveInProgress = true;
  try {
    const cleanState: MatchState = {
      ...state,
      aiTurnLockId: null, // Never persist transient coroutine locks
      updatedAt: Date.now(),
    };
    const serialized = JSON.stringify(cleanState);

    const existing = getRawItem(ACTIVE_MATCH_KEY);
    if (existing) {
      setRawItem(ACTIVE_MATCH_BACKUP_KEY, existing);
    }

    const ok = setRawItem(ACTIVE_MATCH_KEY, serialized);
    if (!ok) {
      return {
        success: false,
        error: 'Cihaz depolama alanı dolu veya erişilemiyor. Lütfen tekrar deneyin.',
      };
    }
    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Kayıt sırasında beklenmeyen bir hata oluştu.',
    };
  } finally {
    saveInProgress = false;
  }
}

/**
 * Loads the active saved match if one exists and is in 'playing' state.
 * Automatically falls back to the backup copy if the primary record is corrupted.
 */
export function loadActiveMatch(): MatchState | null {
  const tryParse = (raw: string | null): MatchState | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (isValidSavedMatchState(parsed) && parsed.status === 'playing') {
        const boardCols = parsed.boardCols || parsed.boardSize;
        const boardRows = parsed.boardRows || parsed.boardSize;
        const total = boardRows * boardCols;
        return {
          ...parsed,
          boardCols,
          boardRows,
          mapMode: parsed.mapMode || 'classic',
          terrain:
            Array.isArray(parsed.terrain) && parsed.terrain.length === total
              ? parsed.terrain
              : new Array(total).fill(0),
          aiTurnLockId: null,
          selectedCells: Array.isArray(parsed.selectedCells) ? parsed.selectedCells : [],
          turnRoundCompletedIds: Array.isArray(parsed.turnRoundCompletedIds)
            ? parsed.turnRoundCompletedIds
            : [],
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  const primary = tryParse(getRawItem(ACTIVE_MATCH_KEY));
  if (primary) return primary;

  const backup = tryParse(getRawItem(ACTIVE_MATCH_BACKUP_KEY));
  if (backup) {
    setRawItem(ACTIVE_MATCH_KEY, JSON.stringify(backup));
    return backup;
  }

  return null;
}

export function hasActiveMatchSave(): boolean {
  return loadActiveMatch() !== null;
}

/**
 * Deletes ONLY the active match save and backup, leaving all profiles, statistics, and settings intact.
 */
export function clearActiveMatchSave(): void {
  removeRawItem(ACTIVE_MATCH_KEY);
  removeRawItem(ACTIVE_MATCH_BACKUP_KEY);
}

export const DEFAULT_PROFILES: PlayerProfile[] = [
  {
    profileId: 'prof-human-1',
    name: 'Komutan 1',
    colorKey: 'blue',
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    fullConquestMatches: 0,
    fullConquestWins: 0,
    turnLimitedMatches: 0,
    turnLimitedWins: 0,
    totalConqueredTiles: 0,
    eliminationsCaused: 0,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    profileId: 'prof-human-2',
    name: 'Komutan 2',
    colorKey: 'red',
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    fullConquestMatches: 0,
    fullConquestWins: 0,
    turnLimitedMatches: 0,
    turnLimitedWins: 0,
    totalConqueredTiles: 0,
    eliminationsCaused: 0,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    profileId: 'prof-human-3',
    name: 'Komutan 3',
    colorKey: 'green',
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    fullConquestMatches: 0,
    fullConquestWins: 0,
    turnLimitedMatches: 0,
    turnLimitedWins: 0,
    totalConqueredTiles: 0,
    eliminationsCaused: 0,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    profileId: 'prof-human-4',
    name: 'Komutan 4',
    colorKey: 'gold',
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    fullConquestMatches: 0,
    fullConquestWins: 0,
    turnLimitedMatches: 0,
    turnLimitedWins: 0,
    totalConqueredTiles: 0,
    eliminationsCaused: 0,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
];

export function loadProfiles(): PlayerProfile[] {
  const raw = getRawItem(PROFILES_KEY);
  if (!raw) {
    setRawItem(PROFILES_KEY, JSON.stringify(DEFAULT_PROFILES));
    return [...DEFAULT_PROFILES];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Fallback
  }
  return [...DEFAULT_PROFILES];
}

export function saveProfiles(profiles: PlayerProfile[]): void {
  setRawItem(PROFILES_KEY, JSON.stringify(profiles));
}

/**
 * Updates a player profile's display name or color WITHOUT losing any statistics (keyed by stable profileId).
 */
export function updateProfileIdentity(
  profileId: string,
  newName: string,
  newColorKey?: PlayerColorKey
): PlayerProfile[] {
  const profiles = loadProfiles();
  const trimmed = newName.trim();
  const updated = profiles.map((p) => {
    if (p.profileId !== profileId) return p;
    return {
      ...p,
      name: trimmed.length > 0 ? trimmed.slice(0, 40) : p.name,
      colorKey: newColorKey ?? p.colorKey,
      updatedAt: Date.now(),
    };
  });
  saveProfiles(updated);
  return updated;
}

export function loadMatchHistory(): MatchSummary[] {
  const raw = getRawItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getRecordedMatchIds(): Set<string> {
  const raw = getRawItem(RECORDED_MATCH_IDS_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Records a completed match's results into player profiles and match history strictly ONCE.
 * Also clears the active match save so completed matches do not appear under "Devam Et".
 */
export function recordCompletedMatchOnce(state: MatchState): {
  profiles: PlayerProfile[];
  history: MatchSummary[];
  alreadyRecorded: boolean;
} {
  clearActiveMatchSave();

  const recordedIds = getRecordedMatchIds();
  if (state.status !== 'completed' || state.statsRecorded || recordedIds.has(state.matchId)) {
    return {
      profiles: loadProfiles(),
      history: loadMatchHistory(),
      alreadyRecorded: true,
    };
  }

  recordedIds.add(state.matchId);
  setRawItem(RECORDED_MATCH_IDS_KEY, JSON.stringify(Array.from(recordedIds)));

  const profiles = loadProfiles();
  const profileMap = new Map<string, PlayerProfile>();
  for (const p of profiles) {
    profileMap.set(p.profileId, { ...p });
  }

  for (const player of state.players) {
    if (player.isAI) continue;
    let prof = profileMap.get(player.profileId);
    if (!prof) {
      prof = {
        profileId: player.profileId,
        name: player.name,
        colorKey: player.colorKey,
        totalMatches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        fullConquestMatches: 0,
        fullConquestWins: 0,
        turnLimitedMatches: 0,
        turnLimitedWins: 0,
        totalConqueredTiles: 0,
        eliminationsCaused: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      profileMap.set(player.profileId, prof);
    }

    const isWinner = state.winnerIds.includes(player.id);
    prof.name = player.name;
    prof.totalMatches += 1;
    prof.totalConqueredTiles += player.conqueredCount;
    prof.eliminationsCaused += player.eliminationsCaused;

    if (state.isDraw && isWinner) {
      prof.draws += 1;
    } else if (isWinner) {
      prof.wins += 1;
    } else {
      prof.losses += 1;
    }

    if (state.victoryMode === 'full_conquest') {
      prof.fullConquestMatches += 1;
      if (isWinner && !state.isDraw) {
        prof.fullConquestWins += 1;
      }
    } else {
      prof.turnLimitedMatches += 1;
      if (isWinner && !state.isDraw) {
        prof.turnLimitedWins += 1;
      }
    }
    prof.updatedAt = Date.now();
  }

  const nextProfiles = Array.from(profileMap.values());
  saveProfiles(nextProfiles);

  const summary = buildMatchSummary(state);
  const existingHistory = loadMatchHistory();
  const nextHistory = [summary, ...existingHistory.filter((h) => h.matchId !== state.matchId)].slice(
    0,
    50
  );
  setRawItem(HISTORY_KEY, JSON.stringify(nextHistory));

  return {
    profiles: nextProfiles,
    history: nextHistory,
    alreadyRecorded: false,
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  musicEnabled: false,
  vibrationEnabled: true,
  themeMode: 'dark',
  renderMode: '2d',
};

export function loadSettings(): AppSettings {
  const raw = getRawItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  setRawItem(SETTINGS_KEY, JSON.stringify(settings));
}
