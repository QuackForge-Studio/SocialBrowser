export const DASHBOARD_VERSION = "0.2.1";export type DashboardView = "calendar" | "analytics" | "settings";export interface NavigationState {activeView: DashboardView;activeTabId: string | null;}
