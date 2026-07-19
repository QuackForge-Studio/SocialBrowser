export const DASHBOARD_VERSION = "0.1.0";export type DashboardView = "calendar" | "analytics" | "settings";export interface NavigationState {activeView: DashboardView;activeTabId: string | null;}
