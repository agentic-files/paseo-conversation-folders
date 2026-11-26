import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { FlatList, Icon } from '@getpaseo/plugin/client/ui';
import { useAgent, useAgents, useHosts, useRpc, useTranslation, useWorkspace, useWorkspaces, type AgentRef, type WorkspaceRef, type PluginHostSummary, type PluginSidebarViewProps } from '@getpaseo/plugin/client';
import { activityTime } from '../shared/activity';
import { agentGroupKey, agentGroupRows, agentLocation, agentPriorityBucket, agentPriorityRows, agentState, compareAgentActivity, compareAgentPriority, compareSpaces, defaultHostFirst, directoryName, isAttentionAgent, isExecutingAgent, isVerticalSplitDrag, resizeSplit, shortSpaceTitle, showSpaceDirectory, spaceHeadingMeta, spaceTitle, type AgentPriorityBucket } from '../shared/spaces-agents';
import { messages, useAppLanguage } from './i18n';
import { ConversationActions } from './conversation-actions';
import { ViewStateProvider, useViewState } from './view-state';
import { identityColor } from '../shared/identity';
import { hostContext } from '../shared/host-context';
import { providerArtwork } from './provider-artwork';
import { Disclosure, FeedbackPressable, Glyph, StatusMark } from './visuals';
import { DropdownMenu, type DropdownAnchor, type DropdownItem } from './dropdown-menu';

type SpaceRow = { key: string; host: PluginHostSummary } | { key: string; ref: WorkspaceRef };
type AgentListRow =
  | { key: string; ref: AgentRef }
  | { key: string; workspaceKey: string; count: number }
  | { key: string; bucket: AgentPriorityBucket; count: number };

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  pane: { minHeight: 0, minWidth: 0 },
  list: { flex: 1, minHeight: 0 },
  paneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, gap: 6 },
  paneTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1 },
  heading: { fontSize: 12, fontWeight: '600' },
  headCount: { fontSize: 11, fontWeight: '500' },
  headAlert: { fontSize: 10.5, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 5, paddingHorizontal: 7 },
  sortLabel: { fontSize: 11.5, fontWeight: '500' },
  label: { fontSize: 12, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 6, marginHorizontal: 4, paddingHorizontal: 8, minWidth: 0 },
  spaceRow: { paddingLeft: 20 },
  groupRow: { marginTop: 4 },
  bucketRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 },
  bucketText: { fontSize: 11, fontWeight: '600' },
  agentCard: { position: 'relative', flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 6, marginHorizontal: 4, paddingHorizontal: 8, paddingVertical: 6, minWidth: 0, overflow: 'hidden' },
  agentIndent: { paddingLeft: 16 },
  agentRail: { position: 'absolute', left: 0, top: 5, bottom: 5, width: 2.5, borderRadius: 2 },
  agentIconWrap: { marginTop: 2 },
  agentBody: { flex: 1, minWidth: 0, gap: 2 },
  agentRowTop: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  agentRowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0, height: 18 },
  main: { flex: 1, minWidth: 0, fontSize: 13.5 },
  groupTitle: { flexShrink: 1, minWidth: 0, fontSize: 12.5, fontWeight: '500' },
  groupMeta: { flex: 1, minWidth: 0, fontSize: 11, opacity: 0.78 },
  meta: { fontSize: 11, flexShrink: 1, maxWidth: '32%' },
  sub: { flex: 1, minWidth: 0, fontSize: 11 },
  time: { fontSize: 11, flexShrink: 0 },
  statusPill: { fontSize: 10, fontWeight: '600', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden', flexShrink: 0 },
  offlineTag: { fontSize: 10, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden', flexShrink: 0 },
});

function softTint(color: string | undefined, fallback: string | undefined) {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color + '1f' : fallback;
}

function useSpaceTitle(reference: WorkspaceRef) {
  const workspace = useWorkspace(reference);
  return { workspace, title: workspace ? spaceTitle(workspace) : null };
}

