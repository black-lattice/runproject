import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodoEnterGuard, createTrayTodo } from '../src/utils/trayTodoInput.js';

const enter = { key: 'Enter' };
test('composition Enter and its trailing confirmation cannot submit', () => {
  const guard = createTodoEnterGuard();
  guard.compositionStart();
  assert.equal(guard.shouldSubmit(enter, 100), false);
  guard.compositionEnd(200);
  assert.equal(guard.shouldSubmit(enter, 200), false);
  assert.equal(guard.shouldSubmit(enter, 349), false);
  assert.equal(guard.shouldSubmit(enter, 350), true);
});
test('WebKit 229, native composing, held Enter and modified Enter are ignored', () => {
  const guard = createTodoEnterGuard();
  for (const event of [
    { ...enter, nativeEvent: { keyCode: 229, isComposing: false } },
    { ...enter, nativeEvent: { isComposing: true } },
    { ...enter, repeat: true },
    ...['shiftKey', 'ctrlKey', 'metaKey', 'altKey'].map(key => ({ ...enter, [key]: true })),
    { key: 'Escape' },
  ]) assert.equal(guard.shouldSubmit(event, 1000), false);
  assert.equal(guard.shouldSubmit(enter, 1000), true);
});
test('composition can restart and only a settled Enter adds the final Chinese title', () => {
  const guard = createTodoEnterGuard();
  guard.compositionEnd(100);
  guard.compositionStart();
  assert.equal(guard.shouldSubmit(enter, 1000), false);
  guard.compositionEnd(1100);
  assert.equal(guard.shouldSubmit(enter, 1250), true);
  const task = createTrayTodo('  整理项目发布清单  ', 2000);
  assert.equal(task.title, '整理项目发布清单');
  assert.equal(task.createdAt, 2000);
  assert.equal(task.status, 'pending');
  assert.equal(task.done, false);
});
test('blank titles are skipped and byte limit matches task editing', () => {
  assert.equal(createTrayTodo('   '), null);
  assert.throws(() => createTrayTodo('待'.repeat(334)), /1000/);
  assert.equal(createTrayTodo('待'.repeat(333)).title.length, 333);
});
