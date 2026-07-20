/** Dashboard view identifiers */
export type DashboardView = 'calendar' | 'analytics' | 'settings';

/** A platform tab entry */
export interface PlatformTab {
  id: string;
  label: string;
  platform: string;
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

/** Dashboard IPC API exposed via contextBridge */
export interface DashboardBridge {
  getAccounts: () => Promise<Account[]>;
  getPosts: (params?: { accountId?: string; date?: string; limit?: number; offset?: number }) => Promise<Post[]>;
  getAnalytics: (params?: { accountId?: string }) => Promise<any>;
  getHeatmap: (params?: { accountId?: string }) => Promise<any>;
  createDraft: (params: { accountId: string; sourcePrompt?: string; scheduledDate?: string }) => Promise<Draft>;
  generateDraft: (params: { accountId: string; prompt: string; brief?: string }) => Promise<GeneratedDraft>;
  getDrafts: (params?: { accountId?: string; date?: string; status?: string }) => Promise<Draft[]>;
  updateDraft: (params: { id: string; generatedText?: string; sourcePrompt?: string; scheduledDate?: string; status?: string; predictedScore?: number | null }) => Promise<Draft>;
  deleteDraft: (params: { id: string }) => Promise<any>;
  getSettings: () => Promise<Record<string, string>>;
  updateSettings: (settings: Record<string, unknown>) => Promise<void>;
  getKeyStatus: () => Promise<{ provider: string; configured: boolean }>;
  navigateTo: (params: { platform: string; accountId: string; url?: string }) => void;
  prefillCompose: (params: { platform: string; accountId: string; text: string }) => void;
}

declare global {
  interface Window {
    __socialBrowserDashboard?: DashboardBridge;
  }
}