function AgentSubtitle({ reference, host, includeSpace, color }: { reference: WorkspaceRef; host: string; includeSpace: boolean; color: string }) {
  const workspace = useWorkspace(reference);
  return <Text numberOfLines={1} style={[styles.sub, { color }]}>{agentLocation(workspace, host, includeSpace)}</Text>;
}

function WorkspaceRow({ reference, view, running, zh }: { reference: WorkspaceRef; view: PluginSidebarViewProps; running: number; zh: boolean }) {
  const { workspace, title } = useSpaceTitle(reference);
  if (!workspace || !title) return null;
  const selected = view.active.workspace?.key === reference.key;
  const c = view.theme.colors;
  return <ConversationActions reference={reference} view={view} minimal quickArchive workspaceTitle={title}>{(openMenu, archiveAction) => <FeedbackPressable onLongPress={openMenu} theme={view.theme} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => view.navigation.openWorkspace(reference)} style={[styles.row, styles.spaceRow, { minHeight: view.layout.compact ? 44 : 30, backgroundColor: selected ? c.surface2 : undefined }]}>
    <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: identityColor(reference.key), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '600' }}>{title.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
    <Text numberOfLines={1} accessibilityLabel={title} style={[styles.main, { color: c.foreground }]}>{shortSpaceTitle(title)}</Text>
    {workspace.pinnedAt && <View accessible accessibilityLabel={zh ? '已置顶' : 'Pinned'}><Glyph name="Pin" size={11} color={c.foregroundMuted} /></View>}
    {running > 0 && <View accessible accessibilityLabel={zh ? '运行中 Agent，' + running : running + ' running agents'} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <StatusMark state="running" theme={view.theme} />
      <Text style={[styles.meta, { maxWidth: undefined, color: c.foregroundMuted }]}>{running}</Text>
    </View>}
    {archiveAction ?? (showSpaceDirectory(title, workspace.directory) && <Text numberOfLines={1} accessibilityLabel={workspace.directory} style={[styles.meta, { color: c.foregroundMuted }]}>{directoryName(workspace.directory)}</Text>)}
  </FeedbackPressable>}</ConversationActions>;
}

function AgentRow({ reference, host, view, zh, indent, showSpace }: { reference: AgentRef; host: string; view: PluginSidebarViewProps; zh: boolean; indent: boolean; showSpace: boolean }) {
  const agent = useAgent(reference);
  if (!agent) return null;
  const c = view.theme.colors;
  const state = agentState(agent);
  const stateLabel = { permission: zh ? '待审批' : 'Approval needed', error: zh ? '出错' : 'Failed', updated: zh ? '未读' : 'Unread', running: zh ? '运行中' : 'Running', idle: zh ? '空闲' : 'Idle' }[state];
  const pillLabel = state === 'permission' ? (zh ? '待审批' : 'Approve') : state === 'error' ? (zh ? '出错' : 'Error') : null;
  const title = agent.title || agent.provider;
  const selected = view.active.agent?.key === reference.key;
  const activity = activityTime(agent.lastActivityAt);
  const artwork = providerArtwork(agent.provider);
  const railColor = state === 'permission' ? c.statusWarning : state === 'error' ? c.statusDanger : undefined;
  const rowBg = selected ? c.surface2 : railColor ? softTint(railColor, c.surface1) : undefined;
  return <ConversationActions reference={reference} view={view} minimal quickArchive>{(openMenu, archiveAction) => <FeedbackPressable onLongPress={openMenu} theme={view.theme} accessibilityRole="button" accessibilityLabel={[title, host, activity, stateLabel].filter(Boolean).join(', ')} accessibilityState={{ selected }} onPress={() => view.navigation.openAgent(reference)} style={[styles.agentCard, indent && styles.agentIndent, { minHeight: view.layout.compact ? 52 : 46, backgroundColor: rowBg }]}>
    {railColor && <View pointerEvents="none" style={[styles.agentRail, { backgroundColor: railColor }]} />}
    <View style={styles.agentIconWrap}>
      {artwork ? <Icon icon={artwork} size={15} color={c.foreground} /> : <Icon name="Bot" size={15} color={c.foregroundMuted} />}
    </View>
    <View style={styles.agentBody}>
      <View style={styles.agentRowTop}>
        <Text numberOfLines={1} style={[styles.main, { color: state === 'idle' ? c.foregroundMuted : c.foreground, fontWeight: state === 'updated' ? '600' : '400' }]}>{title}</Text>
        {pillLabel ? <Text style={[styles.statusPill, { color: railColor, backgroundColor: softTint(railColor, c.surface1) }]}>{pillLabel}</Text> : <StatusMark state={state} theme={view.theme} />}
      </View>
      <View style={styles.agentRowBottom}>
        <AgentSubtitle reference={agent.workspace} host={host} includeSpace={showSpace} color={c.foregroundMuted} />
        {archiveAction ?? <Text style={[styles.time, { color: c.foregroundMuted }]}>{activity}</Text>}
      </View>
    </View>
  </FeedbackPressable>}</ConversationActions>;
}

