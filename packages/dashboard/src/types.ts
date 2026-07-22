/** Dashboard view identifiers */
export type DashboardView = 'profiles' | 'workspaces' | 'proxies' | 'calendar' | 'analytics' | 'settings';

export interface BrowserProfile {
  id: string;
  name: string;
  color: string;
  icon: string;
  groupId: string;
  partition: string;
  proxyUrl?: string;
  userAgent?: string;
  createdAt: number;
  lastOpenedAt: number;
}

/** A platform tab entry */
export interface PlatformTab {
  id: string;
  label: string;
  platform: string;
  url?: string;
  active?: boolean;
  favicon?: string;
  isLoading?: boolean;
}

/** Navigation state for the ShellView */
export interface NavigationState {
  activeView: DashboardView;
  activeTabId: string | null;
  tabs: PlatformTab[];
}

/** Post from database */
export interface Post {
  id: string;
  accountId: string;
  platformPostId: string;
  contentText?: string;
  mediaRefs?: string;
  platform: string;
  authorHandle?: string;
  publishedAt?: string;
  capturedAt: string;
  contentType?: string;
  compositeScore?: number;
  engagementScore?: number;
}

/** Draft item */
export interface Draft {
  id: string;
  accountId: string;
  generatedText?: string;
  sourcePrompt?: string;
  ragContextIds?: string;
  predictedScore?: number;
  scheduledDate?: string;
  publishedAt?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** RAG context post for draft review */
export interface ContextPost {
  postId: string;
  contentText?: string;
  engagementScore?: number;
  compositeScore?: number;
  similarity?: number;
}

/** Generated draft result */
export interface GeneratedDraft {
  draftId: string;
  id: string;
  accountId: string;
  generatedText: string;
  sourcePrompt: string;
  ragContextIds: string[];
  predictedScore?: number;
  status: string;
  ragUsed: boolean;
  contextPosts: ContextPost[];
  createdAt: string;
}

/** Account from database */
export interface Account {
  id: string;
  platform: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  sessionPartition: string;
  adapterVersion?: number;
  createdAt: string;
  updatedAt: string;
}

/** Workspace type */
export interface Workspace {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** TabGroup type */
export interface TabGroup {
  id: string;
  workspaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** GroupAccount with account info */
export interface GroupAccountInfo {
  id: string;
  groupId: string;
  accountId: string;
  sortOrder: number;
  createdAt: string;
  platform?: string;
  handle?: string;
  displayName?: string;
  sessionPartition?: string;
}

/** GroupTab */
export interface GroupTab {
  id: string;
  groupId: string;
  platform: string;
  accountId: string;
  url?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Audit event record */
export interface AuditEvent {
  id: string;
  eventType: string;
  actorId: string | null;
  targetId: string | null;
  platform: string | null;
  outcome: string | null;
  limitClass: string | null;
  metadataJson: string | null;
  createdAt: string;
}

/** Dashboard IPC API exposed via contextBridge */
export interface DashboardBridge {
  getAccounts: () => Promise<Account[]>;
  getPosts: (params?: { accountId?: string; date?: string; limit?: number; offset?: number }) => Promise<Post[]>;
  getAnalytics: (params?: { accountId?: string }) => Promise<AnalyticsData>;
  getHeatmap: (params?: { accountId?: string }) => Promise<HeatmapCellData[]>;
  createDraft: (params: { accountId: string; sourcePrompt?: string; scheduledDate?: string }) => Promise<Draft>;
  generateDraft: (params: { accountId: string; prompt: string; brief?: string }) => Promise<GeneratedDraft>;
  getDrafts: (params?: { accountId?: string; date?: string; status?: string }) => Promise<Draft[]>;
  updateDraft: (params: { id: string; generatedText?: string; sourcePrompt?: string; scheduledDate?: string; status?: string; predictedScore?: number | null }) => Promise<Draft>;
  deleteDraft: (params: { id: string }) => Promise<{ deleted: boolean }>;
  getSettings: () => Promise<Record<string, string>>;
  updateSettings: (settings: Record<string, unknown>) => Promise<void>;
  getKeyStatus: () => Promise<{ provider: string; configured: boolean }>;
  navigateTo: (params: { platform: string; accountId: string; url?: string }) => Promise<unknown>;
  prefillCompose: (params: { platform: string; accountId: string; text: string }) => Promise<unknown>;
  copyToClipboard: (params: { text: string }) => Promise<unknown>;

