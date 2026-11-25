import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { FlatList, Icon } from '@getpaseo/plugin/client/ui';
import { useAgent, useAgents, useHosts, useRpc, useTranslation, useWorkspace, useWorkspaces, type AgentRef, type WorkspaceRef, type PluginHostSummary, type PluginSidebarViewProps } from '@getpaseo/plugin/client';
import { activityTime } from '../shared/activity';
import { agentGroupKey, agentState, compareAgentActivity, compareSpaces, defaultHostFirst, directoryName, isExecutingAgent, isVerticalSplitDrag, agentGroupRows, resizeSplit, spaceTitle } from '../shared/spaces-agents';
import { messages, useAppLanguage } from './i18n';
import { ConversationActions } from './conversation-actions';
import { ViewStateProvider, useViewState } from './view-state';
import { identityColor } from '../shared/identity';
import { hostContext } from '../shared/host-context';
import { providerArtwork } from './provider-artwork';
import { Disclosure, FeedbackPressable, Glyph, StatusMark } from './visuals';

type SpaceRow = { key: string; host: PluginHostSummary } | { key: string; ref: WorkspaceRef };

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  pane: { minHeight: 0, minWidth: 0 },
  list: { flex: 1, minHeight: 0 },
  heading: { fontSize: 13, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 8 },
  label: { fontSize: 12, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 6, marginHorizontal: 4, paddingHorizontal: 8, minWidth: 0 },
  main: { flex: 1, minWidth: 0, fontSize: 14 },
  meta: { fontSize: 11, flexShrink: 1, maxWidth: '32%' },
});

function useSpaceTitle(reference: WorkspaceRef) {
  const workspace = useWorkspace(reference);
  return { workspace, title: workspace ? spaceTitle(workspace) : null };
}

function WorkspaceRow({ reference, view, running, zh }: { reference: WorkspaceRef; view: PluginSidebarViewProps; running: number; zh: boolean }) {
  const { workspace, title } = useSpaceTitle(reference);
  if (!workspace || !title) return null;
  const selected = view.active.workspace?.key === reference.key;
  const c = view.theme.colors;
  return <ConversationActions reference={reference} view={view} minimal workspaceTitle={title}>{openMenu => <FeedbackPressable onLongPress={openMenu} theme={view.theme} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => view.navigation.openWorkspace(reference)} style={[styles.row, { minHeight: view.layout.compact ? 44 : 32, backgroundColor: selected ? c.surface2 : undefined }]}>
    <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: identityColor(reference.key), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '600' }}>{title.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
    <Text numberOfLines={1} style={[styles.main, { color: c.foreground }]}>{title}</Text>
    {workspace.pinnedAt && <View accessible accessibilityLabel={zh ? '已置顶' : 'Pinned'}><Glyph name="Pin" size={12} color={c.foregroundMuted} /></View>}
    {running > 0 && <View accessible accessibilityLabel={zh ? '运行中 Agent，' + running : running + ' running agents'} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <StatusMark state="running" theme={view.theme} />
      <Text style={[styles.meta, { maxWidth: undefined, color: c.foregroundMuted }]}>{running}</Text>
    </View>}
    <Text numberOfLines={1} accessibilityLabel={workspace.directory} style={[styles.meta, { color: c.foregroundMuted }]}>{directoryName(workspace.directory)}</Text>
  </FeedbackPressable>}</ConversationActions>;
}

function AgentRow({ reference, host, view, zh }: { reference: AgentRef; host: string; view: PluginSidebarViewProps; zh: boolean }) {
  const agent = useAgent(reference);
  if (!agent) return null;
  const c = view.theme.colors;
  const state = agentState(agent);
  const stateLabel = { permission: zh ? '待审批' : 'Approval needed', error: zh ? '出错' : 'Failed', updated: zh ? '未读' : 'Unread', running: zh ? '运行中' : 'Running', idle: zh ? '空闲' : 'Idle' }[state];
  const title = agent.title || agent.provider;
  const selected = view.active.agent?.key === reference.key;
  const activity = activityTime(agent.lastActivityAt);
  const artwork = providerArtwork(agent.provider);
  return <ConversationActions reference={reference} view={view} minimal>{openMenu => <FeedbackPressable onLongPress={openMenu} theme={view.theme} accessibilityRole="button" accessibilityLabel={[title, host, activity, stateLabel].filter(Boolean).join(', ')} accessibilityState={{ selected }} onPress={() => view.navigation.openAgent(reference)} style={[styles.row, { minHeight: view.layout.compact ? 44 : 34, backgroundColor: selected ? c.surface2 : undefined }]}>
    {artwork ? <Icon icon={artwork} size={16} color={c.foreground} /> : <Icon name="Bot" size={16} color={c.foregroundMuted} />}
    <Text numberOfLines={1} style={[styles.main, { color: c.foreground }]}>{title}</Text>
    <Text numberOfLines={1} style={[styles.meta, { color: c.foregroundMuted }]}>{host}</Text>
    <Text style={[styles.meta, { color: c.foregroundMuted }]}>{activity}</Text>
    <StatusMark state={state} theme={view.theme} />
  </FeedbackPressable>}</ConversationActions>;
}

