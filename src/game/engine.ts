import {
  AIDifficulty,
  DiceResult,
  MapMode,
  MatchSetupConfig,
  MatchState,
  MatchSummary,
  PlayerState,
  TerrainCode,
  ValidationResult,
} from './types';

export const INVALID_CORRIDOR_MESSAGE =
  'Bu fetih alanı çok ince veya bağlantısız. Daha geniş ve geçerli bir alan seç.';

export const INVALID_OBSTACLE_MESSAGE =
  'Engel (dağ veya derin su) kareleri fethedilemez. Köprüleri veya açık arazileri seçin.';

export function coordToIndex(row: number, col: number, boardCols: number): number {
  return row * boardCols + col;
}

export function indexToCoord(index: number, boardCols: number): { row: number; col: number } {
  return {
    row: Math.floor(index / boardCols),
    col: index % boardCols,
  };
}

export function getOrthogonalNeighbors(
  index: number,
  boardCols: number,
  boardRows: number = boardCols
): number[] {
  const row = Math.floor(index / boardCols);
  const col = index % boardCols;
  const neighbors: number[] = [];
  if (row > 0) neighbors.push((row - 1) * boardCols + col);
  if (row < boardRows - 1) neighbors.push((row + 1) * boardCols + col);
  if (col > 0) neighbors.push(row * boardCols + (col - 1));
  if (col < boardCols - 1) neighbors.push(row * boardCols + (col + 1));
  return neighbors;
}

/**
 * Generates maximally distant 10-cell contiguous starting areas (2x5) in board corners.
 * Supports both square (N x N) and rectangular (boardCols x boardRows) boards:
 * - 2 players: Top-Left (0) and Bottom-Right (1) -> maximally distant opposite corners.
 * - 3 players: Top-Left (0), Bottom-Right (1), Top-Right (2) -> 3 corners, Bottom-Left stays empty.
 * - 4 players: Top-Left (0), Bottom-Right (1), Top-Right (2), Bottom-Left (3) -> all 4 corners.
 */
export function generateStartingAreas(
  boardCols: number,
  playerCount: number,
  boardRows: number = boardCols
): number[][] {
  if (boardCols < 10 || boardRows < 10) {
    throw new Error('Board dimensions must be at least 10x10');
  }
  if (playerCount < 2 || playerCount > 4) {
    throw new Error('Player count must be between 2 and 4');
  }

  // Each corner block is 2 rows x 5 cols = 10 contiguous squares flush with the corner
  const buildBlock = (startRow: number, startCol: number, rows = 2, cols = 5): number[] => {
    const cells: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push(coordToIndex(startRow + r, startCol + c, boardCols));
      }
    }
    return cells;
  };

  const topLeft = buildBlock(0, 0, 2, 5);
  const bottomRight = buildBlock(boardRows - 2, boardCols - 5, 2, 5);
  const topRight = buildBlock(0, boardCols - 5, 2, 5);
  const bottomLeft = buildBlock(boardRows - 2, 0, 2, 5);

  if (playerCount === 2) {
    return [topLeft, bottomRight];
  }
  if (playerCount === 3) {
    return [topLeft, bottomRight, topRight];
  }
  return [topLeft, bottomRight, topRight, bottomLeft];
}

/**
 * Generates a coherent strategic battlefield with natural river/chasm obstacles (1)
 * and 2-to-3-wide tactical bridges (2) connecting regions, while keeping all starting
 * corners and their expansion buffers 100% clear and mutually reachable.
 */
