export type GameMode = 'vs_ai' | 'local_multiplayer';

export type VictoryMode = 'full_conquest' | 'turn_limited';

export type AIDifficulty = 'kolay' | 'orta' | 'zor' | 'uzman';

export type MapMode = 'classic' | 'random';

/**
 * 0 = normal conquerable land
 * 1 = impassable obstacle (water channel / canyon / mountain rock)
 * 2 = conquerable tactical bridge spanning across obstacle channels
 */
export type TerrainCode = 0 | 1 | 2;

export type PlayerColorKey = 'blue' | 'red' | 'green' | 'gold';

export interface PlayerPalette {
  key: PlayerColorKey;
  label: string;
  fillHex: string;
  fillSecondaryHex: string;
  borderHex: string;
  frontierHex: string;
  lightHex: string;
  textHex: string;
}

export interface BoardThemePalette {
  mode: 'dark' | 'light';
  appBg: string;
  boardViewportBg: string;
  boardFrameOuter: string;
  boardFrameInner: string;
  boardShadow: string;
  emptyTileEven: string;
  emptyTileOdd: string;
  emptyTileBevel: string;
  gridLine: string;
  panelBg: string;
  panelBorder: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentGold: string;
  diceBg: string;
  diceBorder: string;
  dicePip: string;
  validSelectionFill: string;
  validSelectionStroke: string;
  invalidSelectionFill: string;
  invalidSelectionStroke: string;
  players: Record<PlayerColorKey, PlayerPalette>;
}

export const PLAYER_PALETTES_DARK: Record<PlayerColorKey, PlayerPalette> = {
  blue: {
    key: 'blue',
    label: 'Safir Mavi',
    fillHex: '#2563EB',
    fillSecondaryHex: '#1D4ED8',
    borderHex: '#93C5FD',
    frontierHex: '#BFDBFE',
    lightHex: '#1E3A8A',
    textHex: '#60A5FA',
  },
  red: {
    key: 'red',
    label: 'Kızıl Yakut',
    fillHex: '#DC2626',
    fillSecondaryHex: '#B91C1C',
    borderHex: '#FCA5A5',
    frontierHex: '#FECACA',
    lightHex: '#7F1D1D',
    textHex: '#F87171',
  },
  green: {
    key: 'green',
    label: 'Zümrüt Yeşil',
    fillHex: '#16A34A',
    fillSecondaryHex: '#15803D',
    borderHex: '#86EFAC',
    frontierHex: '#BBF7D0',
    lightHex: '#14532D',
    textHex: '#4ADE80',
  },
  gold: {
    key: 'gold',
    label: 'İmparator Altın',
    fillHex: '#D97706',
    fillSecondaryHex: '#B45309',
    borderHex: '#FDE68A',
    frontierHex: '#FEF08A',
    lightHex: '#78350F',
    textHex: '#FBBF24',
  },
};

export const PLAYER_PALETTES_LIGHT: Record<PlayerColorKey, PlayerPalette> = {
  blue: {
    key: 'blue',
    label: 'Safir Mavi',
    fillHex: '#1D4ED8',
    fillSecondaryHex: '#1E40AF',
    borderHex: '#DBEAFE',
    frontierHex: '#1E3A8A',
    lightHex: '#DBEAFE',
    textHex: '#1D4ED8',
  },
  red: {
    key: 'red',
    label: 'Kızıl Yakut',
    fillHex: '#B91C1C',
    fillSecondaryHex: '#991B1B',
    borderHex: '#FEE2E2',
    frontierHex: '#7F1D1D',
    lightHex: '#FEE2E2',
    textHex: '#B91C1C',
  },
  green: {
    key: 'green',
    label: 'Zümrüt Yeşil',
    fillHex: '#15803D',
    fillSecondaryHex: '#166534',
    borderHex: '#DCFCE7',
    frontierHex: '#14532D',
    lightHex: '#DCFCE7',
    textHex: '#15803D',
  },
  gold: {
    key: 'gold',
    label: 'İmparator Altın',
    fillHex: '#B45309',
    fillSecondaryHex: '#92400E',
    borderHex: '#FEF3C7',
    frontierHex: '#78350F',
    lightHex: '#FEF3C7',
    textHex: '#B45309',
  },
};

export const PLAYER_PALETTES: Record<PlayerColorKey, PlayerPalette> = PLAYER_PALETTES_DARK;

export const BOARD_THEME_DARK: BoardThemePalette = {
  mode: 'dark',
  appBg: '#0B0E14',
  boardViewportBg: '#0E121A',
  boardFrameOuter: '#C89B3C',
  boardFrameInner: '#3E321D',
  boardShadow: 'rgba(0, 0, 0, 0.65)',
  emptyTileEven: '#1A1F2B',
  emptyTileOdd: '#1F2533',
  emptyTileBevel: 'rgba(255, 255, 255, 0.045)',
  gridLine: '#11151E',
  panelBg: '#151922',
  panelBorder: '#3D3320',
  cardBg: '#1D222E',
  cardBorder: '#343A4A',
  textPrimary: '#F5F2EB',
  textSecondary: '#D4CFC7',
  textMuted: '#999286',
  accentGold: '#FBBF24',
  diceBg: '#231E17',
  diceBorder: '#D4A338',
  dicePip: '#FBBF24',
  validSelectionFill: 'rgba(250, 204, 21, 0.50)',
  validSelectionStroke: '#FEF08A',
  invalidSelectionFill: 'rgba(239, 68, 68, 0.48)',
  invalidSelectionStroke: '#FCA5A5',
  players: PLAYER_PALETTES_DARK,
};

