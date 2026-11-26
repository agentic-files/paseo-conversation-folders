const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function model() {
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../shared/spaces-agents.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('exports', code)(mod.exports);
  return mod.exports;
}
const agent = (id, workspace, status = 'idle', attentionReason = null, time = 1) => ({
  ref: { key: id }, workspace: { key: workspace }, status, attentionReason,
  requiresAttention: attentionReason !== null, lastActivityAt: new Date(time).toISOString(),
});

test('approval overrides running without moving the agent out of its Space', () => {
  const { agentGroupKey, agentState } = model();
  const approval = agent('approval', 'local/ws', 'running', 'permission');
  const running = agent('running', 'local/ws', 'initializing');
  const error = agent('error', 'local/ws', 'error');
  const unread = agent('unread', 'local/ws', 'idle', 'finished');
  assert.deepEqual([approval, running, error, unread].map(agentState), ['permission', 'running', 'error', 'updated']);
  assert.deepEqual([approval, running, error, unread].map(agentGroupKey), Array(4).fill('local/ws'));
});

test('recent rows sort by activity and keep same-ID workspaces on different hosts separate', () => {
  const { agentGroupKey, compareAgentActivity } = model();
  const newest = agent('newest', 'remote/ws', 'idle', null, 3);
  const other = agent('other', 'local/ws', 'idle', null, 2);
  const older = agent('older', 'remote/ws');
  assert.deepEqual([older, other, newest].sort(compareAgentActivity), [newest, other, older]);
  assert.deepEqual([newest, other, older].map(agentGroupKey), ['remote/ws', 'local/ws', 'remote/ws']);
});

test('the Space directory displays its last component on Unix and Windows', () => {
  const { directoryName } = model();
  assert.equal(directoryName('/home/dev/project/'), 'project');
  assert.equal(directoryName('C:\\work\\project\\'), 'project');
  assert.equal(directoryName('/'), '/');
  assert.equal(directoryName('~'), '~');
});

test('the default host sorts first without changing the order of the other hosts', () => {
  const { defaultHostFirst } = model();
  assert.deepEqual(defaultHostFirst(['cvm', 'local', 'dev'].map(serverId => ({ serverId })), 'local').map(h => h.serverId), ['local', 'cvm', 'dev']);
});

test('Space naming honors a custom title, otherwise uses the directory', () => {
  const { spaceTitle } = model();
  const workspace = { title: null, name: 'checkout-123', directory: '/tmp/project' };
  assert.equal(spaceTitle({...workspace, title:'Named'}, 'Agent summary'), 'Named');
  assert.equal(spaceTitle(workspace, ' Agent summary '), 'project');
  assert.equal(spaceTitle(workspace, null), 'project');
});

test('newly pinned Spaces rise above other Spaces and unpinning restores name order', () => {
  const { compareSpaces } = model();
  const a = { name: 'a', pinnedAt: null };
  const b = { name: 'b', pinnedAt: '2026-11-24T00:00:00Z' };
  const c = { name: 'c', pinnedAt: '2026-11-25T00:00:00Z' };
  assert.deepEqual([a, b, c].sort(compareSpaces), [c, b, a]);
  assert.deepEqual([c, { ...b, pinnedAt: null }, a].sort(compareSpaces).map(w => w.name), ['c', 'a', 'b']);
});

test('the Spaces running badge excludes idle, hidden and approval-blocked Agents', () => {
  const { isExecutingAgent } = model();
  const running = agent('run', 'local/ws', 'running');
  assert.equal(isExecutingAgent(running), true);
  assert.equal(isExecutingAgent(agent('init', 'local/ws', 'initializing')), true);
  assert.equal(isExecutingAgent(agent('wait', 'local/ws', 'running', 'permission')), false);
  assert.equal(isExecutingAgent(agent('idle', 'local/ws')), false);
  assert.equal(isExecutingAgent({ ...running, background: true }), false);
});

test('pinned Agent groups move first and folded groups keep their headers and counts', () => {
  const { agentGroupRows } = model();
  const a = { key: 'local/ws', items: [{ key: 'a' }] };
  const b = { key: 'remote/ws', items: [{ key: 'b' }] };
  assert.deepEqual(agentGroupRows([a, b], key => key === b.key, key => key !== b.key), [
    { key: 'space:remote/ws', workspaceKey: 'remote/ws', count: 1 },
    { key: 'space:local/ws', workspaceKey: 'local/ws', count: 1 },
    { key: 'agent:a', ref: a.items[0] },
  ]);
});

test('horizontal gestures and invalid layout measurements cannot resize the vertical split', () => {
  const { isVerticalSplitDrag, resizeSplit } = model();
  assert.equal(isVerticalSplitDrag(60, 8), false);
  assert.equal(isVerticalSplitDrag(2, 8), true);
  assert.equal(resizeSplit(0.5, NaN, 500), 0.5);
  assert.equal(resizeSplit(0.5, 10, Infinity), 0.5);
});

test('priority puts all attention first, then execution, then idle, newest within each bucket', () => {
  const { compareAgentPriority } = model();
  const rows = [
    agent('idle-new', 'local/ws', 'idle', null, 100),
    agent('running-new', 'local/ws', 'initializing', null, 90),
    agent('permission', 'remote/ws', 'running', 'permission', 1),
    agent('error', 'local/ws', 'error', null, 3),
    agent('unread', 'remote/ws', 'idle', 'finished', 2),
    agent('running-old', 'remote/ws', 'running', null, 80),
    agent('idle-old', 'local/ws', 'idle', null, 50),
  ];
  assert.deepEqual(rows.sort(compareAgentPriority).map(row => row.ref.key), ['error', 'unread', 'permission', 'running-new', 'running-old', 'idle-new', 'idle-old']);
});

test('vertical drag adjusts the split but leaves both panes reachable', () => {
  const { resizeSplit } = model();
  assert.equal(resizeSplit(0.5, 100, 500), 0.7);
  assert.equal(resizeSplit(0.5, 1000, 500), 0.8);
  assert.equal(resizeSplit(0.5, -1000, 500), 0.2);
  assert.equal(resizeSplit(0.5, 100, 0), 0.5);
});
