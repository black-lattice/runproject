import test from 'node:test';
import assert from 'node:assert/strict';
import { trayTodos, toggleTrayTodo } from '../src/utils/trayTodos.js';

test('checking places the newly completed item after pending and before completed', () => {
  const tasks = [{ id: 'a', done: false }, { id: 'b', done: false }, { id: 'c', done: true, completedAt: 50 }];
  const updated = toggleTrayTodo(tasks, 'a', 100);
  assert.deepEqual(trayTodos(updated, 100).map(task => task.id), ['b', 'a', 'c']);
  assert.equal(updated[0].status, 'done');
  assert.equal(tasks[0].done, false);
});
test('unchecking restores pending status and removes completion metadata', () => {
  const tasks = [{ id: 'a', done: true, status: 'done', completedAt: 50 }];
  const updated = toggleTrayTodo(tasks, 'a');
  assert.equal(updated[0].done, false);
  assert.equal(updated[0].status, 'pending');
  assert.equal('completedAt' in updated[0], false);
});
test('rapid completions still put the latest checked item first in completed', () => {
  let tasks = [{ id: 'a' }, { id: 'b' }, { id: 'pending' }];
  tasks = toggleTrayTodo(tasks, 'a', 100);
  tasks = toggleTrayTodo(tasks, 'b', 100);
  assert.deepEqual(trayTodos(tasks, 100).map(task => task.id), ['pending', 'b', 'a']);
});
test('deleted and abandoned items stay excluded; legacy done status is supported', () => {
  const tasks = [{ id: 'a', deleted: true }, { id: 'b', status: 'abandoned' }, { id: 'c', status: 'done', completedAt: Date.now() }, { id: 'd' }];
  assert.deepEqual(trayTodos(tasks).map(task => task.id), ['d', 'c']);
  assert.equal(toggleTrayTodo(tasks, 'a')[0], tasks[0]);
});


test('only local-today completions appear; pending tasks keep their dates unrestricted', () => {
  const today = new Date(2026, 8, 23, 0, 0, 0).getTime();
  const tomorrow = new Date(2026, 8, 24, 0, 0, 0).getTime();
  const tasks = [
    { id: 'pending', date: '2026-09-01' },
    { id: 'yesterday', done: true, completedAt: today - 1 },
    { id: 'midnight', done: true, completedAt: today },
    { id: 'last-millisecond', done: true, completedAt: tomorrow - 1 },
    { id: 'future', done: true, completedAt: tomorrow },
    { id: 'unknown', done: true },
    { id: 'invalid', done: true, completedAt: 'invalid' },
  ];
  assert.deepEqual(trayTodos(tasks, today).map(task => task.id), ['pending', 'last-millisecond', 'midnight']);
  assert.deepEqual(trayTodos(tasks, tomorrow).map(task => task.id), ['pending', 'future']);
});

test('main-page completion activity supplies the date for older task records', () => {
  const today = new Date(2026, 8, 23, 12).getTime();
  const tasks = [{ id: 'main', done: true, activity: [{ message: '状态改为已完成', at: today }] },
    { id: 'edited', done: true, activity: [{ message: '修改标题', at: today }] }];
  assert.deepEqual(trayTodos(tasks, today).map(task => task.id), ['main']);
});