export const BOARD_THEME_LIGHT: BoardThemePalette = {
  mode: 'light',
  appBg: '#E6DEC8',
  boardViewportBg: '#DDD3BC',
  boardFrameOuter: '#8C621E',
  boardFrameInner: '#C69A45',
  boardShadow: 'rgba(62, 46, 20, 0.25)',
  emptyTileEven: '#F6F1E3',
  emptyTileOdd: '#EAE2CE',
  emptyTileBevel: 'rgba(255, 255, 255, 0.75)',
  gridLine: '#C5B99E',
  panelBg: '#F4EFE4',
  panelBorder: '#B89758',
  cardBg: '#FFFFFF',
  cardBorder: '#D5CBB4',
  textPrimary: '#1C1917',
  textSecondary: '#44403C',
  textMuted: '#78716C',
  accentGold: '#92400E',
  diceBg: '#FFFBEB',
  diceBorder: '#B45309',
  dicePip: '#92400E',
  validSelectionFill: 'rgba(22, 163, 74, 0.42)',
  validSelectionStroke: '#14532D',
  invalidSelectionFill: 'rgba(220, 38, 38, 0.42)',
  invalidSelectionStroke: '#7F1D1D',
  players: PLAYER_PALETTES_LIGHT,
};

export function resolveBoardTheme(themeMode: 'dark' | 'light' | 'system'): BoardThemePalette {
  if (themeMode === 'light') return BOARD_THEME_LIGHT;
  if (themeMode === 'dark') return BOARD_THEME_DARK;
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  ) {
    return BOARD_THEME_LIGHT;
  }
  return BOARD_THEME_DARK;
}

export interface PlayerSetupConfig {
  id: string;
  profileId: string;
  name: string;
  colorKey: PlayerColorKey;
  isAI: boolean;
  aiDifficulty: AIDifficulty;
}

export interface PlayerState {
  id: string;
  slotIndex: number; // 1..4 on board
  profileId: string;
  name: string;
  colorKey: PlayerColorKey;
  isAI: boolean;
  aiDifficulty: AIDifficulty;
  eliminated: boolean;
  tileCount: number;
  conqueredCount: number;
  eliminationsCaused: number;
  startingCells: number[];
}

export interface DiceResult {
  die1: number;
  die2: number;
  totalRights: number;
  rollId: string;
}

export interface MatchSetupConfig {
  gameMode: GameMode;
  victoryMode: VictoryMode;
  maxTurns: number; // used when victoryMode === 'turn_limited' (min 15 in UI: 15, 20, 25, 30, or custom)
  boardSize: number; // primary dimension for backward compatibility
  boardCols?: number; // width (columns, 15..60), allows non-square boards
  boardRows?: number; // height (rows, 15..60), allows non-square boards
  mapMode?: MapMode; // 'classic' | 'random' (with obstacles & bridges)
  players: PlayerSetupConfig[];
  randomizeTurnOrder?: boolean;
}

export interface MatchState {
  matchId: string;
  status: 'playing' | 'completed';
  gameMode: GameMode;
  victoryMode: VictoryMode;
  maxTurns: number;
  boardSize: number; // equals boardCols for square boards, or max(boardCols, boardRows)
  boardCols: number; // columns (width)
  boardRows: number; // rows (height)
  mapMode: MapMode;
  board: number[]; // length = boardRows * boardCols; 0 = empty, 1..4 = player slotIndex
  terrain: TerrainCode[]; // length = boardRows * boardCols; 0 = land, 1 = obstacle, 2 = bridge
  players: PlayerState[];
  turnOrder: string[]; // array of player.id
  activeTurnIndex: number;
  activePlayerId: string;
  turnNumber: number;
  turnRoundCompletedIds: string[];
  dice: DiceResult | null;
  remainingRights: number;
  usedRights: number;
  selectedCells: number[];
  lastConqueredCells?: number[];
  lastConqueredBySlot?: number | null;
  lastConquestAt?: number;
  aiTurnLockId: string | null;
  winnerIds: string[];
  isDraw: boolean;
  statsRecorded: boolean;
  createdAt: number;
  updatedAt: number;
  lastActionMessage: string | null;
  validationError: string | null;
}

export interface ValidationResult {
  valid: boolean;
  reason: string | null;
  cost: number;
}

export interface MatchSummary {
  matchId: string;
  completedAt: number;
  gameMode: GameMode;
  victoryMode: VictoryMode;
  boardSize: number;
  boardCols?: number;
  boardRows?: number;
  mapMode?: MapMode;
  turnCount: number;
  winnerIds: string[];
  isDraw: boolean;
  standings: {
    playerId: string;
    profileId: string;
    name: string;
    colorKey: PlayerColorKey;
    isAI: boolean;
    tileCount: number;
    conqueredCount: number;
    eliminated: boolean;
    rank: number;
  }[];
}

export interface PlayerProfile {
  profileId: string;
  name: string;
  colorKey: PlayerColorKey;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  fullConquestMatches: number;
  fullConquestWins: number;
  turnLimitedMatches: number;
  turnLimitedWins: number;
  totalConqueredTiles: number;
  eliminationsCaused: number;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrationEnabled: boolean;
  themeMode: 'dark' | 'light' | 'system';
  renderMode: '2d' | '3d';
}
