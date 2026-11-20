import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../public/history.js';

test('undo / redo walk the snapshots', () => {
  const h = createHistory('a');
  h.push('b'); h.push('c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), 'a');
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), 'b');
  assert.equal(h.redo(), 'c');
  assert.equal(h.redo(), null);
});

test('pushing after undo drops the redo branch; duplicates are ignored', () => {
  const h = createHistory('a');
  h.push('b'); h.undo();
  assert.equal(h.push('a'), false);
  assert.equal(h.canRedo(), true);
  assert.equal(h.push('x'), true);
  assert.equal(h.canRedo(), false);
  assert.equal(h.undo(), 'a');
});

test('history is capped', () => {
  const h = createHistory('0', 3);
  for (let i = 1; i <= 5; i++) h.push(String(i));
  assert.equal(h.undo(), '4');
  assert.equal(h.undo(), '3');
  assert.equal(h.undo(), null);
});
