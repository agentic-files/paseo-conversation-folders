const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => { assert.ok(name in imports, name); return imports[name]; }, mod.exports);
  return mod.exports;
}
const model = load('../shared/spaces-agents.ts');
const workspace = (hostId, id, extra = {}) => ({ ref: { key: `${hostId}/${id}`, hostId, id }, hostId, name: id, directory: `/work/${id}`, title: null, pinnedAt: null, ...extra });
const agent = (workspace, id, status = 'idle', reason = null, time = 1, extra = {}) => ({ ref: { key: id, hostId: workspace.hostId, id }, hostId: workspace.hostId, workspace: workspace.ref, status, requiresAttention: reason !== null, attentionReason: reason, lastActivityAt: new Date(time).toISOString(), ...extra });

function harness() {
  const a = workspace('local', 'a'), b = workspace('remote', 'b', { pinnedAt: '2026-11-25' });
  const hidden = workspace('local', 'hidden', { background: true });
  const archived = workspace('local', 'archived', { archivingAt: '2026-11-25' });
  const hosts = [{ serverId: 'local', label: 'Local', status: 'online' }, { serverId: 'remote', label: 'Remote', status: 'online' }, { serverId: 'offline', label: 'Offline', status: 'offline' }, { serverId: 'connecting', label: 'Connecting', status: 'connecting' }];
  const workspaces = [a, b, hidden, archived, workspace('offline', 'c'), workspace('connecting', 'd')];
  const agents = [agent(a, 'idle', 'idle', null, 100), agent(a, 'run', 'running', null, 50), agent(b, 'permission', 'running', 'permission', 10), agent(b, 'unread', 'idle', 'finished', 20), agent(b, 'error', 'error', null, 30), agent(hidden, 'hidden', 'running'), agent(archived, 'archived', 'running'), agent(a, 'background', 'running', null, 1, { background: true }), agent(a, 'closed', 'closed')];
  const state = { agentSortMode: 'space', open: {}, isOpen(key, fallback) { return this.open[key] ?? fallback; }, setOpen(key, value) { this.open[key] = value; }, setAgentSortMode(mode) { this.agentSortMode = mode; } };
  let cursor = 0, slots, tree;
  const componentSlots = new Map();
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; const owner = slots; return [owner[i], next => { owner[i] = typeof next === 'function' ? next(owner[i]) : next; }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useEffect() {},
  };
  function query(source, q) {
    const rows = source.filter(row => !q?.where || q.where(row));
    if (q?.orderBy) rows.sort(q.orderBy);
    if (!q?.groupBy) return rows.map(row => row.ref);
    const groups = new Map();
    for (const row of rows) { const key = q.groupBy(row); if (!groups.has(key)) groups.set(key, { key, items: [] }); groups.get(key).items.push(row.ref); }
    return [...groups.values()];
  }
  const mod = load('../client/spaces-agents-sidebar.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: value => value }, PanResponder: { create: () => ({ panHandlers: {} }) } },
    '@getpaseo/plugin/client/ui': { FlatList: 'FlatList', Icon: 'Icon' },
    '@getpaseo/plugin/client': { useHosts: () => hosts, useRpc: () => async () => ({ hostId: 'local' }), useTranslation: () => ({ locale: 'en' }), useWorkspaces: q => query(workspaces, q), useAgents: q => query(agents, q) },
    '../shared/activity': { activityTime: () => 'now' }, '../shared/spaces-agents': model,
    './i18n': { messages: {}, useAppLanguage() {} }, './conversation-actions': { ConversationActions: 'ConversationActions' },
    './view-state': { ViewStateProvider: 'ViewStateProvider', useViewState: () => state },
    '../shared/identity': {}, '../shared/host-context': {}, './provider-artwork': {},
    './visuals': { Disclosure: 'Disclosure', FeedbackPressable: 'Pressable', Glyph: 'Glyph', StatusMark: 'StatusMark' },
    './dropdown-menu': { DropdownMenu: 'DropdownMenu' },
  });
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      if (!componentSlots.has(node.type)) componentSlots.set(node.type, []);
      cursor = 0; slots = componentSlots.get(node.type);
      return expand(node.type(node.props));
    }
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  function nodes(node, out = []) {
    if (Array.isArray(node)) node.forEach(child => nodes(child, out));
    else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); }
    return out;
  }
  const view = { theme: { colors: { statusSuccess: 'green', statusWarning: 'yellow', foregroundMuted: 'gray' } }, layout: { compact: false }, active: {}, navigation: {} };
  const render = () => { tree = expand(jsx(mod.SpacesAgentsSidebar, view)); };
  render();
  return { state, agents, hosts, workspaces, render, nodes: () => nodes(tree), find: label => nodes(tree).find(node => node.props.accessibilityLabel === label), lists: () => nodes(tree).filter(node => node.type === 'FlatList') };
}