function WorkspaceHeading({ reference, host, view, count, attention, expanded, pinned, zh, toggle }: { reference: WorkspaceRef; host: string; view: PluginSidebarViewProps; count: number; attention: number; expanded: boolean; pinned: boolean; zh: boolean; toggle(): void }) {
  const { workspace, title } = useSpaceTitle(reference);
  const c = view.theme.colors;
  const label = title || host;
  const headingMeta = spaceHeadingMeta(workspace, host);
  return <ConversationActions reference={reference} view={view} minimal quickArchive workspaceTitle={title ?? host}>{(openMenu, archiveAction) =>
    <FeedbackPressable theme={view.theme} accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggle} onLongPress={openMenu} style={[styles.row, styles.groupRow, { minHeight: view.layout.compact ? 44 : 28 }]}>
      <View style={{ width: 14, height: 14, borderRadius: 3.5, backgroundColor: identityColor(reference.key), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '600' }}>{label.trim().charAt(0).toUpperCase() || '?'}</Text>
      </View>
      <Text numberOfLines={1} accessibilityLabel={label} style={[styles.groupTitle, { color: c.foregroundMuted }]}>{shortSpaceTitle(label)}</Text>
      {headingMeta && headingMeta !== label && <Text numberOfLines={1} accessibilityLabel={workspace?.directory ?? host} style={[styles.groupMeta, { color: c.foregroundMuted }]}>{headingMeta}</Text>}
      {pinned && <Glyph name="Pin" size={11} color={c.foregroundMuted} />}
      {!expanded && attention > 0 && <Text style={[styles.statusPill, { color: c.statusWarning, backgroundColor: softTint(c.statusWarning, c.surface1) }]}>{zh ? '待处理' : 'Attention'}</Text>}
      {archiveAction ?? <Text style={[styles.meta, { color: c.foregroundMuted }]}>{count}</Text>}
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
  const sortMode = useViewState()?.agentSortMode ?? 'space';
  const agentGroups = useAgents({
    where: agent => !agent.background && agent.status !== 'closed' && online.has(agent.hostId) && visibleWorkspaces.has(agent.workspace.key),
    orderBy: sortMode === 'space' ? compareAgentActivity : compareAgentPriority,
    groupBy: sortMode === 'space' ? agentGroupKey : agentPriorityBucket,
  });
  const runningBySpace = new Map(useAgents({ where: agent => online.has(agent.hostId) && isExecutingAgent(agent), groupBy: agentGroupKey }).map(group => [group.key, group.items.length]));
  const attentionBySpace = new Map(useAgents({ where: agent => online.has(agent.hostId) && visibleWorkspaces.has(agent.workspace.key) && isAttentionAgent(agent), groupBy: agentGroupKey }).map(group => [group.key, group.items.length]));
  const attentionCount = [...attentionBySpace.values()].reduce((sum, count) => sum + count, 0);
  const runningHosts = new Set([...visibleWorkspaces.values()].filter(ref => (runningBySpace.get(ref.key) ?? 0) > 0).map(ref => ref.hostId));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (host: PluginHostSummary) => open[host.serverId] ?? (host.serverId === defaultHost || view.active.workspace?.hostId === host.serverId);
  const spaceRows: SpaceRow[] = hosts.flatMap(host => [
    { key: `host:${host.serverId}`, host },
    ...(host.status === 'online' && isOpen(host) ? (workspaces.find(group => group.key === host.serverId)?.items ?? []).map(ref => ({ key: `workspace:${ref.key}`, ref })) : []),
  ]);
  const c = view.theme.colors;
  const [split, setSplit] = useState(0.4);
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
      <View style={styles.paneHeader}>
        <View style={styles.paneTitleGroup}>
          <Text accessibilityRole="header" style={[styles.heading, { color: c.foregroundMuted }]}>{zh ? '工作区' : 'Spaces'}</Text>
          <Text style={[styles.headCount, { color: c.foregroundMuted }]}>{visibleWorkspaces.size}</Text>
        </View>
      </View>
      <FlatList style={styles.list} data={spaceRows} keyExtractor={item => item.key} renderItem={({ item }) => {
        if ('ref' in item) return <WorkspaceRow reference={item.ref} view={view} running={runningBySpace.get(item.ref.key) ?? 0} zh={zh} />;
        const { host } = item;
        const available = host.status === 'online';
        const expanded = available && isOpen(host);
        const status = available ? (zh ? '在线' : 'Online') : host.status === 'connecting' ? (zh ? '连接中' : 'Connecting') : (zh ? '离线' : 'Offline');
        const running = available && runningHosts.has(host.serverId);
        const activity = available ? (running ? (zh ? '运行中' : 'Running') : (zh ? '空闲' : 'Idle')) : '';
        return <FeedbackPressable theme={view.theme} accessibilityRole="button" accessibilityLabel={[host.label, status, activity].filter(Boolean).join(', ')} accessibilityState={{ expanded, disabled: !available }} disabled={!available} onPress={() => setOpen(previous => ({ ...previous, [host.serverId]: !expanded }))} style={[styles.row, { minHeight: view.layout.compact ? 44 : 32, opacity: available ? 1 : 0.5 }]}>
          <Glyph name={host.serverId === defaultHost ? 'Monitor' : 'server'} color={c.foregroundMuted} />
          <Text numberOfLines={1} style={[styles.main, { color: c.foreground }]}>{host.label}</Text>
          {!available && <Text style={[styles.offlineTag, { color: c.foregroundMuted, backgroundColor: c.surface1 }]}>{status}</Text>}
          {running && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.statusDanger }} />}
          <Disclosure open={expanded} color={c.foregroundMuted} />
        </FeedbackPressable>;
      }} />
    </View>
    <View {...divider.panHandlers} accessibilityRole="adjustable" accessibilityLabel={zh ? '调整工作区与 Agent 的高度' : 'Resize Spaces and Agents'} accessibilityValue={{ min: 20, max: 80, now: Math.round(split * 100) }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={event => setSplit(current => resizeSplit(current, event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05, 1))} style={{ height: 10, justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }}><View style={{ alignSelf: 'center', width: 24, height: 3, borderRadius: 2, backgroundColor: c.foregroundMuted, marginTop: -1 }} /></View>
    </View>
    <AgentPane flex={1 - split} sections={agentGroups} pinned={pinned} workspaces={visibleWorkspaces} attentionBySpace={attentionBySpace} attentionCount={attentionCount} hosts={hostLabels} view={view} zh={zh} />
  </View>;
}

