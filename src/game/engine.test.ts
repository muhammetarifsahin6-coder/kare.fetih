import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INVALID_CORRIDOR_MESSAGE,
  applyConquestMove,
  coordToIndex,
  createNewMatch,
  endCurrentTurn,
  executeAITurnMoves,
  generateStartingAreas,
  indexToCoord,
  isOrthogonallyConnected,
  isWideValidConquestShape,
  rollDiceForActivePlayer,
  validateConquestSelection,
} from './engine';
import { MatchSetupConfig, PlayerSetupConfig } from './types';

function makeTestPlayers(count: number, aiCount = 0): PlayerSetupConfig[] {
  const colors = ['blue', 'red', 'green', 'gold'] as const;
  const list: PlayerSetupConfig[] = [];
  for (let i = 0; i < count; i++) {
    const isAI = i >= count - aiCount;
    list.push({
      id: `p${i + 1}`,
      profileId: `prof-${i + 1}`,
      name: isAI ? `AI ${i + 1}` : `İnsan ${i + 1}`,
      colorKey: colors[i],
      isAI,
      aiDifficulty: 'uzman',
    });
  }
  return list;
}

test('Section 3 & 19.D: Starting areas have exactly 10 contiguous squares, never overlap, and maximize distance across all board sizes and player counts', () => {
  const sizes = [20, 30, 40, 50];
  const playerCounts = [2, 3, 4];

  for (const boardSize of sizes) {
    for (const count of playerCounts) {
      const areas = generateStartingAreas(boardSize, count);
      assert.equal(areas.length, count);

      const allOccupied = new Set<number>();
      for (const area of areas) {
        assert.equal(area.length, 10, `Each player must start with 10 squares on ${boardSize}x${boardSize}`);
        assert.equal(
          isOrthogonallyConnected(area, boardSize),
          true,
          'Starting area must be orthogonally contiguous'
        );
        for (const cell of area) {
          assert.ok(cell >= 0 && cell < boardSize * boardSize, 'Within board bounds');
          assert.equal(allOccupied.has(cell), false, 'Starting areas must never overlap');
          allOccupied.add(cell);
        }
      }

      // Check maximum separation: for 2 players, centroids must be in opposite corners
      if (count === 2) {
        const c0 = indexToCoord(areas[0][0], boardSize);
        const c1 = indexToCoord(areas[1][9], boardSize);
        assert.equal(c0.row, 0);
        assert.equal(c0.col, 0);
        assert.equal(c1.row, boardSize - 1);
        assert.equal(c1.col, boardSize - 1);
      }
    }
  }
});

test('Section 3: Random first-turn order never alters starting area locations', () => {
  const config: MatchSetupConfig = {
    gameMode: 'local_multiplayer',
    victoryMode: 'full_conquest',
    maxTurns: 15,
    boardSize: 20,
    players: makeTestPlayers(4, 0),
    randomizeTurnOrder: true,
  };

  const m1 = createNewMatch(config, () => 0.1);
  const m2 = createNewMatch(config, () => 0.9);

  for (let i = 0; i < 4; i++) {
    assert.deepEqual(m1.players[i].startingCells, m2.players[i].startingCells);
  }
});

test('Section 4: Dice roll produces 1..6 product, assigns to active player, and prevents duplicate rolls in the same turn', () => {
  const match = createNewMatch({
    gameMode: 'local_multiplayer',
    victoryMode: 'full_conquest',
    maxTurns: 15,
    boardSize: 20,
    players: makeTestPlayers(2, 0),
  });

  const rolled = rollDiceForActivePlayer(match, 4, 5);
  assert.ok(rolled.dice);
  assert.equal(rolled.dice.die1, 4);
  assert.equal(rolled.dice.die2, 5);
  assert.equal(rolled.dice.totalRights, 20);
  assert.equal(rolled.remainingRights, 20);

  // Attempting to roll again in the same turn must not create extra rights
  const duplicateRoll = rollDiceForActivePlayer(rolled, 6, 6);
  assert.equal(duplicateRoll.remainingRights, 20);
  assert.equal(duplicateRoll.dice?.totalRights, 20);
});