test('sort menu switches to a live flat priority list and restores pinned folded Space groups', () => {
  const h = harness();
  h.state.setOpen('dual-agents:remote/b', false); h.render();
  const grouped = () => h.lists()[1].props.data;
  assert.deepEqual(grouped().map(row => row.key), ['space:remote/b', 'space:local/a', 'agent:idle', 'agent:run']);
  const button = h.find('Sort agents');
  assert.ok(button, 'Agents exposes an accessible sort menu');
  const anchor = { measureInWindow: callback => callback(10, 20, 30, 40) };
  if (typeof button.props.focusRef === 'function') button.props.focusRef(anchor);
  else button.props.focusRef.current = anchor;
  button.props.onPress(); h.render();
  let menu = h.nodes().find(node => node.type === 'DropdownMenu');
  assert.deepEqual(menu.props.anchor, { right: 40, top: 64 });
  assert.equal(h.find('Sort agents').props.accessibilityState.expanded, true);
  menu.props.close(); h.render();
  assert.equal(h.find('Sort agents').props.accessibilityState.expanded, false);
  h.find('Sort agents').props.onPress(); h.render();
  menu = h.nodes().find(node => node.type === 'DropdownMenu');
  assert.equal(menu.props.items.find(item => item.id === 'space').checked, true);
  menu.props.items.find(item => item.id === 'priority').onSelect(); h.render();
  assert.deepEqual(grouped().map(row => row.ref.key), ['error', 'unread', 'permission', 'run', 'idle']);
  assert.equal(h.nodes().find(node => node.type === 'DropdownMenu').props.anchor, null);
  h.agents.find(row => row.ref.key === 'idle').requiresAttention = true;
  h.render();
  assert.deepEqual(grouped().map(row => row.ref.key), ['idle', 'error', 'unread', 'permission', 'run']);
  menu = h.nodes().find(node => node.type === 'DropdownMenu');
  menu.props.items.find(item => item.id === 'space').onSelect(); h.render();
  assert.deepEqual(grouped().map(row => row.key), ['space:remote/b', 'space:local/a', 'agent:idle', 'agent:run']);
});

test('machine dots reflect visible workspace execution even with collapsed hosts and Agent groups', () => {
  const h = harness();
  h.state.setOpen('dual-agents:local/a', false); h.render();
  const hostRows = () => h.lists()[0].props.data.filter(row => row.host).map(item => h.lists()[0].props.renderItem({ item }));
  const dot = row => row.props.children.find(child => child?.type === 'View');
  let rows = hostRows();
  assert.deepEqual(rows.map(row => dot(row).props.style.backgroundColor), ['green', 'gray', 'gray', 'yellow']);
  assert.equal(rows[0].props.accessibilityState.expanded, false);
  assert.match(rows[0].props.accessibilityLabel, /Online.*Running/);
  assert.equal(rows[2].props.disabled, true);
  assert.equal(rows[3].props.disabled, true);
  h.agents.find(row => row.ref.key === 'run').status = 'idle'; h.render();
  assert.equal(dot(hostRows()[0]).props.style.backgroundColor, 'gray');
  h.agents.find(row => row.ref.key === 'run').status = 'initializing'; h.render();
  assert.equal(dot(hostRows()[0]).props.style.backgroundColor, 'green');
  h.hosts[0].status = 'offline'; h.render();
  rows = hostRows();
  assert.equal(dot(rows[0]).props.style.backgroundColor, 'gray');
  assert.equal(rows[0].props.disabled, true);
  assert.match(rows[0].props.accessibilityLabel, /Offline/);
});

test('legacy device preferences default to Space sorting', () => {
  const { viewState } = load('../shared/settings.ts', { '@getpaseo/plugin': { defineSettings: value => value }, zod: require('zod') });
  assert.equal(viewState.scope, 'device');
  assert.equal(viewState.schema.parse({}).agentSortMode, 'space');
  assert.equal(viewState.schema.safeParse({ agentSortMode: 'unknown' }).success, false);
});