export function generateCoherentTerrain(
  boardCols: number,
  boardRows: number,
  startingAreas: number[][],
  rng: () => number = Math.random
): TerrainCode[] {
  const total = boardRows * boardCols;
  const terrain = new Array<TerrainCode>(total).fill(0);

  // Protect all 4 corners (5 rows x 8 cols around each corner) so players always have open initial expansion
  const isProtectedCorner = (r: number, c: number): boolean => {
    const inTop = r < 5;
    const inBottom = r >= boardRows - 5;
    const inLeft = c < 8;
    const inRight = c >= boardCols - 8;
    return (inTop && inLeft) || (inTop && inRight) || (inBottom && inLeft) || (inBottom && inRight);
  };

  const startSet = new Set<number>();
  for (const area of startingAreas) {
    for (const idx of area) startSet.add(idx);
  }

  // 1. Primary River/Canyon Channel + Tactical Bridges
  const horizontalRiver = boardRows > boardCols ? true : boardCols > boardRows ? false : rng() < 0.5;

  if (!horizontalRiver) {
    // Vertical meandering river channel near the center column
    const baseCol = Math.floor(boardCols / 2);
    let offset = 0;
    const bridgeRow1 = Math.max(4, Math.floor(boardRows * 0.28));
    const bridgeRow2 = Math.min(boardRows - 5, Math.floor(boardRows * 0.72));
    const hasCenterBridge = boardRows >= 24;
    const bridgeRowMid = Math.floor(boardRows * 0.5);

    for (let r = 0; r < boardRows; r++) {
      if (r % 4 === 0 && r > 0) {
        offset = Math.max(-1, Math.min(1, offset + (rng() < 0.5 ? -1 : 1)));
      }
      const cCenter = baseCol + offset;
      const isBridgeRow =
        Math.abs(r - bridgeRow1) <= 1 ||
        Math.abs(r - bridgeRow2) <= 1 ||
        (hasCenterBridge && Math.abs(r - bridgeRowMid) <= 1);

      for (let dc = -1; dc <= 0; dc++) {
        const c = cCenter + dc;
        if (c <= 1 || c >= boardCols - 2) continue;
        if (isProtectedCorner(r, c)) continue;
        const idx = coordToIndex(r, c, boardCols);
        terrain[idx] = isBridgeRow ? 2 : 1;
      }
    }
  } else {
    // Horizontal meandering river channel near the center row
    const baseRow = Math.floor(boardRows / 2);
    let offset = 0;
    const bridgeCol1 = Math.max(5, Math.floor(boardCols * 0.28));
    const bridgeCol2 = Math.min(boardCols - 6, Math.floor(boardCols * 0.72));
    const hasCenterBridge = boardCols >= 24;
    const bridgeColMid = Math.floor(boardCols * 0.5);

    for (let c = 0; c < boardCols; c++) {
      if (c % 4 === 0 && c > 0) {
        offset = Math.max(-1, Math.min(1, offset + (rng() < 0.5 ? -1 : 1)));
      }
      const rCenter = baseRow + offset;
      const isBridgeCol =
        Math.abs(c - bridgeCol1) <= 1 ||
        Math.abs(c - bridgeCol2) <= 1 ||
        (hasCenterBridge && Math.abs(c - bridgeColMid) <= 1);

      for (let dr = -1; dr <= 0; dr++) {
        const r = rCenter + dr;
        if (r <= 1 || r >= boardRows - 2) continue;
        if (isProtectedCorner(r, c)) continue;
        const idx = coordToIndex(r, c, boardCols);
        terrain[idx] = isBridgeCol ? 2 : 1;
      }
    }
  }

  // 2. Symmetric Mountain / Crag Clusters in the flanks (away from corners and bridges)
  const clusterCount = boardCols * boardRows >= 600 ? 3 : 2;
  for (let k = 0; k < clusterCount; k++) {
    const r0 = 4 + Math.floor(rng() * Math.max(2, Math.floor(boardRows / 2) - 6));
    const c0 = 5 + Math.floor(rng() * Math.max(2, Math.floor(boardCols / 2) - 8));
    const pairs: [number, number][] = [
      [r0, c0],
      [boardRows - 1 - r0, boardCols - 1 - c0],
    ];
    for (const [pr, pc] of pairs) {
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const rr = pr + dr;
          const cc = pc + dc;
          if (rr < 2 || rr >= boardRows - 2 || cc < 2 || cc >= boardCols - 2) continue;
          if (isProtectedCorner(rr, cc)) continue;
          const idx = coordToIndex(rr, cc, boardCols);
          // Do not overwrite bridges or block adjacent bridge approaches
          let nearBridge = false;
          for (const nb of getOrthogonalNeighbors(idx, boardCols, boardRows)) {
            if (terrain[nb] === 2) nearBridge = true;
          }
          if (terrain[idx] === 0 && !nearBridge) {
            terrain[idx] = 1;
          }
        }
      }
    }
  }

  // 3. Subtle coastal indentations on map edges so the map has an organic strategic silhouette
  const midCol = Math.floor(boardCols / 2);
  for (let dc = -2; dc <= 2; dc++) {
    const c = midCol + dc;
    if (c >= 8 && c < boardCols - 8) {
      const topIdx = coordToIndex(0, c, boardCols);
      const botIdx = coordToIndex(boardRows - 1, c, boardCols);
      if (terrain[topIdx] === 0 && terrain[coordToIndex(1, c, boardCols)] === 0) {
        terrain[topIdx] = 1;
      }
      if (terrain[botIdx] === 0 && terrain[coordToIndex(boardRows - 2, c, boardCols)] === 0) {
        terrain[botIdx] = 1;
      }
    }
  }

  // Ensure starting cells are strictly land (0)
  for (const idx of startSet) {
    terrain[idx] = 0;
  }

  // 4. BFS Connectivity Guarantee: ensure all passable tiles form a single connected component
  const startOrigin = startingAreas[0][0];
  const visited = new Set<number>([startOrigin]);
  const queue: number[] = [startOrigin];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const nb of getOrthogonalNeighbors(curr, boardCols, boardRows)) {
      if (terrain[nb] !== 1 && !visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }

  // If any starting cell wasn't reached, open a 2-wide bridge corridor to it
  for (const area of startingAreas) {
    const target = area[0];
    if (!visited.has(target)) {
      const a = indexToCoord(startOrigin, boardCols);
      const b = indexToCoord(target, boardCols);
      let r = a.row;
      let c = a.col;
      while (r !== b.row || c !== b.col) {
        if (r !== b.row) r += b.row > r ? 1 : -1;
        else if (c !== b.col) c += b.col > c ? 1 : -1;
        for (let dr = 0; dr <= 1; dr++) {
          for (let dc = 0; dc <= 1; dc++) {
            const rr = Math.min(boardRows - 1, r + dr);
            const cc = Math.min(boardCols - 1, c + dc);
            const idx = coordToIndex(rr, cc, boardCols);
            if (terrain[idx] === 1) terrain[idx] = 2;
          }
        }
      }
    }
  }

  // Re-run BFS and convert any unreachable isolated land pockets to obstacles so no dead squares exist
  visited.clear();
  visited.add(startOrigin);
  queue.length = 0;
  queue.push(startOrigin);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const nb of getOrthogonalNeighbors(curr, boardCols, boardRows)) {
      if (terrain[nb] !== 1 && !visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  for (let i = 0; i < total; i++) {
    if (terrain[i] !== 1 && !visited.has(i)) {
      terrain[i] = 1;
    }
  }

  return terrain;
}

/**
 * Creates a brand new match state with 10-square starting areas per player.
 * Supports square and non-square (boardCols x boardRows) boards as well as classic and random maps.
 * Randomizing turnOrder NEVER changes the players' starting corner locations.
 */
export function createNewMatch(config: MatchSetupConfig, seedRandom: () => number = Math.random): MatchState {
  const baseSize = Math.max(15, Math.min(60, Math.floor(config.boardSize || 20)));
  const boardCols = Math.max(15, Math.min(60, Math.floor(config.boardCols || baseSize)));
  const boardRows = Math.max(15, Math.min(60, Math.floor(config.boardRows || baseSize)));
  const boardSize = boardCols; // primary stride (columns) for index calculations
  const mapMode: MapMode = config.mapMode || 'classic';

  const playerCount = config.players.length;
  const startingAreas = generateStartingAreas(boardCols, playerCount, boardRows);
  const totalCells = boardRows * boardCols;
  const board = new Array<number>(totalCells).fill(0);
  const terrain: TerrainCode[] =
    mapMode === 'random'
      ? generateCoherentTerrain(boardCols, boardRows, startingAreas, seedRandom)
      : new Array<TerrainCode>(totalCells).fill(0);

  const players: PlayerState[] = config.players.map((p, idx) => {
    const slotIndex = idx + 1;
    const cells = startingAreas[idx];
    for (const cellIdx of cells) {
      board[cellIdx] = slotIndex;
      terrain[cellIdx] = 0;
    }
    return {
      id: p.id,
      slotIndex,
      profileId: p.profileId,
      name: p.name.trim() || `Oyuncu ${slotIndex}`,
      colorKey: p.colorKey,
      isAI: p.isAI,
      aiDifficulty: p.aiDifficulty,
      eliminated: false,
      tileCount: cells.length,
      conqueredCount: 0,
      eliminationsCaused: 0,
      startingCells: [...cells],
    };
  });

  const turnOrder = players.map((p) => p.id);
  if (config.randomizeTurnOrder) {
    for (let i = turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(seedRandom() * (i + 1));
      const tmp = turnOrder[i];
      turnOrder[i] = turnOrder[j];
      turnOrder[j] = tmp;
    }
  }

  const now = Date.now();
  return {
    matchId: `kf-${now}-${Math.floor(seedRandom() * 100000)}`,
    status: 'playing',
    gameMode: config.gameMode,
    victoryMode: config.victoryMode,
    maxTurns: Math.max(1, Math.floor(config.maxTurns || 15)),
    boardSize,
    boardCols,
    boardRows,
    mapMode,
    board,
    terrain,
    players,
    turnOrder,
    activeTurnIndex: 0,
    activePlayerId: turnOrder[0],
    turnNumber: 1,
    turnRoundCompletedIds: [],
    dice: null,
    remainingRights: 0,
    usedRights: 0,
    selectedCells: [],
    lastConqueredCells: [],
    lastConqueredBySlot: null,
    lastConquestAt: 0,
    aiTurnLockId: null,
    winnerIds: [],
    isDraw: false,
    statsRecorded: false,
    createdAt: now,
    updatedAt: now,
    lastActionMessage: 'Maç başladı! Sıradaki oyuncu zar atabilir.',
    validationError: null,
  };
}

/**
 * Checks whether a set of selected cells is orthogonally connected (no diagonal-only links).
 */
export function isOrthogonallyConnected(
  cells: number[],
  boardCols: number,
  boardRows: number = boardCols
): boolean {
  if (cells.length === 0) return false;
  if (cells.length === 1) return true;

  const cellSet = new Set<number>(cells);
  const visited = new Set<number>();
  const queue: number[] = [cells[0]];
  visited.add(cells[0]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const nb of getOrthogonalNeighbors(curr, boardCols, boardRows)) {
      if (cellSet.has(nb) && !visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }

  return visited.size === cellSet.size;
}

/**
 * Rule 5.1: Anti-Snake / Thin Corridor Geometry Validation.
 * Ensures the newly selected group of cells:
 * 1. Is orthogonally connected.
 * 2. Prevents long 1-cell-wide lines/snakes (length >= 4) from extending into enemy territory:
 *    - Selections of 1, 2, or 3 orthogonally connected cells (e.g. when rolling 1x1=1, 1x2=2, 1x3=3 / 3x1=3,
 *      or using 1..3 remaining rights) are allowed as long as they do not chain onto an existing 1-wide spike
 *      to create a >= 4-cell 1-wide corridor.
 *    - Selections that cross a tactical bridge (`terrain[idx] === 2`) are allowed as long as they are orthogonally connected.
 *    - Selections of >= 4 cells on open land must be built from connected 2x2 blocks, rejecting 1x4, 1x5, L-corridors, or tails.
 */
export function isWideValidConquestShape(
  cells: number[],
  boardCols: number,
  board?: number[],
  activeSlotIndex?: number,
  boardRows: number = boardCols,
  terrain?: TerrainCode[]
): boolean {
  if (cells.length === 0) return false;
  if (!isOrthogonallyConnected(cells, boardCols, boardRows)) return false;

  // If the selection crosses a tactical bridge tile, allow orthogonal crossing
  if (terrain && cells.some((idx) => terrain[idx] === 2)) {
    return true;
  }

  const cellSet = new Set<number>(cells);

  // Small selections (1, 2, or 3 cells — essential for 1x1=1, 1x2=2, 1x3=3 / 3x1=3 rolls and 1..3 remaining rights)
  if (cells.length <= 3) {
    if (board && activeSlotIndex !== undefined) {
      // Check that adding `cells` to own territory does not create a 1-wide un-thickened spike of >= 4 cells
      const combined = new Set<number>(cells);
      for (let i = 0; i < board.length; i++) {
        if (board[i] === activeSlotIndex) {
          combined.add(i);
        }
      }

      const thickCombined = new Set<number>();
      for (const idx of combined) {
        const { row, col } = indexToCoord(idx, boardCols);
        if (row < boardRows - 1 && col < boardCols - 1) {
          const c00 = idx;
          const c01 = coordToIndex(row, col + 1, boardCols);
          const c10 = coordToIndex(row + 1, col, boardCols);
          const c11 = coordToIndex(row + 1, col + 1, boardCols);
          if (combined.has(c01) && combined.has(c10) && combined.has(c11)) {
            thickCombined.add(c00);
            thickCombined.add(c01);
            thickCombined.add(c10);
            thickCombined.add(c11);
          }
        }
      }

      // Count how many connected cells in `combined` around `cells` lie outside any 2x2 block
      const thinVisited = new Set<number>();
      const queue: number[] = [];
      for (const c of cells) {
        if (!thickCombined.has(c)) {
          thinVisited.add(c);
          queue.push(c);
        }
      }
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const nb of getOrthogonalNeighbors(curr, boardCols, boardRows)) {
          if (combined.has(nb) && !thickCombined.has(nb) && !thinVisited.has(nb)) {
            thinVisited.add(nb);
            queue.push(nb);
          }
        }
      }

      if (thinVisited.size >= 4) {
        return false;
      }
    }
    return true;
  }

  // For selections of >= 4 cells: find all 2x2 blocks fully contained inside cellSet
  const blocks: number[][] = [];
  const coveredCells = new Set<number>();

  for (const idx of cellSet) {
    const { row, col } = indexToCoord(idx, boardCols);
    if (row < boardRows - 1 && col < boardCols - 1) {
      const c00 = idx;
      const c01 = coordToIndex(row, col + 1, boardCols);
      const c10 = coordToIndex(row + 1, col, boardCols);
      const c11 = coordToIndex(row + 1, col + 1, boardCols);
      if (cellSet.has(c01) && cellSet.has(c10) && cellSet.has(c11)) {
        const block = [c00, c01, c10, c11];
        blocks.push(block);
        coveredCells.add(c00);
        coveredCells.add(c01);
        coveredCells.add(c10);
        coveredCells.add(c11);
      }
    }
  }

  // Every selected cell in a >= 4-cell selection must be part of at least one 2x2 block (no 1-cell-wide tails or corridors)
  if (coveredCells.size !== cellSet.size || blocks.length === 0) {
    return false;
  }

  if (blocks.length === 1) {
    return true;
  }

  // Verify that all 2x2 blocks are connected via shared edges of at least 2 cells
  const visitedBlocks = new Set<number>([0]);
  const queue: number[] = [0];

  const shareAtLeastTwoOrAdjacentEdge = (b1: number[], b2: number[]): boolean => {
    const s1 = new Set(b1);
    let shared = 0;
    for (const c of b2) {
      if (s1.has(c)) shared++;
    }
    if (shared >= 2) return true;
    let orthogonalPairs = 0;
    for (const c1 of b1) {
      for (const nb of getOrthogonalNeighbors(c1, boardCols, boardRows)) {
        if (b2.includes(nb)) {
          orthogonalPairs++;
        }
      }
    }
    return orthogonalPairs >= 2;
  };

  while (queue.length > 0) {
    const currIdx = queue.shift()!;
    for (let i = 0; i < blocks.length; i++) {
      if (!visitedBlocks.has(i) && shareAtLeastTwoOrAdjacentEdge(blocks[currIdx], blocks[i])) {
        visitedBlocks.add(i);
        queue.push(i);
      }
    }
  }

  return visitedBlocks.size === blocks.length;
}