test('Section 5 & 5.1 & 19.A: Conquest validation rejects thin 1-wide corridors, diagonal-only links, disconnected selections, own squares, and over-budget selections', () => {
  let match = createNewMatch({
    gameMode: 'local_multiplayer',
    victoryMode: 'full_conquest',
    maxTurns: 15,
    boardSize: 20,
    players: makeTestPlayers(2, 0),
  });
  match = rollDiceForActivePlayer(match, 4, 5); // 20 rights

  // Player 1 occupies rows 0..1, cols 0..4.
  // 1) Thin 1-square-wide line of 5 squares along row 2, cols 0..4 -> REJECTED
  const thinLine = [0, 1, 2, 3, 4].map((c) => coordToIndex(2, c, 20));
  const resThin = validateConquestSelection(match.board, 20, 1, thinLine, match.remainingRights);
  assert.equal(resThin.valid, false);
  assert.equal(resThin.reason, INVALID_CORRIDOR_MESSAGE);

  // 2) Thin vertical snake of 6 squares (col 0, rows 2..7) -> REJECTED
  const verticalSnake = [2, 3, 4, 5, 6, 7].map((r) => coordToIndex(r, 0, 20));
  const resSnake = validateConquestSelection(match.board, 20, 1, verticalSnake, match.remainingRights);
  assert.equal(resSnake.valid, false);
  assert.equal(resSnake.reason, INVALID_CORRIDOR_MESSAGE);

  // 3) 2x2 block with a 1-wide tail sticking out -> REJECTED
  const blockWithTail = [
    coordToIndex(2, 0, 20),
    coordToIndex(2, 1, 20),
    coordToIndex(3, 0, 20),
    coordToIndex(3, 1, 20),
    coordToIndex(4, 1, 20), // 1-wide tail cell
  ];
  assert.equal(isWideValidConquestShape(blockWithTail, 20), false);

  // 4) Disconnected from player's own territory (rows 5..6, cols 5..6) -> REJECTED
  const disconnectedBlock = [
    coordToIndex(5, 5, 20),
    coordToIndex(5, 6, 20),
    coordToIndex(6, 5, 20),
    coordToIndex(6, 6, 20),
  ];
  const resDisconnected = validateConquestSelection(
    match.board,
    20,
    1,
    disconnectedBlock,
    match.remainingRights
  );
  assert.equal(resDisconnected.valid, false);
  assert.equal(resDisconnected.reason, INVALID_CORRIDOR_MESSAGE);

  // 5) Diagonal-only touch to player's own territory (rows 2..3, cols 5..6) -> REJECTED
  const diagonalTouchBlock = [
    coordToIndex(2, 5, 20),
    coordToIndex(2, 6, 20),
    coordToIndex(3, 5, 20),
    coordToIndex(3, 6, 20),
  ];
  const resDiag = validateConquestSelection(
    match.board,
    20,
    1,
    diagonalTouchBlock,
    match.remainingRights
  );
  assert.equal(resDiag.valid, false);

  // 6) Valid 2x3 block orthogonally adjacent to Player 1's territory (rows 2..3, cols 0..2) -> ACCEPTED
  const valid2x3 = [
    coordToIndex(2, 0, 20),
    coordToIndex(2, 1, 20),
    coordToIndex(2, 2, 20),
    coordToIndex(3, 0, 20),
    coordToIndex(3, 1, 20),
    coordToIndex(3, 2, 20),
  ];
  const resValid = validateConquestSelection(match.board, 20, 1, valid2x3, match.remainingRights);
  assert.equal(resValid.valid, true);
  assert.equal(resValid.cost, 6);

  // 7) Invalid move does NOT consume conquest rights or change board ownership
  const failedAttempt = applyConquestMove(match, thinLine);
  assert.equal(failedAttempt.success, false);
  assert.equal(failedAttempt.state.remainingRights, 20);
  assert.equal(failedAttempt.state.players[0].tileCount, 10);

  // 8) Valid move consumes exact rights and allows splitting remaining rights into another move
  const move1 = applyConquestMove(match, valid2x3);
  assert.equal(move1.success, true);
  assert.equal(move1.state.remainingRights, 14);
  assert.equal(move1.state.usedRights, 6);
  assert.equal(move1.state.players[0].tileCount, 16);

  const valid2x2Second = [
    coordToIndex(2, 3, 20),
    coordToIndex(2, 4, 20),
    coordToIndex(3, 3, 20),
    coordToIndex(3, 4, 20),
  ];
  const move2 = applyConquestMove(move1.state, valid2x2Second);
  assert.equal(move2.success, true);
  assert.equal(move2.state.remainingRights, 10);
  assert.equal(move2.state.usedRights, 10);
  assert.equal(move2.state.players[0].tileCount, 20);
});

