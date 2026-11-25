import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlatList } from '@getpaseo/plugin/client/ui';
import { useAgent, useAgents, useHosts, useTranslation, useWorkspace, useWorkspaces, type AgentRef, type WorkspaceRef, type PluginHostSummary, type PluginSidebarViewProps } from '@getpaseo/plugin/client';
import { activityTime } from '../shared/activity';
import { agentGroupKey, agentState, compareAgentActivity } from '../shared/spaces-agents';
import { messages } from './i18n';
import { Disclosure, FeedbackPressable, Glyph, StatusMark } from './visuals';

type SpaceRow = { key: string; host: PluginHostSummary } | { key: string; ref: WorkspaceRef };
type AgentItem = { key: string; ref: AgentRef } | { key: string; title: string } | { key: string; workspace: WorkspaceRef; host: string };
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

function WorkspaceRow({ reference, view }: { reference: WorkspaceRef; view: PluginSidebarViewProps }) {
  const workspace = useWorkspace(reference);
  if (!workspace) return null;
  const selected = view.active.workspace?.key === reference.key;
  const c = view.theme.colors;
  return <FeedbackPressable theme={view.theme} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => view.navigation.openWorkspace(reference)} style={[styles.row, { minHeight: view.layout.compact ? 44 : 32, paddingLeft: 22, backgroundColor: selected ? c.surface2 : undefined }]}>
    <Glyph name="folder" color={c.foregroundMuted} />
    <Text numberOfLines={1} style={[styles.main, { color: c.foreground }]}>{workspace.title || workspace.name}</Text>
    {workspace.projectDisplayName !== workspace.name && <Text numberOfLines={1} style={[styles.meta, { color: c.foregroundMuted }]}>{workspace.projectDisplayName}</Text>}
  </FeedbackPressable>;
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
  return <FeedbackPressable theme={view.theme} accessibilityRole="button" accessibilityLabel={[title, host, activity, stateLabel].filter(Boolean).join(', ')} accessibilityState={{ selected }} onPress={() => view.navigation.openAgent(reference)} style={[styles.row, { minHeight: view.layout.compact ? 44 : 34, backgroundColor: selected ? c.surface2 : undefined }]}>
    <Glyph name="conversations" color={c.foregroundMuted} />
    <Text numberOfLines={1} style={[styles.main, { color: c.foreground }]}>{title}</Text>
    <Text numberOfLines={1} style={[styles.meta, { color: c.foregroundMuted }]}>{host}</Text>
    <Text style={[styles.meta, { color: c.foregroundMuted }]}>{activity}</Text>
    <StatusMark state={state} theme={view.theme} />
  </FeedbackPressable>;
}

function WorkspaceHeading({ reference, host, view }: { reference: WorkspaceRef; host: string; view: PluginSidebarViewProps }) {
  const workspace = useWorkspace(reference);
  return <Text numberOfLines={1} style={[styles.label, { color: view.theme.colors.foregroundMuted }]}>{workspace?.title || workspace?.name || host}</Text>;
}

