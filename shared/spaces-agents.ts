export type AgentSortMode = 'space' | 'priority';
export type AgentPriorityBucket = 'attention' | 'running' | 'idle';

type Agent = {
  ref: { key: string };
  workspace: { key: string };
  status: string;
  requiresAttention: boolean;
  attentionReason: string | null;
  lastActivityAt: string;
};

export function agentState(agent: Agent) {
  if (agent.requiresAttention && agent.attentionReason === 'permission') return 'permission';
  if (agent.status === 'error' || agent.requiresAttention && agent.attentionReason === 'error') return 'error';
  if (agent.requiresAttention) return 'updated';
  if (agent.status === 'running' || agent.status === 'initializing') return 'running';
  return 'idle';
}

export function agentPriorityBucket(agent: Agent): AgentPriorityBucket {
  const state = agentState(agent);
  return state === 'idle' ? 'idle' : state === 'running' ? 'running' : 'attention';
}

export function isExecutingAgent(agent: Agent & { background?: boolean }) {
  return !agent.background && agentState(agent) === 'running';
}

export function isAttentionAgent(agent: Agent & { background?: boolean }) {
  return !agent.background && agentPriorityBucket(agent) === 'attention';
}

export function compareSpaces(a: { name: string; pinnedAt: string | null }, b: { name: string; pinnedAt: string | null }) {
  if (a.pinnedAt && b.pinnedAt) return Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt) || a.name.localeCompare(b.name);
  if (a.pinnedAt || b.pinnedAt) return a.pinnedAt ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function agentGroupKey(agent: Agent) {
  return agent.workspace.key;
}

export function directoryName(directory: string) {
  return directory.split(/[\\/]+/).filter(Boolean).at(-1) ?? directory;
}

export function defaultHostFirst<T extends { serverId: string }>(hosts: readonly T[], defaultId: string | null): readonly T[] {
  const host = hosts.find(item => item.serverId === defaultId);
  return host ? [host, ...hosts.filter(item => item !== host)] : hosts;
}

export function compareAgentActivity(a: Agent, b: Agent) {
  return Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt) || a.ref.key.localeCompare(b.ref.key);
}

export function compareAgentPriority(a: Agent, b: Agent) {
  const rank: Record<AgentPriorityBucket, number> = { attention: 0, running: 1, idle: 2 };
  return rank[agentPriorityBucket(a)] - rank[agentPriorityBucket(b)] || compareAgentActivity(a, b);
}

export function spaceTitle(workspace: { title: string | null; name: string; directory: string }) {
  return workspace.title?.trim() || directoryName(workspace.directory) || workspace.name;
}

export function showSpaceDirectory(title: string, directory: string) {
  return directoryName(directory) !== title;
}

export function agentLocation(workspace: { title: string | null; name: string; directory: string } | null | undefined, host: string, includeSpace: boolean) {
  if (!workspace) return host;
  const dir = directoryName(workspace.directory);
  if (!includeSpace) return dir ? `${dir} · ${host}` : host;
  const title = spaceTitle(workspace);
  if (!showSpaceDirectory(title, workspace.directory)) return dir ? `${dir} · ${host}` : host;
  return [shortSpaceTitle(title), dir, host].filter(Boolean).join(' · ');
}

export function spaceHeadingMeta(workspace: { title: string | null; name: string; directory: string } | null | undefined, host: string) {
  if (!workspace) return host;
  const dir = directoryName(workspace.directory);
  const shown = shortSpaceTitle(spaceTitle(workspace));
  return dir && dir !== shown ? `${dir} · ${host}` : host;
}

const spaceTitleSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;

export function shortSpaceTitle(title: string) {
  const characters = spaceTitleSegmenter ? Array.from(spaceTitleSegmenter.segment(title), part => part.segment) : Array.from(title);
  return characters.length <= 10 ? title : characters.slice(0, 9).join('') + '…';
}

export function agentGroupRows<T extends { key: string }>(sections: readonly { key: string; items: readonly T[] }[], pinned: (key: string) => boolean, open: (key: string) => boolean) {
  return [...sections].sort((a, b) => Number(pinned(b.key)) - Number(pinned(a.key))).flatMap(section => [
    { key: 'space:' + section.key, workspaceKey: section.key, count: section.items.length },
    ...(open(section.key) ? section.items.map(ref => ({ key: 'agent:' + ref.key, ref })) : []),
  ]);
}

const bucketOrder: readonly AgentPriorityBucket[] = ['attention', 'running', 'idle'];

export function agentPriorityRows<T extends { key: string }>(sections: readonly { key: string; items: readonly T[] }[]) {
  const byBucket = new Map(sections.map(section => [section.key, section.items]));
  return bucketOrder.flatMap(bucket => {
    const items = byBucket.get(bucket);
    if (!items?.length) return [];
    return [
      { key: 'bucket:' + bucket, bucket, count: items.length },
      ...items.map(ref => ({ key: 'agent:' + ref.key, ref })),
    ];
  });
}

export function isVerticalSplitDrag(dx: number, dy: number) {
  return Math.abs(dy) > 4 && Math.abs(dy) > Math.abs(dx);
}

export function resizeSplit(start: number, dy: number, height: number) {
  return Number.isFinite(dy) && Number.isFinite(height) && height > 0 ? Math.max(0.2, Math.min(0.8, start + dy / height)) : start;
}