/**
 * Full engine-level validation for a conquest selection (Rule 5 & Rule 5.1).
 * Used identically by both Human players and AI players.
 */
export function validateConquestSelection(
  board: number[],
  boardCols: number,
  activeSlotIndex: number,
  selectedCells: number[],
  remainingRights: number,
  boardRows: number = board.length > 0 && boardCols > 0 ? Math.round(board.length / boardCols) : boardCols,
  terrain?: TerrainCode[]
): ValidationResult {
  if (!selectedCells || selectedCells.length === 0) {
    return {
      valid: false,
      reason: 'Fetih için tahtadan geçerli bir alan seçin.',
      cost: 0,
    };
  }

  const uniqueCells = Array.from(new Set(selectedCells));
  if (uniqueCells.length !== selectedCells.length) {
    return {
      valid: false,
      reason: 'Aynı kare birden fazla kez seçilemez.',
      cost: uniqueCells.length,
    };
  }

  const maxIndex = boardRows * boardCols;
  for (const idx of uniqueCells) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= maxIndex) {
      return {
        valid: false,
        reason: 'Seçilen kare tahta sınırları dışında.',
        cost: uniqueCells.length,
      };
    }
    if (terrain && terrain[idx] === 1) {
      return {
        valid: false,
        reason: INVALID_OBSTACLE_MESSAGE,
        cost: uniqueCells.length,
      };
    }
    if (board[idx] === activeSlotIndex) {
      return {
        valid: false,
        reason: 'Kendi karelerinizi tekrar fethedemezsiniz.',
        cost: uniqueCells.length,
      };
    }
  }

  if (uniqueCells.length > remainingRights) {
    return {
      valid: false,
      reason: `Seçilen alan (${uniqueCells.length} kare) kalan fetih hakkınızı (${remainingRights}) aşıyor.`,
      cost: uniqueCells.length,
    };
  }

  // Must be orthogonally connected and satisfy Rule 5.1
  if (
    !isWideValidConquestShape(
      uniqueCells,
      boardCols,
      board,
      activeSlotIndex,
      boardRows,
      terrain
    )
  ) {
    return {
      valid: false,
      reason: INVALID_CORRIDOR_MESSAGE,
      cost: uniqueCells.length,
    };
  }

  // Must be orthogonally adjacent to at least one existing square owned by activeSlotIndex
  let touchesOwnTerritory = false;
  for (const idx of uniqueCells) {
    for (const nb of getOrthogonalNeighbors(idx, boardCols, boardRows)) {
      if (board[nb] === activeSlotIndex) {
        touchesOwnTerritory = true;
        break;
      }
    }
    if (touchesOwnTerritory) break;
  }

  if (!touchesOwnTerritory) {
    return {
      valid: false,
      reason: INVALID_CORRIDOR_MESSAGE,
      cost: uniqueCells.length,
    };
  }

  return {
    valid: true,
    reason: null,
    cost: uniqueCells.length,
  };
}

