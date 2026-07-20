/**
 * Workspace & Group Handlers
 *
 * Handlers for workspace/group CRUD operations. These run in the worker thread
 * and manage the persistent workspace model including workspaces, tab groups,
 * group-account memberships, and group tabs.
 */

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { WorkerResponse } from '../index';

export type SendFn = (msg: WorkerResponse) => void;

// ===== Workspace Handlers =====

export function getWorkspacesHandler(db: Database.Database, send: SendFn, msgId: string): void {
  try {
    const rows = db.prepare(
      "SELECT id, name, sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt " +
      "FROM workspaces ORDER BY sort_order ASC, created_at ASC"
    ).all();
    send({ id: msgId, success: true, data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Get workspaces error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function createWorkspaceHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const id = payload?.id || ("workspace-" + uuidv4());
    const name = payload?.name || "New Workspace";
    const now = new Date().toISOString();
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM workspaces"
    ).get() as { next: number };
    db.prepare(
      "INSERT INTO workspaces (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, name, maxOrder.next, now, now);
    const workspace = db.prepare(
      "SELECT id, name, sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt " +
      "FROM workspaces WHERE id = ?"
    ).get(id);
    send({ id: msgId, success: true, data: workspace });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Create workspace error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function renameWorkspaceHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const now = new Date().toISOString();
    db.prepare("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?").run(payload.name, now, payload.id);
    send({ id: msgId, success: true, data: { updated: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Rename workspace error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function deleteWorkspaceHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    db.prepare("DELETE FROM tab_groups WHERE workspace_id = ?").run(payload.id);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(payload.id);
    send({ id: msgId, success: true, data: { deleted: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Delete workspace error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function reorderWorkspacesHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const ids: string[] = payload?.ids || [];
    const stmt = db.prepare("UPDATE workspaces SET sort_order = ?, updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();
    const runAll = db.transaction(() => {
      for (let i = 0; i < ids.length; i++) { stmt.run(i, now, ids[i]); }
    });
    runAll();
    send({ id: msgId, success: true, data: { reordered: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Reorder workspaces error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

// ===== Tab Group Handlers =====

export function getTabGroupsHandler(db: Database.Database, send: SendFn, msgId: string, payload?: any): void {
  try {
    let sql = "SELECT id, workspace_id as workspaceId, name, sort_order as sortOrder, " +
      "created_at as createdAt, updated_at as updatedAt FROM tab_groups";
    const params: unknown[] = [];
    if (payload?.workspaceId) {
      sql += " WHERE workspace_id = ?";
      params.push(payload.workspaceId);
    }
    sql += " ORDER BY sort_order ASC, created_at ASC";
    send({ id: msgId, success: true, data: db.prepare(sql).all(...params) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Get tab groups error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function createTabGroupHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const id = payload?.id || ("group-" + uuidv4());
    const workspaceId = payload?.workspaceId;
    const name = payload?.name || "New Group";
    const now = new Date().toISOString();
    if (!workspaceId) {
      send({ id: msgId, success: false, error: "workspaceId is required" });
      return;
    }
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM tab_groups WHERE workspace_id = ?"
    ).get(workspaceId) as { next: number };
    db.prepare(
      "INSERT INTO tab_groups (id, workspace_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, workspaceId, name, maxOrder.next, now, now);
    const group = db.prepare(
      "SELECT id, workspace_id as workspaceId, name, sort_order as sortOrder, " +
      "created_at as createdAt, updated_at as updatedAt FROM tab_groups WHERE id = ?"
    ).get(id);
    send({ id: msgId, success: true, data: group });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Create tab group error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function renameTabGroupHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const now = new Date().toISOString();
    db.prepare("UPDATE tab_groups SET name = ?, updated_at = ? WHERE id = ?").run(payload.name, now, payload.id);
    send({ id: msgId, success: true, data: { updated: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Rename tab group error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function deleteTabGroupHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    db.prepare("DELETE FROM tab_groups WHERE id = ?").run(payload.id);
    send({ id: msgId, success: true, data: { deleted: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Delete tab group error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function reorderTabGroupsHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const ids: string[] = payload?.ids || [];
    const stmt = db.prepare("UPDATE tab_groups SET sort_order = ?, updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();
    const runAll = db.transaction(() => {
      for (let i = 0; i < ids.length; i++) { stmt.run(i, now, ids[i]); }
    });
    runAll();
    send({ id: msgId, success: true, data: { reordered: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Reorder tab groups error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

// ===== Group-Account Membership Handlers =====

export function getGroupAccountsHandler(db: Database.Database, send: SendFn, msgId: string, payload?: any): void {
  try {
    let sql = "SELECT ga.id, ga.group_id as groupId, ga.account_id as accountId, " +
      "ga.sort_order as sortOrder, ga.created_at as createdAt, " +
      "a.platform, a.handle, a.display_name as displayName, a.session_partition as sessionPartition " +
      "FROM group_accounts ga JOIN accounts a ON ga.account_id = a.id";
    const params: unknown[] = [];
    if (payload?.groupId) {
      sql += " WHERE ga.group_id = ?";
      params.push(payload.groupId);
    }
    sql += " ORDER BY ga.sort_order ASC, ga.created_at ASC";
    send({ id: msgId, success: true, data: db.prepare(sql).all(...params) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Get group accounts error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function addAccountToGroupHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const groupId = payload?.groupId;
    const accountId = payload?.accountId;
    if (!groupId || !accountId) {
      send({ id: msgId, success: false, error: "groupId and accountId are required" });
      return;
    }
    const existing = db.prepare(
      "SELECT id FROM group_accounts WHERE group_id = ? AND account_id = ?"
    ).get(groupId, accountId) as any;
    if (existing) {
      send({ id: msgId, success: true, data: { id: existing.id, alreadyMember: true } });
      return;
    }
    const id = "gm-" + uuidv4();
    const now = new Date().toISOString();
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM group_accounts WHERE group_id = ?"
    ).get(groupId) as { next: number };
    db.prepare(
      "INSERT INTO group_accounts (id, group_id, account_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, groupId, accountId, maxOrder.next, now);
    send({ id: msgId, success: true, data: { id, groupId, accountId, sortOrder: maxOrder.next } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Add account to group error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function removeAccountFromGroupHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    db.prepare("DELETE FROM group_accounts WHERE group_id = ? AND account_id = ?").run(payload.groupId, payload.accountId);
    db.prepare("DELETE FROM group_tabs WHERE group_id = ? AND account_id = ?").run(payload.groupId, payload.accountId);
    send({ id: msgId, success: true, data: { removed: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Remove account from group error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function reorderGroupAccountsHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const groupId = payload?.groupId;
    const accountIds: string[] = payload?.accountIds || [];
    const stmt = db.prepare("UPDATE group_accounts SET sort_order = ? WHERE group_id = ? AND account_id = ?");
    const runAll = db.transaction(() => {
      for (let i = 0; i < accountIds.length; i++) { stmt.run(i, groupId, accountIds[i]); }
    });
    runAll();
    send({ id: msgId, success: true, data: { reordered: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Reorder group accounts error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

// ===== Group Tab Handlers =====

export function getGroupTabsHandler(db: Database.Database, send: SendFn, msgId: string, payload?: any): void {
  try {
    let sql = "SELECT id, group_id as groupId, platform, account_id as accountId, url, " +
      "sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt " +
      "FROM group_tabs";
    const params: unknown[] = [];
    if (payload?.groupId) {
      sql += " WHERE group_id = ?";
      params.push(payload.groupId);
    }
    sql += " ORDER BY sort_order ASC, created_at ASC";
    send({ id: msgId, success: true, data: db.prepare(sql).all(...params) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Get group tabs error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function addGroupTabHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const groupId = payload?.groupId;
    const platform = payload?.platform;
    const accountId = payload?.accountId;
    if (!groupId || !platform || !accountId) {
      send({ id: msgId, success: false, error: "groupId, platform, and accountId are required" });
      return;
    }
    const id = "gt-" + uuidv4();
    const now = new Date().toISOString();
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM group_tabs WHERE group_id = ?"
    ).get(groupId) as { next: number };
    db.prepare(
      "INSERT INTO group_tabs (id, group_id, platform, account_id, url, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, groupId, platform, accountId, (payload?.url || null), maxOrder.next, now, now);
    const tab = db.prepare(
      "SELECT id, group_id as groupId, platform, account_id as accountId, url, " +
      "sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt FROM group_tabs WHERE id = ?"
    ).get(id);
    send({ id: msgId, success: true, data: tab });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Add group tab error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function removeGroupTabHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    db.prepare("DELETE FROM group_tabs WHERE id = ?").run(payload.id);
    send({ id: msgId, success: true, data: { removed: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Remove group tab error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}

export function reorderGroupTabsHandler(db: Database.Database, send: SendFn, msgId: string, payload: any): void {
  try {
    const groupId = payload?.groupId;
    const tabIds: string[] = payload?.tabIds || [];
    const stmt = db.prepare("UPDATE group_tabs SET sort_order = ?, updated_at = ? WHERE group_id = ? AND id = ?");
    const now = new Date().toISOString();
    const runAll = db.transaction(() => {
      for (let i = 0; i < tabIds.length; i++) { stmt.run(i, now, groupId, tabIds[i]); }
    });
    runAll();
    send({ id: msgId, success: true, data: { reordered: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Workspace] Reorder group tabs error:", msg);
    send({ id: msgId, success: false, error: msg });
  }
}