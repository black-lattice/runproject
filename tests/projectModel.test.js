import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProject, projectPreference} from '../src/utils/projectModel.js';

test('native and plain directory projects never acquire npm or a Node version',()=>{
  for(const projectType of ['swift','rust','directory']) {
    const project=normalizeProject({name:'MouseGesture',path:'/projects/MouseGesture',projectType,nodeVersion:'22',packageManager:''});
    assert.equal(project.packageManager,'');assert.equal(project.nodeVersion,null);
  }
  assert.equal(normalizeProject({name:'legacy'}).packageManager,'npm');
  assert.equal(normalizeProject({name:'FastTab-React',projectType:'node',packageManager:'pnpm'}).packageManager,'pnpm');
});
test('folder display names retain existing package-based editor and Node preferences',()=>{
  const project={name:'FastTab-React',packageName:'fasttab-react',path:'/projects/FastTab-React'};
  const old={nodeVersion:'22',editor:'cursor'};
  const preferences={'fasttab-react_/projects/FastTab-React':old};
  assert.deepEqual(projectPreference(project,preferences),old);
  preferences['FastTab-React_/projects/FastTab-React']={...old,nodeVersion:'24'};
  assert.equal(projectPreference(project,preferences).nodeVersion,'24');
});
