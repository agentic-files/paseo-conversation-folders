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

test('approval overrides running, and priority sections do not duplicate recent agents', () => {
  const { agentGroupKey, agentState } = model();
  const approval = agent('approval', 'local/ws', 'running', 'permission');
  const running = agent('running', 'local/ws', 'initializing');
  const error = agent('error', 'local/ws', 'error');
  const unread = agent('unread', 'remote/ws', 'idle', 'finished');
  assert.equal(agentState(approval), 'permission');
  assert.deepEqual([running, approval, error, unread].map(agentGroupKey), ['running', 'attention', 'attention', 'attention']);
});

test('recent rows sort by activity and keep same-ID workspaces on different hosts separate', () => {
  const { agentGroupKey, compareAgentActivity } = model();
  const newest = agent('newest', 'remote/ws', 'idle', null, 3);
  const other = agent('other', 'local/ws', 'idle', null, 2);
  const older = agent('older', 'remote/ws');
  assert.deepEqual([older, other, newest].sort(compareAgentActivity), [newest, other, older]);
  assert.deepEqual([newest, other, older].map(agentGroupKey), ['workspace:remote/ws', 'workspace:local/ws', 'workspace:remote/ws']);
});
