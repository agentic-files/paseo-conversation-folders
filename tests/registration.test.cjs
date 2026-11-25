const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
test('registers the conversation folders sidebar view', () => {
  const source = fs.readFileSync(require.resolve('../index.client.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} }, registrations = [], removed = [];
  new Function('require', 'exports', code)(name => ({ './client/i18n': { messages: { message: key => key } }, './client/sidebar': { SidebarWithTabs: 'Sidebar' }, './client/spaces-agents-sidebar': { SpacesAgentsSidebar: 'SpacesAgents' } })[name], mod.exports);
  const client = { addSidebarView: contribution => { registrations.push(contribution); return () => removed.push(contribution.id); } };
  const cleanup = mod.exports.default(client);
  assert.deepEqual(registrations.map(({ id, Component }) => [id, Component]), [['folders', 'Sidebar'], ['spaces-agents', 'SpacesAgents']]);
  cleanup(); assert.deepEqual(removed.sort(), ['folders', 'spaces-agents']);
});
