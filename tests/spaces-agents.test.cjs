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

test('Space labels fit ten visible characters including the ellipsis', () => {
  const { shortSpaceTitle } = model();
  assert.equal(shortSpaceTitle('0123456789'), '0123456789');
  assert.equal(shortSpaceTitle('这是一个非常长的工作区名字'), '这是一个非常长的工…');
  assert.equal(shortSpaceTitle('01234567👩‍💻890'), '01234567👩‍💻…');
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

test('priority rows insert non-empty attention, running and idle bucket headers in order', () => {
  const { agentPriorityBucket, agentPriorityRows, isAttentionAgent } = model();
  const perm = agent('p', 'local/ws', 'running', 'permission', 10);
  const run = agent('r', 'local/ws', 'running', null, 20);
  const idle = agent('i', 'local/ws', 'idle', null, 30);
  assert.deepEqual([perm, run, idle].map(agentPriorityBucket), ['attention', 'running', 'idle']);
  assert.deepEqual([perm, run, idle].map(isAttentionAgent), [true, false, false]);
  assert.equal(isAttentionAgent({ ...perm, background: true }), false);
  assert.deepEqual(
    agentPriorityRows([
      { key: 'idle', items: [idle.ref] },
      { key: 'attention', items: [perm.ref] },
    ]),
    [
      { key: 'bucket:attention', bucket: 'attention', count: 1 },
      { key: 'agent:p', ref: perm.ref },
      { key: 'bucket:idle', bucket: 'idle', count: 1 },
      { key: 'agent:i', ref: idle.ref },
    ],
  );
});

test('workspace directory suffix is hidden when it matches the displayed title', () => {
  const { showSpaceDirectory } = model();
  assert.equal(showSpaceDirectory('project', '/work/project'), false);
  assert.equal(showSpaceDirectory('Custom', '/work/project'), true);
});

test('agent location always includes workspace directory without duplicating default titles', () => {
  const { agentLocation } = model();
  const custom = { title: 'paseo-mod-feature', name: 'ws-1', directory: '/Users/melos/dev/personal/paseo-quote' };
  const plain = { title: null, name: 'ws-2', directory: '/Users/melos/dev/paseo-conversation-folders' };
  assert.equal(agentLocation(custom, 'Mac', false), 'paseo-quote · Mac');
  assert.equal(agentLocation(custom, 'Mac', true), 'paseo-mod… · paseo-quote · Mac');
  assert.equal(agentLocation(plain, 'Mac', false), 'paseo-conversation-folders · Mac');
  assert.equal(agentLocation(plain, 'Mac', true), 'paseo-conversation-folders · Mac');
  assert.equal(agentLocation(null, 'Mac', true), 'Mac');
});

test('space heading meta shows directory and host without repeating short matching directory names', () => {
  const { spaceHeadingMeta } = model();
  const custom = { title: 'paseo-mod-feature', name: 'ws-1', directory: '/Users/melos/dev/personal/paseo-quote' };
  const longDir = { title: null, name: 'ws-2', directory: '/Users/melos/dev/paseo-conversation-folders' };
  const shortDir = { title: null, name: 'ws-3', directory: '/work/ray' };
  assert.equal(spaceHeadingMeta(custom, 'Mac'), 'paseo-quote · Mac');
  assert.equal(spaceHeadingMeta(longDir, 'Mac'), 'paseo-conversation-folders · Mac');
  assert.equal(spaceHeadingMeta(shortDir, 'cvm'), 'cvm');
  assert.equal(spaceHeadingMeta(null, 'cvm'), 'cvm');
});