/**
 * Rolls two 6-sided dice for the active player.
 * Prevents duplicate rolls in the same turn.
 */
export function rollDiceForActivePlayer(
  state: MatchState,
  forcedDie1?: number,
  forcedDie2?: number,
  rng: () => number = Math.random
): MatchState {
  if (state.status !== 'playing') return state;
  if (state.dice !== null) {
    // Already rolled this turn; do not generate duplicate rights
    return state;
  }

  const activePlayer = state.players.find((p) => p.id === state.activePlayerId);
  if (!activePlayer || activePlayer.eliminated) return state;

  const die1 =
    forcedDie1 !== undefined
      ? Math.max(1, Math.min(6, Math.floor(forcedDie1)))
      : Math.floor(rng() * 6) + 1;
  const die2 =
    forcedDie2 !== undefined
      ? Math.max(1, Math.min(6, Math.floor(forcedDie2)))
      : Math.floor(rng() * 6) + 1;
  const totalRights = die1 * die2;

  const dice: DiceResult = {
    die1,
    die2,
    totalRights,
    rollId: `${state.matchId}-t${state.turnNumber}-${state.activePlayerId}-${Date.now()}`,
  };

  return {
    ...state,
    dice,
    remainingRights: totalRights,
    usedRights: 0,
    selectedCells: [],
    validationError: null,
    updatedAt: Date.now(),
    lastActionMessage: `${activePlayer.name} zar attı: ${die1} × ${die2} = ${totalRights} fetih hakkı!`,
  };
}

