import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConquestMove,
  coordToIndex,
  createNewMatch,
  endCurrentTurn,
  rollDiceForActivePlayer,
} from './engine';
import {
  clearActiveMatchSave,
  hasActiveMatchSave,
  loadActiveMatch,
  loadProfiles,
  recordCompletedMatchOnce,
  saveActiveMatch,
  updateProfileIdentity,
} from './storage';

test('Section 14 & 19.G: Save, Resume, Partial Conquest Rights, and End Match behavior', () => {
  clearActiveMatchSave();
  assert.equal(hasActiveMatchSave(), false);

  let match = createNewMatch({
    gameMode: 'vs_ai',
    victoryMode: 'full_conquest',
    maxTurns: 15,
    boardSize: 20,
    players: [
      {
        id: 'p1',
        profileId: 'prof-human-1',
        name: 'Hakan',
        colorKey: 'blue',
        isAI: false,
        aiDifficulty: 'orta',
      },
      {
        id: 'p2',
        profileId: 'ai-1',
        name: 'AI Komutan',
        colorKey: 'red',
        isAI: true,
        aiDifficulty: 'orta',
      },
    ],
    randomizeTurnOrder: false,
  });

  // Roll dice (3 x 4 = 12 rights) and spend 4 rights on a 2x2 block
  match = rollDiceForActivePlayer(match, 3, 4);
  const block2x2 = [
    coordToIndex(2, 0, 20),
    coordToIndex(2, 1, 20),
    coordToIndex(3, 0, 20),
    coordToIndex(3, 1, 20),
  ];
  const afterMove = applyConquestMove(match, block2x2);
  assert.equal(afterMove.success, true);
  match = afterMove.state;
  assert.equal(match.remainingRights, 8);
  assert.equal(match.usedRights, 4);

  // Save match
  const saveRes = saveActiveMatch(match);
  assert.equal(saveRes.success, true);
  assert.equal(hasActiveMatchSave(), true);

  // Restore match
  const restored = loadActiveMatch();
  assert.ok(restored);
  assert.equal(restored.matchId, match.matchId);
  assert.equal(restored.activePlayerId, 'p1');
  assert.equal(restored.remainingRights, 8);
  assert.equal(restored.usedRights, 4);
  assert.equal(restored.dice?.totalRights, 12);
  assert.deepEqual(restored.board, match.board);
  assert.deepEqual(restored.players[0].startingCells, match.players[0].startingCells);

  // Ending match without saving clears ONLY the active match save, preserving profiles
  clearActiveMatchSave();
  assert.equal(hasActiveMatchSave(), false);
  assert.ok(loadProfiles().length >= 4);
});

test('Section 15 & 19.G: Completed match updates statistics strictly once and renaming profile preserves stats', () => {
  let match = createNewMatch({
    gameMode: 'local_multiplayer',
    victoryMode: 'turn_limited',
    maxTurns: 1,
    boardSize: 20,
    players: [
      {
        id: 'p1',
        profileId: 'prof-human-1',
        name: 'Hakan',
        colorKey: 'blue',
        isAI: false,
        aiDifficulty: 'orta',
      },
      {
        id: 'p2',
        profileId: 'prof-human-2',
        name: 'Ayşe',
        colorKey: 'red',
        isAI: false,
        aiDifficulty: 'orta',
      },
    ],
    randomizeTurnOrder: false,
  });

  // p1 conquers 4 tiles in turn 1
  match = rollDiceForActivePlayer(match, 2, 3);
  const block2x2 = [
    coordToIndex(2, 0, 20),
    coordToIndex(2, 1, 20),
    coordToIndex(3, 0, 20),
    coordToIndex(3, 1, 20),
  ];
  match = applyConquestMove(match, block2x2).state;
  match = endCurrentTurn(match); // p1 done -> p2 active
  match = endCurrentTurn(match); // p2 done -> match completed!

  assert.equal(match.status, 'completed');
  assert.deepEqual(match.winnerIds, ['p1']);

  const firstRecord = recordCompletedMatchOnce(match);
  assert.equal(firstRecord.alreadyRecorded, false);
  const p1Profile = firstRecord.profiles.find((p) => p.profileId === 'prof-human-1')!;
  const winsAfterFirst = p1Profile.wins;
  assert.equal(winsAfterFirst >= 1, true);
  assert.equal(p1Profile.totalConqueredTiles >= 4, true);

  // Calling recordCompletedMatchOnce a second time for the same match MUST NOT increment stats again
  const secondRecord = recordCompletedMatchOnce(match);
  assert.equal(secondRecord.alreadyRecorded, true);
  const p1ProfileAgain = secondRecord.profiles.find((p) => p.profileId === 'prof-human-1')!;
  assert.equal(p1ProfileAgain.wins, winsAfterFirst);

  // Renaming profile preserves all stats
  const renamedProfiles = updateProfileIdentity('prof-human-1', 'Sultan Hakan', 'gold');
  const renamed = renamedProfiles.find((p) => p.profileId === 'prof-human-1')!;
  assert.equal(renamed.name, 'Sultan Hakan');
  assert.equal(renamed.wins, winsAfterFirst);
});