export function SpacesAgentsSidebar(view: PluginSidebarViewProps) {
  const zh = useTranslation(messages).locale.toLowerCase().startsWith('zh');
  const hosts = useHosts();
  const hostLabels = new Map(hosts.map(host => [host.serverId, host.label]));
  const online = new Set(hosts.filter(host => host.status === 'online').map(host => host.serverId));
  const workspaces = useWorkspaces({ where: workspace => !workspace.background && !workspace.archivingAt, groupBy: workspace => workspace.hostId, orderBy: 'name' });
  const visibleWorkspaces = new Map(workspaces.flatMap(group => group.items.map(ref => [ref.key, ref] as const)));
  const agentGroups = useAgents({
    where: agent => !agent.background && agent.status !== 'closed' && online.has(agent.hostId) && visibleWorkspaces.has(agent.workspace.key),
    orderBy: compareAgentActivity,
    groupBy: agentGroupKey,
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (host: PluginHostSummary) => open[host.serverId] ?? (host.status === 'online' && (!view.active.workspace || view.active.workspace.hostId === host.serverId));
  const spaceRows: SpaceRow[] = hosts.flatMap(host => [
    { key: `host:${host.serverId}`, host },
    ...(host.status === 'online' && isOpen(host) ? (workspaces.find(group => group.key === host.serverId)?.items ?? []).map(ref => ({ key: `workspace:${ref.key}`, ref })) : []),
  ]);
  const c = view.theme.colors;
  return <View style={styles.root}>
    <View style={[styles.pane, { flex: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: c.foregroundMuted }]}>{zh ? '工作区' : 'Spaces'}</Text>
      <FlatList style={styles.list} data={spaceRows} keyExtractor={item => item.key} renderItem={({ item }) => {
        if ('ref' in item) return <WorkspaceRow reference={item.ref} view={view} />;
        const { host } = item;
        const available = host.status === 'online';
        const expanded = available && isOpen(host);
        const status = available ? (zh ? '在线' : 'Online') : host.status === 'connecting' ? (zh ? '连接中' : 'Connecting') : (zh ? '离线' : 'Offline');
        return <FeedbackPressable theme={view.theme} accessibilityRole="button" accessibilityLabel={`${host.label}, ${status}`} accessibilityState={{ expanded, disabled: !available }} disabled={!available} onPress={() => setOpen(previous => ({ ...previous, [host.serverId]: !expanded }))} style={[styles.row, { minHeight: view.layout.compact ? 44 : 34 }]}>
          <Glyph name="server" color={c.foregroundMuted} />
          <Text numberOfLines={1} style={[styles.main, { color: c.foreground }]}>{host.label}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: available ? c.statusSuccess : c.foregroundMuted }]}>{status}</Text>
          <Disclosure open={expanded} color={c.foregroundMuted} />
        </FeedbackPressable>;
      }} />
    </View>
    <AgentPane sections={agentGroups} workspaces={visibleWorkspaces} hosts={hostLabels} view={view} zh={zh} />
  </View>;
}

function AgentPane({ sections, workspaces, hosts, view, zh }: { sections: readonly { key: string; items: readonly AgentRef[] }[]; workspaces: ReadonlyMap<string, WorkspaceRef>; hosts: ReadonlyMap<string, string>; view: PluginSidebarViewProps; zh: boolean }) {
  const rows: AgentItem[] = [];
  const append = (items: readonly AgentRef[]) => rows.push(...items.map(ref => ({ key: `agent:${ref.key}`, ref })));
  for (const [key, title] of [['attention', zh ? '需要处理' : 'Needs attention'], ['running', zh ? '运行中' : 'Running']]) {
    const section = sections.find(group => group.key === key);
    if (section) {
      rows.push({ key, title });
      append(section.items);
    }
  }
  for (const section of sections) {
    if (!section.key.startsWith('workspace:')) continue;
    const workspace = workspaces.get(section.key.slice('workspace:'.length));
    if (!workspace) continue;
    rows.push({ key: section.key, workspace, host: hosts.get(workspace.hostId) ?? workspace.hostId });
    append(section.items);
  }
  const c = view.theme.colors;
  return <View style={[styles.pane, { flex: 3 }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: c.foregroundMuted }]}>Agents</Text>
    <FlatList style={styles.list} data={rows} keyExtractor={item => item.key} ListEmptyComponent={<Text style={[styles.label, { color: c.foregroundMuted }]}>{zh ? '没有可显示的会话' : 'No sessions to show'}</Text>} renderItem={({ item }) => 'ref' in item ? <AgentRow reference={item.ref} host={hosts.get(item.ref.hostId) ?? item.ref.hostId} view={view} zh={zh} /> : 'workspace' in item ? <WorkspaceHeading reference={item.workspace} host={item.host} view={view} /> : <Text accessibilityRole="header" style={[styles.label, { color: c.foregroundMuted }]}>{item.title}</Text>} />
  </View>;
}