/**
 * Updates the current preview selection without mutating actual board ownership.
 */
export function updateSelectionPreview(state: MatchState, selectedCells: number[]): MatchState {
  if (state.status !== 'playing') return state;
  const activePlayer = state.players.find((p) => p.id === state.activePlayerId);
  if (!activePlayer || activePlayer.eliminated) return state;

  const boardCols = state.boardCols || state.boardSize;
  const boardRows = state.boardRows || state.boardSize;
  const maxIndex = boardRows * boardCols;

  const unique = Array.from(new Set(selectedCells)).filter(
    (idx) =>
      idx >= 0 &&
      idx < maxIndex &&
      state.board[idx] !== activePlayer.slotIndex &&
      (!state.terrain || state.terrain[idx] !== 1)
  );

  if (unique.length === 0) {
    return {
      ...state,
      selectedCells: [],
      validationError: null,
    };
  }

  const validation = validateConquestSelection(
    state.board,
    boardCols,
    activePlayer.slotIndex,
    unique,
    state.remainingRights,
    boardRows,
    state.terrain
  );

  return {
    ...state,
    selectedCells: unique,
    validationError: validation.valid ? null : validation.reason,
  };
}

/**
 * Commits a validated conquest move for the active player.
 * - Transfers ownership ONLY for the selected cells.
 * - Deducts used rights from remainingRights.
 * - Recalculates player tile counts and eliminations.
 * - Records lastConqueredCells for smooth Framer Motion color transitions.
 * - Checks if Full Conquest victory was achieved immediately.
 */
export function applyConquestMove(
  state: MatchState,
  cellsToConquer: number[] = state.selectedCells
): { state: MatchState; success: boolean; error: string | null } {
  if (state.status !== 'playing') {
    return { state, success: false, error: 'Maç tamamlandı.' };
  }
  if (!state.dice) {
    return { state, success: false, error: 'Önce zar atmalısınız.' };
  }

  const activePlayer = state.players.find((p) => p.id === state.activePlayerId);
  if (!activePlayer || activePlayer.eliminated) {
    return { state, success: false, error: 'Aktif oyuncu geçersiz.' };
  }

  const boardCols = state.boardCols || state.boardSize;
  const boardRows = state.boardRows || state.boardSize;

  const validation = validateConquestSelection(
    state.board,
    boardCols,
    activePlayer.slotIndex,
    cellsToConquer,
    state.remainingRights,
    boardRows,
    state.terrain
  );

  if (!validation.valid) {
    return {
      state: {
        ...state,
        validationError: validation.reason,
      },
      success: false,
      error: validation.reason,
    };
  }

  const nextBoard = [...state.board];
  const uniqueCells = Array.from(new Set(cellsToConquer));
  for (const idx of uniqueCells) {
    nextBoard[idx] = activePlayer.slotIndex;
  }

  // Count tiles per slot
  const countsBySlot = new Map<number, number>();
  for (let s = 1; s <= state.players.length; s++) {
    countsBySlot.set(s, 0);
  }
  for (let i = 0; i < nextBoard.length; i++) {
    const owner = nextBoard[i];
    if (owner > 0) {
      countsBySlot.set(owner, (countsBySlot.get(owner) || 0) + 1);
    }
  }

  let newlyEliminatedCount = 0;
  const newlyEliminatedNames: string[] = [];

  const nextPlayers: PlayerState[] = state.players
    .map((p) => {
      const newCount = countsBySlot.get(p.slotIndex) || 0;
      const wasEliminated = p.eliminated;
      const isNowEliminated = newCount === 0;
      if (!wasEliminated && isNowEliminated && p.id !== activePlayer.id) {
        newlyEliminatedCount++;
        newlyEliminatedNames.push(p.name);
      }
      return {
        ...p,
        tileCount: newCount,
        eliminated: isNowEliminated,
        conqueredCount:
          p.id === activePlayer.id ? p.conqueredCount + uniqueCells.length : p.conqueredCount,
      };
    })
    .map((p) =>
      p.id === activePlayer.id
        ? { ...p, eliminationsCaused: p.eliminationsCaused + newlyEliminatedCount }
        : p
    );

  const nextRemainingRights = state.remainingRights - uniqueCells.length;
  const nextUsedRights = state.usedRights + uniqueCells.length;
  const now = Date.now();

  // Check if only 1 non-eliminated player remains
  const alivePlayers = nextPlayers.filter((p) => !p.eliminated);
  if (alivePlayers.length === 1) {
    const winner = alivePlayers[0];
    return {
      state: {
        ...state,
        board: nextBoard,
        players: nextPlayers,
        remainingRights: nextRemainingRights,
        usedRights: nextUsedRights,
        selectedCells: [],
        lastConqueredCells: uniqueCells,
        lastConqueredBySlot: activePlayer.slotIndex,
        lastConquestAt: now,
        validationError: null,
        status: 'completed',
        winnerIds: [winner.id],
        isDraw: false,
        aiTurnLockId: null,
        updatedAt: now,
        lastActionMessage: `${winner.name} tüm rakipleri eleyerek zafer kazandı!`,
      },
      success: true,
      error: null,
    };
  }

  const elimSuffix =
    newlyEliminatedNames.length > 0 ? ` (${newlyEliminatedNames.join(', ')} elendi!)` : '';

  return {
    state: {
      ...state,
      board: nextBoard,
      players: nextPlayers,
      remainingRights: nextRemainingRights,
      usedRights: nextUsedRights,
      selectedCells: [],
      lastConqueredCells: uniqueCells,
      lastConqueredBySlot: activePlayer.slotIndex,
      lastConquestAt: now,
      validationError: null,
      updatedAt: now,
      lastActionMessage: `${activePlayer.name} ${uniqueCells.length} kare fethetti.${elimSuffix} Kalan hak: ${nextRemainingRights}.`,
    },
    success: true,
    error: null,
  };
}