function AgentPane({ flex, sections, workspaces, attentionBySpace, attentionCount, hosts, view, zh, pinned }: { flex: number; sections: readonly { key: string; items: readonly AgentRef[] }[]; workspaces: ReadonlyMap<string, WorkspaceRef>; attentionBySpace: ReadonlyMap<string, number>; attentionCount: number; hosts: ReadonlyMap<string, string>; view: PluginSidebarViewProps; zh: boolean; pinned: ReadonlySet<string> }) {
  const viewState = useViewState();
  const keyFor = (key: string) => 'dual-agents:' + key;
  const isOpen = (key: string) => viewState?.isOpen(keyFor(key), true) ?? true;
  const sortMode = viewState?.agentSortMode ?? 'space';
  const rows: AgentListRow[] = sortMode === 'space'
    ? agentGroupRows(sections.filter(section => workspaces.has(section.key)), key => pinned.has(key), isOpen)
    : agentPriorityRows(sections);
  const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);
  const sortButton = useRef<View | null>(null);
  const modes = [
    { id: 'space', label: zh ? '按工作区' : 'By Space' },
    { id: 'priority', label: zh ? '按优先级' : 'By priority' },
  ] as const;
  const activeModeLabel = modes.find(mode => mode.id === sortMode)?.label ?? modes[0].label;
  const menu: DropdownItem[] = modes.map(mode => ({ ...mode, checked: sortMode === mode.id, onSelect: () => { viewState?.setAgentSortMode(mode.id); setAnchor(null); } }));
  const c = view.theme.colors;
  const bucketLabels: Record<AgentPriorityBucket, { text: string; color: string }> = {
    attention: { text: zh ? '待处理' : 'Needs attention', color: c.statusWarning },
    running: { text: zh ? '运行中' : 'Running', color: c.accent },
    idle: { text: zh ? '空闲' : 'Idle', color: c.foregroundMuted },
  };
  return <View style={[styles.pane, { flex }]}>
    <View style={styles.paneHeader}>
      <View style={styles.paneTitleGroup}>
        <Text accessibilityRole="header" style={[styles.heading, { color: c.foregroundMuted }]}>Agents</Text>
        {attentionCount > 0 && <Text style={[styles.headAlert, { color: c.statusWarning, backgroundColor: softTint(c.statusWarning, c.surface1) }]}>{zh ? `${attentionCount} 待处理` : `${attentionCount} attention`}</Text>}
      </View>
      <FeedbackPressable theme={view.theme} focusRef={sortButton} accessibilityRole="button" accessibilityLabel={zh ? 'Agent 排序' : 'Sort agents'} accessibilityState={{ expanded: anchor !== null }} onPress={() => {
        if (anchor) setAnchor(null);
        else sortButton.current?.measureInWindow((x, y, width, height) => setAnchor({ right: x + width, top: y + height + 4 }));
      }} style={[styles.sortButton, { minHeight: view.layout.compact ? 44 : 24, backgroundColor: c.surface1 }]}>
        <Text style={[styles.sortLabel, { color: c.foregroundMuted }]}>{activeModeLabel}</Text>
        <Glyph name="sort" size={12} color={c.foregroundMuted} />
      </FeedbackPressable>
    </View>
    <DropdownMenu anchor={anchor} items={menu} close={() => setAnchor(null)} view={view} />
    <FlatList style={styles.list} data={rows} keyExtractor={item => item.key} ListEmptyComponent={<Text style={[styles.label, { color: c.foregroundMuted }]}>{zh ? '没有可显示的会话' : 'No sessions to show'}</Text>} renderItem={({ item }) => {
      if ('ref' in item) return <AgentRow reference={item.ref} host={hosts.get(item.ref.hostId) ?? item.ref.hostId} view={view} zh={zh} indent={sortMode === 'space'} showSpace={sortMode === 'priority'} />;
      if ('bucket' in item) {
        const meta = bucketLabels[item.bucket];
        return <View style={styles.bucketRow}>
          <Text style={[styles.bucketText, { color: meta.color }]}>{meta.text}</Text>
          <Text style={[styles.bucketText, { color: c.foregroundMuted }]}>{item.count}</Text>
        </View>;
      }
      const workspace = workspaces.get(item.workspaceKey);
      if (!workspace) return null;
      const expanded = isOpen(workspace.key);
      return <WorkspaceHeading reference={workspace} host={hosts.get(workspace.hostId) ?? workspace.hostId} view={view} count={item.count} attention={attentionBySpace.get(workspace.key) ?? 0} expanded={expanded} pinned={pinned.has(workspace.key)} zh={zh} toggle={() => viewState?.setOpen(keyFor(workspace.key), !expanded)} />;
    }} />
  </View>;
}