  // ===== Workspace & Group Management APIs =====
  getWorkspaces: () => Promise<Workspace[]>;
  createWorkspace: (params: { name?: string }) => Promise<Workspace>;
  renameWorkspace: (params: { id: string; name: string }) => Promise<{ updated: boolean }>;
  deleteWorkspace: (params: { id: string }) => Promise<{ deleted: boolean }>;
  reorderWorkspaces: (params: { ids: string[] }) => Promise<{ reordered: boolean }>;
  getTabGroups: (params?: { workspaceId?: string }) => Promise<TabGroup[]>;
  createTabGroup: (params: { workspaceId: string; name?: string }) => Promise<TabGroup>;
  renameTabGroup: (params: { id: string; name: string }) => Promise<{ updated: boolean }>;
  deleteTabGroup: (params: { id: string }) => Promise<{ deleted: boolean }>;
  reorderTabGroups: (params: { ids: string[] }) => Promise<{ reordered: boolean }>;
  getGroupAccounts: (params?: { groupId?: string }) => Promise<GroupAccountInfo[]>;
  addAccountToGroup: (params: { groupId: string; accountId: string }) => Promise<{ id: string; alreadyMember?: boolean }>;
  removeAccountFromGroup: (params: { groupId: string; accountId: string }) => Promise<{ removed: boolean }>;
  reorderGroupAccounts: (params: { groupId: string; accountIds: string[] }) => Promise<{ reordered: boolean }>;
  getGroupTabs: (params?: { groupId?: string }) => Promise<GroupTab[]>;
  addGroupTab: (params: { groupId: string; platform: string; accountId: string; url?: string }) => Promise<GroupTab>;
  removeGroupTab: (params: { id: string }) => Promise<{ removed: boolean }>;
  reorderGroupTabs: (params: { groupId: string; tabIds: string[] }) => Promise<{ reordered: boolean }>;

  // ===== Workspace Navigation APIs (trusted native, always active) =====
  getWorkspaceState: () => Promise<{ activeWorkspaceId: string | null; activeGroupId: string | null }>;
  setActiveGroup: (params: { workspaceId: string; groupId: string }) => Promise<{ success: boolean; error?: string }>;
  openTab: (params: { platform: string; accountId: string }) => Promise<{ success: boolean; error?: string; tabId?: string }>;
  closeTab: (params: { tabId: string }) => Promise<{ success: boolean; error?: string }>;
  showDashboard: () => Promise<{ success: boolean }>;
  getWorkspaceTabs: () => Promise<unknown[]>;
  handleMembershipRemoved: (params: { groupId: string; accountId: string }) => Promise<{ success: boolean; error?: string }>;
  handleGroupDeleted: (params: { groupId: string }) => Promise<{ success: boolean; error?: string }>;
  handleWorkspaceDeleted: (params: { workspaceId: string }) => Promise<{ success: boolean; error?: string }>;

  // ===== Browser Profile APIs =====
  getProfiles: () => Promise<BrowserProfile[]>;
  createProfile: (params: { name: string; color?: string; icon?: string; groupId?: string; proxyUrl?: string }) => Promise<BrowserProfile>;
  deleteProfile: (params: { id: string }) => Promise<{ deleted: boolean }>;
  launchBrowserProfile: (params: { profileId: string; url?: string }) => Promise<{ success: boolean; error?: string }>;
  openDefaultBrowserTab: (params?: { url?: string }) => Promise<{ success: boolean; error?: string }>;
  getBrowserTabs: () => Promise<PlatformTab[]>;
  getTabUrl: (params: { tabId: string }) => Promise<{ url: string }>;
  navigateTab: (params: { tabId: string; url: string }) => Promise<{ success: boolean }>;
  closeBrowserTab: (params: { tabId: string }) => Promise<{ success: boolean; error?: string }>;

  // ===== Compliance APIs =====
  acknowledgeAccount: (params: { accountId: string }) => Promise<{ acknowledged: boolean }>;
  checkAcknowledged: (params: { accountId: string }) => Promise<{ acknowledged: boolean }>;
  getAuditEvents: (params?: { eventType?: string; actorId?: string; limit?: number; offset?: number }) => Promise<AuditEvent[]>;
}

declare global {
  interface Window {
    __socialBrowserDashboard?: DashboardBridge;
  }
}

/** Analytics trend data point */
export interface TrendDataPoint {
  date: string;
  avgScore: number | null;
  postCount: number;
}

/** Analytics post (top/bottom) */
export interface AnalyticsPost {
  id: string;
  contentText?: string;
  publishedAt?: string;
  authorHandle?: string;
  platform: string;
  compositeScore?: number;
  engagementScore?: number;
}

/** Analytics response from worker */
export interface AnalyticsData {
  totalPosts: number;
  trendData: TrendDataPoint[];
  topPosts: AnalyticsPost[];
  bottomPosts: AnalyticsPost[];
}

/** Heatmap cell from worker */
export interface HeatmapCellData {
  id: string;
  accountId: string;
  contentType: string;
  hourOfDay: number;
  dayOfWeek: number;
  avgEngagementScore: number | null;
  sampleSize: number;
  confidence: number;
  updatedAt: string;
}

/** Minimum posts required for meaningful analytics */
export const MIN_ANALYTICS_POSTS = 3;