/**
 * Ends the active player's turn, resets unused rights, advances to the next non-eliminated player,
 * increments turnNumber when all active players have completed the round, and checks Turn-Limited victory.
 */
export function endCurrentTurn(state: MatchState): MatchState {
  if (state.status !== 'playing') return state;

  const alivePlayers = state.players.filter((p) => !p.eliminated);
  if (alivePlayers.length <= 1) {
    const winnerIds = alivePlayers.map((p) => p.id);
    return {
      ...state,
      status: 'completed',
      winnerIds,
      isDraw: winnerIds.length !== 1,
      selectedCells: [],
      dice: null,
      remainingRights: 0,
      usedRights: 0,
      validationError: null,
      aiTurnLockId: null,
      updatedAt: Date.now(),
    };
  }

  const completedSet = new Set<string>(state.turnRoundCompletedIds);
  completedSet.add(state.activePlayerId);

  // Check if every currently alive player has completed their turn in this round
  const allAliveCompleted = alivePlayers.every((p) => completedSet.has(p.id));

  let nextTurnNumber = state.turnNumber;
  let nextCompletedIds = Array.from(completedSet);

  if (allAliveCompleted) {
    // If Turn Limited mode and we just finished maxTurns, complete the match!
    if (state.victoryMode === 'turn_limited' && state.turnNumber >= state.maxTurns) {
      let maxTiles = -1;
      for (const p of alivePlayers) {
        if (p.tileCount > maxTiles) maxTiles = p.tileCount;
      }
      const topPlayers = alivePlayers.filter((p) => p.tileCount === maxTiles);
      const isDraw = topPlayers.length > 1;
      const winnerNames = topPlayers.map((p) => p.name).join(' & ');

      return {
        ...state,
        status: 'completed',
        winnerIds: topPlayers.map((p) => p.id),
        isDraw,
        dice: null,
        remainingRights: 0,
        usedRights: 0,
        selectedCells: [],
        validationError: null,
        aiTurnLockId: null,
        updatedAt: Date.now(),
        lastActionMessage: isDraw
          ? `${state.maxTurns} tur tamamlandı! ${winnerNames} (${maxTiles} kare) ile berabere kaldı!`
          : `${state.maxTurns} tur tamamlandı! ${winnerNames} ${maxTiles} kare ile maçı kazandı!`,
      };
    }

    nextTurnNumber = state.turnNumber + 1;
    nextCompletedIds = [];
  }

  // Find next non-eliminated player in turnOrder
  const totalOrder = state.turnOrder.length;
  let nextIndex = state.activeTurnIndex;
  for (let step = 1; step <= totalOrder; step++) {
    const candidateIndex = (state.activeTurnIndex + step) % totalOrder;
    const candidateId = state.turnOrder[candidateIndex];
    const candidatePlayer = state.players.find((p) => p.id === candidateId);
    if (candidatePlayer && !candidatePlayer.eliminated) {
      nextIndex = candidateIndex;
      break;
    }
  }

  const nextPlayerId = state.turnOrder[nextIndex];
  const nextPlayer = state.players.find((p) => p.id === nextPlayerId)!;

  return {
    ...state,
    activeTurnIndex: nextIndex,
    activePlayerId: nextPlayerId,
    turnNumber: nextTurnNumber,
    turnRoundCompletedIds: nextCompletedIds,
    dice: null,
    remainingRights: 0,
    usedRights: 0,
    selectedCells: [],
    validationError: null,
    aiTurnLockId: null,
    updatedAt: Date.now(),
    lastActionMessage: `Sıra ${nextPlayer.name} oyuncusuna geçti (Tur ${nextTurnNumber}).`,
  };
}

/**
 * Generates candidate valid conquest blocks adjacent to the active player's territory
 * that fit within remainingRights (prefers >= 2x2 blocks when remainingRights >= 4,
 * and falls back to valid 1..3 cell compact border moves or bridge crossings).
 */