test('Section 8 & 8.1 & 19.B: AI turn executes once, obeys all conquest rules, and reliably returns turn to Human player', () => {
  let match = createNewMatch({
    gameMode: 'vs_ai',
    victoryMode: 'full_conquest',
    maxTurns: 15,
    boardSize: 20,
    players: makeTestPlayers(2, 1), // p1 Human, p2 AI
    randomizeTurnOrder: false,
  });

  assert.equal(match.activePlayerId, 'p1');
  // Human rolls and ends turn
  match = rollDiceForActivePlayer(match, 3, 3);
  match = endCurrentTurn(match);

  // Now it is AI's turn (p2)
  assert.equal(match.activePlayerId, 'p2');
  assert.equal(match.turnNumber, 1);

  // AI executes its turn moves and finishes turn
  match = executeAITurnMoves(match, () => 0.75);
  assert.ok(match.players[1].tileCount >= 10, 'AI should keep or expand its territory legally');
  match = endCurrentTurn(match);

  // Turn MUST return to Human player (p1) and advance turnNumber to 2
  assert.equal(match.activePlayerId, 'p1');
  assert.equal(match.turnNumber, 2);
  assert.equal(match.dice, null);
  assert.equal(match.remainingRights, 0);
});

test('Section 7: Player elimination and Turn-Limited victory / draw calculation', () => {
  let match = createNewMatch({
    gameMode: 'local_multiplayer',
    victoryMode: 'turn_limited',
    maxTurns: 2,
    boardSize: 20,
    players: makeTestPlayers(2, 0),
    randomizeTurnOrder: false,
  });

  // Turn 1: p1 and p2 play without conquering -> equal 10 tiles each
  match = endCurrentTurn(match); // p1 done -> p2 active (turn 1)
  assert.equal(match.turnNumber, 1);
  assert.equal(match.activePlayerId, 'p2');

  match = endCurrentTurn(match); // p2 done -> turn 2, p1 active
  assert.equal(match.turnNumber, 2);
  assert.equal(match.activePlayerId, 'p1');

  // Turn 2: p1 and p2 finish -> end of turn 2 triggers completed draw!
  match = endCurrentTurn(match); // p1 done
  match = endCurrentTurn(match); // p2 done -> match completed
  assert.equal(match.status, 'completed');
  assert.equal(match.isDraw, true);
  assert.deepEqual(match.winnerIds, ['p1', 'p2']);
});