function WorkspaceHeading({ reference, host, view, count, expanded, pinned, toggle }: { reference: WorkspaceRef; host: string; view: PluginSidebarViewProps; count: number; expanded: boolean; pinned: boolean; toggle(): void }) {
  const { title } = useSpaceTitle(reference);
  const c = view.theme.colors;
  return <ConversationActions reference={reference} view={view} minimal workspaceTitle={title ?? host}>{openMenu =>
    <FeedbackPressable theme={view.theme} accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggle} onLongPress={openMenu} style={[styles.row, { minHeight: view.layout.compact ? 44 : 34 }]}>
      <Text numberOfLines={1} style={[styles.main, { color: c.foregroundMuted }]}>{title || host}</Text>
      {pinned && <Glyph name="Pin" size={12} color={c.foregroundMuted} />}
      <Text style={[styles.meta, { color: c.foregroundMuted }]}>{count}</Text>
      <Disclosure open={expanded} color={c.foregroundMuted} />
    </FeedbackPressable>
  }</ConversationActions>;
}

export function SpacesAgentsSidebar(view: PluginSidebarViewProps) {
  return <ViewStateProvider><DualSidebar {...view} /></ViewStateProvider>;
}

function DualSidebar(view: PluginSidebarViewProps) {
  useAppLanguage();
  const zh = useTranslation(messages).locale.toLowerCase().startsWith('zh');
  const configuredHosts = useHosts();
  const readHost = useRpc(hostContext);
  const [defaultHost, setDefaultHost] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void readHost({}).then(({ hostId }) => { if (active) setDefaultHost(hostId); }).catch(() => {});
    return () => { active = false; };
  }, [readHost]);
  const hosts = defaultHostFirst(configuredHosts, defaultHost);
  const hostLabels = new Map(hosts.map(host => [host.serverId, host.label]));
  const online = new Set(hosts.filter(host => host.status === 'online').map(host => host.serverId));
  const workspaces = useWorkspaces({ where: workspace => !workspace.background && !workspace.archivingAt, groupBy: workspace => workspace.hostId, orderBy: compareSpaces });
  const visibleWorkspaces = new Map(workspaces.flatMap(group => group.items.map(ref => [ref.key, ref] as const)));
  const pinned = new Set(useWorkspaces({ where: workspace => !!workspace.pinnedAt }).map(ref => ref.key));
  const agentGroups = useAgents({
    where: agent => !agent.background && agent.status !== 'closed' && online.has(agent.hostId) && visibleWorkspaces.has(agent.workspace.key),
    orderBy: compareAgentActivity,
    groupBy: agentGroupKey,
  });
  const runningBySpace = new Map(useAgents({ where: agent => online.has(agent.hostId) && isExecutingAgent(agent), groupBy: agentGroupKey }).map(group => [group.key, group.items.length]));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (host: PluginHostSummary) => open[host.serverId] ?? (host.serverId === defaultHost || view.active.workspace?.hostId === host.serverId);
  const spaceRows: SpaceRow[] = hosts.flatMap(host => [
    { key: `host:${host.serverId}`, host },
    ...(host.status === 'online' && isOpen(host) ? (workspaces.find(group => group.key === host.serverId)?.items ?? []).map(ref => ({ key: `workspace:${ref.key}`, ref })) : []),
  ]);
  const c = view.theme.colors;
  const [split, setSplit] = useState(0.5);
  const height = useRef(0);
  const start = useRef(split);
  const ratio = useRef(split);
  ratio.current = split;
  const divider = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => isVerticalSplitDrag(gesture.dx, gesture.dy),
    onPanResponderGrant: () => { start.current = ratio.current; },
    onPanResponderMove: (_, gesture) => setSplit(resizeSplit(start.current, gesture.dy, height.current)),
  })).current;
  return <View style={styles.root} onLayout={event => { height.current = event.nativeEvent.layout.height - 10; }}>
    <View style={[styles.pane, { flex: split }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: c.foregroundMuted }]}>{zh ? '工作区' : 'Spaces'}</Text>
      <FlatList style={styles.list} data={spaceRows} keyExtractor={item => item.key} renderItem={({ item }) => {
        if ('ref' in item) return <WorkspaceRow reference={item.ref} view={view} running={runningBySpace.get(item.ref.key) ?? 0} zh={zh} />;
        const { host } = item;
        const available = host.status === 'online';
        const expanded = available && isOpen(host);
        const status = available ? (zh ? '在线' : 'Online') : host.status === 'connecting' ? (zh ? '连接中' : 'Connecting') : (zh ? '离线' : 'Offline');
        return <FeedbackPressable theme={view.theme} accessibilityRole="button" accessibilityLabel={`${host.label}, ${status}`} accessibilityState={{ expanded, disabled: !available }} disabled={!available} onPress={() => setOpen(previous => ({ ...previous, [host.serverId]: !expanded }))} style={[styles.row, { minHeight: view.layout.compact ? 44 : 34 }]}>
          <Glyph name={host.serverId === defaultHost ? 'Monitor' : 'server'} color={c.foregroundMuted} />
          <Text numberOfLines={1} style={[styles.main, { color: c.foreground }]}>{host.label}</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: available ? c.statusSuccess : host.status === 'connecting' ? c.statusWarning : c.foregroundMuted }} />
          <Disclosure open={expanded} color={c.foregroundMuted} />
        </FeedbackPressable>;
      }} />
    </View>
    <View {...divider.panHandlers} accessibilityRole="adjustable" accessibilityLabel={zh ? '调整工作区与 Agent 的高度' : 'Resize Spaces and Agents'} accessibilityValue={{ min: 20, max: 80, now: Math.round(split * 100) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={event => setSplit(current => resizeSplit(current, event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05, 1))} style={{ height: 10, justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }}><View style={{ alignSelf: 'center', width: 24, height: 3, borderRadius: 2, backgroundColor: c.foregroundMuted, marginTop: -1 }} /></View>
    </View>
    <AgentPane flex={1 - split} sections={agentGroups} pinned={pinned} workspaces={visibleWorkspaces} hosts={hostLabels} view={view} zh={zh} />
  </View>;
}

function AgentPane({ flex, sections, workspaces, hosts, view, zh, pinned }: { flex: number; sections: readonly { key: string; items: readonly AgentRef[] }[]; workspaces: ReadonlyMap<string, WorkspaceRef>; hosts: ReadonlyMap<string, string>; view: PluginSidebarViewProps; zh: boolean; pinned: ReadonlySet<string> }) {
  const viewState = useViewState();
  const keyFor = (key: string) => 'dual-agents:' + key;
  const isOpen = (key: string) => viewState?.isOpen(keyFor(key), true) ?? true;
  const rows = agentGroupRows(sections.filter(section => workspaces.has(section.key)), key => pinned.has(key), isOpen);
  const c = view.theme.colors;
  return <View style={[styles.pane, { flex }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: c.foregroundMuted }]}>Agents</Text>
    <FlatList style={styles.list} data={rows} keyExtractor={item => item.key} ListEmptyComponent={<Text style={[styles.label, { color: c.foregroundMuted }]}>{zh ? '没有可显示的会话' : 'No sessions to show'}</Text>} renderItem={({ item }) => {
      if ('ref' in item) return <AgentRow reference={item.ref} host={hosts.get(item.ref.hostId) ?? item.ref.hostId} view={view} zh={zh} />;
      const workspace = workspaces.get(item.workspaceKey);
      if (!workspace) return null;
      const expanded = isOpen(workspace.key);
      return <WorkspaceHeading reference={workspace} host={hosts.get(workspace.hostId) ?? workspace.hostId} view={view} count={item.count} expanded={expanded} pinned={pinned.has(workspace.key)} toggle={() => viewState?.setOpen(keyFor(workspace.key), !expanded)} />;
    }} />
  </View>;
}