export function findValidCandidateMoves(
  board: number[],
  boardCols: number,
  activeSlotIndex: number,
  remainingRights: number,
  boardRows: number = board.length > 0 && boardCols > 0 ? Math.round(board.length / boardCols) : boardCols,
  terrain?: TerrainCode[]
): number[][] {
  if (remainingRights < 1) return [];

  // Find all frontier cells (not owned by activeSlotIndex, not an obstacle, orthogonally adjacent to activeSlotIndex)
  const frontierAnchors: { row: number; col: number }[] = [];
  const seenAnchors = new Set<number>();

  for (let i = 0; i < board.length; i++) {
    if (board[i] === activeSlotIndex) {
      for (const nb of getOrthogonalNeighbors(i, boardCols, boardRows)) {
        if (
          board[nb] !== activeSlotIndex &&
          (!terrain || terrain[nb] !== 1) &&
          !seenAnchors.has(nb)
        ) {
          seenAnchors.add(nb);
          frontierAnchors.push(indexToCoord(nb, boardCols));
        }
      }
    }
  }

  if (frontierAnchors.length === 0) return [];

  const candidates: number[][] = [];
  const seenKeys = new Set<string>();

  if (remainingRights >= 4) {
    // Candidate rectangle dimensions (rows x cols) with both >= 2 and area <= remainingRights
    const dims: [number, number][] = [];
    for (let r = 2; r <= 6; r++) {
      for (let c = 2; c <= 6; c++) {
        if (r * c <= remainingRights) {
          dims.push([r, c]);
        }
      }
    }

    for (const anchor of frontierAnchors) {
      for (const [h, w] of dims) {
        const rowOffsets = [0, -(h - 1)];
        const colOffsets = [0, -(w - 1)];
        for (const ro of rowOffsets) {
          for (const co of colOffsets) {
            const r0 = anchor.row + ro;
            const c0 = anchor.col + co;
            if (r0 < 0 || c0 < 0 || r0 + h > boardRows || c0 + w > boardCols) continue;

            const cells: number[] = [];
            let validCells = true;
            for (let dr = 0; dr < h; dr++) {
              for (let dc = 0; dc < w; dc++) {
                const idx = coordToIndex(r0 + dr, c0 + dc, boardCols);
                if (board[idx] === activeSlotIndex || (terrain && terrain[idx] === 1)) {
                  validCells = false;
                  break;
                }
                cells.push(idx);
              }
              if (!validCells) break;
            }

            if (!validCells) continue;
            const key = `${r0},${c0},${h},${w}`;
            if (seenKeys.has(key)) continue;

            const check = validateConquestSelection(
              board,
              boardCols,
              activeSlotIndex,
              cells,
              remainingRights,
              boardRows,
              terrain
            );
            if (check.valid) {
              seenKeys.add(key);
              candidates.push(cells);
            }
          }
        }
      }
    }
  }

  // When remainingRights <= 3 (e.g. 3x1=3, 2x1=2, 1x1=1) or no >=2x2 block fits,
  // generate valid 1..3 cell border expansions (and bridge crossings)
  if (candidates.length === 0) {
    const smallDims: [number, number][] = [
      [1, 3],
      [3, 1],
      [1, 2],
      [2, 1],
      [1, 1],
    ].filter(([h, w]) => h * w <= Math.min(3, remainingRights)) as [number, number][];

    for (const anchor of frontierAnchors) {
      for (const [h, w] of smallDims) {
        const rowOffsets = [0, -(h - 1)];
        const colOffsets = [0, -(w - 1)];
        for (const ro of rowOffsets) {
          for (const co of colOffsets) {
            const r0 = anchor.row + ro;
            const c0 = anchor.col + co;
            if (r0 < 0 || c0 < 0 || r0 + h > boardRows || c0 + w > boardCols) continue;
            const cells: number[] = [];
            let ok = true;
            for (let dr = 0; dr < h; dr++) {
              for (let dc = 0; dc < w; dc++) {
                const idx = coordToIndex(r0 + dr, c0 + dc, boardCols);
                if (board[idx] === activeSlotIndex || (terrain && terrain[idx] === 1)) {
                  ok = false;
                  break;
                }
                cells.push(idx);
              }
              if (!ok) break;
            }
            if (!ok) continue;
            const key = `s:${r0},${c0},${h},${w}`;
            if (seenKeys.has(key)) continue;
            const check = validateConquestSelection(
              board,
              boardCols,
              activeSlotIndex,
              cells,
              remainingRights,
              boardRows,
              terrain
            );
            if (check.valid) {
              seenKeys.add(key);
              candidates.push(cells);
            }
          }
        }
      }
    }
  }

  return candidates;
}

export interface AITurnPlan {
  rolledState: MatchState;
  moveSteps: {
    previewCells: number[];
    afterMoveState: MatchState;
  }[];
  finalState: MatchState;
}

/**
 * Plans the AI's dice roll and sequence of valid conquest moves so the UI can animate
 * the AI rolling dice and highlighting/conquering each move step-by-step.
 */
