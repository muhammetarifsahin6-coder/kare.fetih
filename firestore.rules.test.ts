import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesText = fs.readFileSync('firestore.rules', 'utf8');

test('Firestore rules enforce default deny and verified owner checks', () => {
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
});

test('Firestore rules enforce strict schema validation and terminal state locking', () => {
  assert.ok(rulesText.includes('isValidProfile(incoming())'));
  assert.ok(rulesText.includes('isValidSavedMatch(incoming())'));
  assert.ok(rulesText.includes("existing().status != 'completed'"));
  assert.ok(rulesText.includes('affectedKeys().hasOnly'));
});