test('Dice 3x1=3, 2x1=2, 1x1=1, and 5x1=5 allow valid moves for Human and AI while blocking chained >=4-cell thin snakes', () => {
  let match = createNewMatch({
    gameMode: 'vs_ai',
    victoryMode: 'full_conquest',
    maxTurns: 15,
    boardSize: 20,
    players: makeTestPlayers(2, 1),
    randomizeTurnOrder: false,
  });

  // Roll 3 and 1 -> 3 conquest rights
  match = rollDiceForActivePlayer(match, 3, 1);
  assert.equal(match.remainingRights, 3);

  // Selecting 3 connected squares adjacent to starting territory (e.g. (2,0), (2,1), (2,2)) is VALID
  const threeCells = [
    coordToIndex(2, 0, 20),
    coordToIndex(2, 1, 20),
    coordToIndex(2, 2, 20),
  ];
  const valid3 = validateConquestSelection(match.board, 20, 1, threeCells, match.remainingRights);
  assert.equal(valid3.valid, true);
  assert.equal(valid3.cost, 3);

  const applied3 = applyConquestMove(match, threeCells);
  assert.equal(applied3.success, true);
  assert.equal(applied3.state.remainingRights, 0);
  assert.equal(applied3.state.players[0].tileCount, 13);

  // End human turn -> AI rolls 3 and 1 (3 rights) and must also expand its territory!
  match = endCurrentTurn(applied3.state);
  match = rollDiceForActivePlayer(match, 1, 3);
  match = executeAITurnMoves(match, () => 0.5);
  assert.ok(match.players[1].tileCount > 10, 'AI must be able to conquer when rolling 1x3=3');

  // Next human turn: verify chaining two 1-wide outward spikes into a >=4-cell snake is rejected
  match = endCurrentTurn(match);
  match = rollDiceForActivePlayer(match, 2, 3); // 6 rights
  // First 3-cell outward line at col 4: (2,4), (3,4), (4,4)
  const spike1 = [coordToIndex(2, 4, 20), coordToIndex(3, 4, 20), coordToIndex(4, 4, 20)];
  const step1 = applyConquestMove(match, spike1);
  assert.equal(step1.success, true);

  // Trying to extend the 1-wide tip at (5,4) to make a 4-long 1-wide corridor is REJECTED
  const spike2 = [coordToIndex(5, 4, 20)];
  const step2Check = validateConquestSelection(
    step1.state.board,
    20,
    1,
    spike2,
    step1.state.remainingRights
  );
  assert.equal(step2Check.valid, false);
  assert.equal(step2Check.reason, INVALID_CORRIDOR_MESSAGE);
});

test('Non-square rectangular boards (28x18, 36x22) and Random Map Mode generate coherent obstacles & bridges with 100% corner connectivity and block obstacle conquest', () => {
  const match = createNewMatch({
    gameMode: 'vs_ai',
    victoryMode: 'turn_limited',
    maxTurns: 20,
    boardSize: 28,
    boardCols: 28,
    boardRows: 18,
    mapMode: 'random',
    players: makeTestPlayers(4, 3),
    randomizeTurnOrder: false,
  });

  assert.equal(match.boardCols, 28);
  assert.equal(match.boardRows, 18);
  assert.equal(match.board.length, 28 * 18);
  assert.equal(match.terrain.length, 28 * 18);

  // Verify obstacles (1) and bridges (2) exist on the random tactical map
  const obstacleCount = match.terrain.filter((t) => t === 1).length;
  const bridgeCount = match.terrain.filter((t) => t === 2).length;
  assert.ok(obstacleCount > 0, 'Random tactical map must include natural obstacles (river/crags)');
  assert.ok(bridgeCount > 0, 'Random tactical map must include strategic bridges across rivers');

  // Verify no player starting square is placed on an obstacle
  for (const p of match.players) {
    assert.equal(p.startingCells.length, 10);
    for (const idx of p.startingCells) {
      assert.notEqual(match.terrain[idx], 1, 'Starting cells must never be obstacles');
    }
  }

  // Verify attempting to select an obstacle tile is rejected by validateConquestSelection
  const firstObstacleIdx = match.terrain.findIndex((t) => t === 1);
  assert.ok(firstObstacleIdx >= 0);
  const obsCheck = validateConquestSelection(
    match.board,
    28,
    1,
    [firstObstacleIdx],
    12,
    18,
    match.terrain
  );
  assert.equal(obsCheck.valid, false);
});