export function planAITurnSteps(
  initialState: MatchState,
  rng: () => number = Math.random
): AITurnPlan {
  let state = initialState;
  if (state.status !== 'playing') {
    return { rolledState: state, moveSteps: [], finalState: state };
  }

  const aiPlayer = state.players.find((p) => p.id === state.activePlayerId);
  if (!aiPlayer || !aiPlayer.isAI || aiPlayer.eliminated) {
    return { rolledState: state, moveSteps: [], finalState: state };
  }

  // Step 1: Roll dice if not already rolled
  if (!state.dice) {
    state = rollDiceForActivePlayer(state, undefined, undefined, rng);
  }
  const rolledState = state;
  const moveSteps: { previewCells: number[]; afterMoveState: MatchState }[] = [];

  const boardCols = state.boardCols || state.boardSize;
  const boardRows = state.boardRows || state.boardSize;

  let safetyCounter = 0;
  while (state.status === 'playing' && state.remainingRights >= 1 && safetyCounter < 6) {
    safetyCounter++;
    const candidates = findValidCandidateMoves(
      state.board,
      boardCols,
      aiPlayer.slotIndex,
      state.remainingRights,
      boardRows,
      state.terrain
    );

    if (candidates.length === 0) break;

    const chosenMove = pickCandidateByDifficulty(
      candidates,
      state,
      aiPlayer.slotIndex,
      aiPlayer.aiDifficulty,
      rng
    );

    const result = applyConquestMove(state, chosenMove);
    if (!result.success) break;
    state = result.state;
    moveSteps.push({
      previewCells: chosenMove,
      afterMoveState: state,
    });

    // Kolay AI sometimes stops after 1 move even if rights remain
    if (aiPlayer.aiDifficulty === 'kolay' && safetyCounter >= 1 && rng() < 0.45) {
      break;
    }
  }

  return {
    rolledState,
    moveSteps,
    finalState: state,
  };
}

/**
 * AI Decision Engine: evaluates candidate valid moves according to AI difficulty
 * and returns the state after all AI moves in the current turn.
 */
export function executeAITurnMoves(
  initialState: MatchState,
  rng: () => number = Math.random
): MatchState {
  return planAITurnSteps(initialState, rng).finalState;
}

function pickCandidateByDifficulty(
  candidates: number[][],
  state: MatchState,
  aiSlotIndex: number,
  difficulty: AIDifficulty,
  rng: () => number
): number[] {
  if (difficulty === 'kolay') {
    const idx = Math.floor(rng() * candidates.length);
    return candidates[idx];
  }

  const boardCols = state.boardCols || state.boardSize;
  const boardRows = state.boardRows || state.boardSize;
  const centerRow = (boardRows - 1) / 2;
  const centerCol = (boardCols - 1) / 2;
  const maxDim = Math.max(boardCols, boardRows);

  // Count tiles per opponent to spot elimination opportunities
  const opponentTileCounts = new Map<number, number>();
  for (const p of state.players) {
    if (p.slotIndex !== aiSlotIndex && !p.eliminated) {
      opponentTileCounts.set(p.slotIndex, p.tileCount);
    }
  }

  let bestCandidate = candidates[0];
  let bestScore = -Infinity;

  for (const cells of candidates) {
    let enemyTilesCaptured = 0;
    let bridgeBonus = 0;
    const capturedByOpponent = new Map<number, number>();
    let centerProximity = 0;

    for (const idx of cells) {
      const owner = state.board[idx];
      if (owner > 0 && owner !== aiSlotIndex) {
        enemyTilesCaptured++;
        capturedByOpponent.set(owner, (capturedByOpponent.get(owner) || 0) + 1);
      }
      if (state.terrain && state.terrain[idx] === 2) {
        bridgeBonus += 14; // Encourage capturing strategic bridges
      }
      const { row, col } = indexToCoord(idx, boardCols);
      const dist = Math.hypot(row - centerRow, col - centerCol);
      centerProximity += Math.max(0, maxDim - dist);
    }

    let eliminationBonus = 0;
    for (const [oppSlot, taken] of capturedByOpponent.entries()) {
      const oppTotal = opponentTileCounts.get(oppSlot) || 999;
      if (taken >= oppTotal) {
        eliminationBonus += 500; // Direct elimination opportunity!
      } else if (oppTotal <= 12) {
        eliminationBonus += taken * 12;
      }
    }

    // Check if remainder after this move is >= 4 (allows another valid 2x2 move!)
    const remainder = state.remainingRights - cells.length;
    const remainderBonus = remainder === 0 ? 18 : remainder >= 4 ? 10 : -4;

    let score = 0;
    if (difficulty === 'orta') {
      score = cells.length * 4 + enemyTilesCaptured * 5 + bridgeBonus * 0.5 + (rng() * 6 - 3);
    } else if (difficulty === 'zor') {
      score =
        cells.length * 6 +
        enemyTilesCaptured * 12 +
        bridgeBonus +
        remainderBonus +
        centerProximity * 0.15 +
        (rng() * 3 - 1.5);
    } else {
      // 'uzman'
      score =
        cells.length * 8 +
        enemyTilesCaptured * 18 +
        bridgeBonus * 1.3 +
        eliminationBonus +
        remainderBonus * 1.5 +
        centerProximity * 0.25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cells;
    }
  }

  return bestCandidate;
}

export function getAIThinkingDelayMs(difficulty: AIDifficulty): number {
  switch (difficulty) {
    case 'kolay':
      return 500;
    case 'orta':
      return 800;
    case 'zor':
      return 1200;
    case 'uzman':
      return 1500;
  }
}

export function buildMatchSummary(state: MatchState): MatchSummary {
  const sorted = [...state.players].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (b.tileCount !== a.tileCount) return b.tileCount - a.tileCount;
    return b.conqueredCount - a.conqueredCount;
  });

  return {
    matchId: state.matchId,
    completedAt: Date.now(),
    gameMode: state.gameMode,
    victoryMode: state.victoryMode,
    boardSize: state.boardSize,
    boardCols: state.boardCols || state.boardSize,
    boardRows: state.boardRows || state.boardSize,
    mapMode: state.mapMode || 'classic',
    turnCount: state.turnNumber,
    winnerIds: [...state.winnerIds],
    isDraw: state.isDraw,
    standings: sorted.map((p, i) => ({
      playerId: p.id,
      profileId: p.profileId,
      name: p.name,
      colorKey: p.colorKey,
      isAI: p.isAI,
      tileCount: p.tileCount,
      conqueredCount: p.conqueredCount,
      eliminated: p.eliminated,
      rank: i + 1,
    })),
  };
}

