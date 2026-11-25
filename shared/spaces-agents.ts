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

export function agentGroupKey(agent: Agent) {
  const state = agentState(agent);
  return state === 'idle' ? `workspace:${agent.workspace.key}` : state === 'running' ? 'running' : 'attention';
}

export function compareAgentActivity(a: Agent, b: Agent) {
  return Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt) || a.ref.key.localeCompare(b.ref.key);
}
