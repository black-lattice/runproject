import test from 'node:test';
import assert from 'node:assert/strict';
import { trayProjects } from '../src/utils/trayProjects.js';

const project = { name: 'RunProject', path: '/projects/runproject', commands: [
  { name: 'dev', script: 'vite' }, { name: 'build', script: 'vite build' },
] };

test('only command-level tags qualify commands for quick launch', () => {
  const result = trayProjects({ workspaces: [{ projects: [project] }],
    projectTags: { [project.path]: ['常用'] },
    commandTags: { [`${project.path}::dev`]: [' 开发 ', '', '开发'] },
  });
  assert.deepEqual(result[0].commands, [{ ...project.commands[0], tags: ['开发'] }]);
});

test('projects without tagged commands remain visible and duplicate paths appear once', () => {
  const result = trayProjects({ workspaces: [{ projects: [project] }, { projects: [project] }], commandTags: {} });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].commands, []);
});

test('same command names in different projects have independent tags', () => {
  const other = { ...project, path: '/projects/other' };
  const result = trayProjects({ workspaces: [{ projects: [project, other] }],
    commandTags: { [`${other.path}::dev`]: ['调试'], [`${project.path}::deleted`]: ['过期'] },
  });
  assert.equal(result[0].commands.length, 0);
  assert.equal(result[1].commands[0].name, 'dev');
});

test('empty and malformed tags cannot expose untagged commands', () => {
  assert.deepEqual(trayProjects(null), []);
  const result = trayProjects({ workspaces: [{ projects: [project] }],
    commandTags: { [`${project.path}::dev`]: '开发', [`${project.path}::build`]: [null, ' '] },
  });
  assert.equal(result[0].commands.length, 0);
});

test('usage ranks projects by total count then recency, and commands within each project', () => {
  const second = { ...project, path: '/projects/second' };
  const third = { ...project, path: '/projects/third' };
  const data = { workspaces: [{ projects: [project, second, third] }], commandTags: {
    [`${project.path}::dev`]: ['开发'], [`${project.path}::build`]: ['构建'],
  }, commandUsage: [
    { projectPath: project.path, commandName: 'dev', count: 1, lastStartedAt: 900 },
    { projectPath: project.path, commandName: 'build', count: 4, lastStartedAt: 100 },
    { projectPath: second.path, commandName: 'dev', count: 6, lastStartedAt: 200 },
    { projectPath: third.path, commandName: 'dev', count: 6, lastStartedAt: 300 },
  ] };
  const result = trayProjects(data);
  assert.deepEqual(result.map(item => item.path), [third.path, second.path, project.path]);
  assert.deepEqual(result[2].commands.map(item => item.name), ['build', 'dev']);
  assert.deepEqual(data.workspaces[0].projects.map(item => item.path), [project.path, second.path, third.path]);
});

test('equal usage keeps original order; ties between commands use their last launch', () => {
  const result = trayProjects({ workspaces: [{ projects: [project] }], commandTags: {
    [`${project.path}::dev`]: ['开发'], [`${project.path}::build`]: ['构建'],
  }, commandUsage: [
    { projectPath: project.path, commandName: 'dev', count: 2, lastStartedAt: 100 },
    { projectPath: project.path, commandName: 'build', count: 2, lastStartedAt: 200 },
  ] });
  assert.deepEqual(result[0].commands.map(item => item.name), ['build', 'dev']);
  const other = { ...project, path: '/projects/other' };
  assert.deepEqual(trayProjects({workspaces: [{projects: [project, other]}]}).map(item => item.path), [project.path, other.path]);
});
