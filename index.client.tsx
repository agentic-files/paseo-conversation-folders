import type { PluginClientContext } from '@getpaseo/plugin/client';
import { SidebarWithTabs } from './client/sidebar';
import { SpacesAgentsSidebar } from './client/spaces-agents-sidebar';
import { messages } from './client/i18n';
export default function contribute(client: PluginClientContext) {
  const removeFolders = client.addSidebarView({ id: 'folders', title: messages.message('viewTitle'), description: messages.message('viewDescription'), Component: SidebarWithTabs });
  const removeSpaces = client.addSidebarView({ id: 'spaces-agents', title: messages.message('spacesTitle'), description: messages.message('spacesDescription'), Component: SpacesAgentsSidebar });
  return () => { removeSpaces(); removeFolders(); };
}
