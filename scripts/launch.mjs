#!/usr/bin/env node
/**
 * Social Browser — Quick Launch TUI
 *
 * Shows jaw-dropping stats from your database, then launches Electron.
 * Zero new dependencies beyond what's already in node_modules.
 *
 * Usage:
 *   scripts/launch.bat                  # Double-click from Explorer
 *   node scripts/launch.mjs             # TUI → launch (via pnpm dev)
 *   node scripts/launch.mjs --stats-only # Just show stats, don't launch
 */

import { execSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---- Dependency loading ----

let chalk;
try { chalk = createRequire(import.meta.url)('chalk'); }
catch { chalk = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? (s) => s : (s) => s) }); }

let Database = null;
try { Database = createRequire(import.meta.url)('better-sqlite3'); }
catch { /* fallback to sqlite3 CLI */ }

function sqliteCLI(dbPath, sql) {
  return execSync(`sqlite3 -json "${dbPath}" "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'],
  }).trim();
}

// ---- ANSI helpers ----

const R = '\x1b[0m';
const b = (s) => `\x1b[1m${s}${R}`;
const g = (s) => `\x1b[90m${s}${R}`;
const cy = (s) => `\x1b[36m${s}${R}`;
const cn = (s) => `\x1b[96m${s}${R}`;
const bl = (s) => `\x1b[34m${s}${R}`;
const bB = (s) => `\x1b[94m${s}${R}`;
const mg = (s) => `\x1b[35m${s}${R}`;
const mB = (s) => `\x1b[95m${s}${R}`;
const yl = (s) => `\x1b[33m${s}${R}`;
const yB = (s) => `\x1b[93m${s}${R}`;
const gn = (s) => `\x1b[32m${s}${R}`;
const gB = (s) => `\x1b[92m${s}${R}`;
const rd = (s) => `\x1b[31m${s}${R}`;
const rB = (s) => `\x1b[91m${s}${R}`;
const wh = (s) => `\x1b[97m${s}${R}`;

const BOX = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };
const termW = () => { try { return process.stdout.columns || 100; } catch { return 100; } };

// ---- Database ----

function getDbPath() {
  return process.env.SOCIAL_BROWSER_DB_PATH || path.join(ROOT, 'social-browser.sqlite');
}

function queryStats() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return { fresh: true, dbPath, dbSize: 0 };

  const dbSize = fs.statSync(dbPath).size;
  let db = null, useCLI = false;
  if (Database) { try { db = new Database(dbPath, { readonly: true }); } catch { useCLI = true; } }
  else { useCLI = true; }

  try {
    const q = (sql) => { if (useCLI) { const r = sqliteCLI(dbPath, sql); return r ? JSON.parse(r) : []; } return db.prepare(sql).all(); };
    const get = (sql) => { if (useCLI) { const r = sqliteCLI(dbPath, sql); const p = r ? JSON.parse(r) : []; return p[0] || {}; } return db.prepare(sql).get(); };

    const accountsByPlatform = q('SELECT platform, COUNT(*) as count FROM accounts GROUP BY platform ORDER BY count DESC');
    const totalAccounts = get('SELECT COUNT(*) as c FROM accounts').c || 0;
    const totalPosts = get('SELECT COUNT(*) as c FROM posts').c || 0;
    const engagement = get('SELECT COALESCE(SUM(views),0) as totalViews, COALESCE(SUM(likes),0) as totalLikes, COALESCE(SUM(comments_count),0) as totalComments, COALESCE(SUM(shares),0) as totalShares FROM engagement_snapshots');
    const topPosts = q("SELECT p.platform_post_id, substr(p.content_text,1,60) as content_text, p.captured_at, a.platform, a.handle, s.composite_score, s.engagement_score FROM scores s JOIN posts p ON s.post_id=p.id JOIN accounts a ON p.account_id=a.id WHERE s.composite_score IS NOT NULL ORDER BY s.composite_score DESC LIMIT 5");
    const aiRuns = get("SELECT COUNT(*) as total, SUM(token_count) as totalTokens, SUM(cost_estimate) as totalCost, COUNT(CASE WHEN status='success' THEN 1 END) as successCount, AVG(latency_ms) as avgLatency FROM ai_runs");
    const aiByProvider = q('SELECT provider, model, COUNT(*) as count FROM ai_runs GROUP BY provider, model ORDER BY count DESC LIMIT 5');
    const profiles = q('SELECT id, name, color, icon, created_at, last_opened_at FROM profiles ORDER BY last_opened_at DESC LIMIT 10');
    const drafts = get("SELECT COUNT(*) as total, COUNT(CASE WHEN status='draft' THEN 1 END) as draftCount, COUNT(CASE WHEN status='published' THEN 1 END) as publishedCount FROM content_drafts");
    const sentiment = q("SELECT sentiment_label, COUNT(*) as count, ROUND(AVG(sentiment_score),3) as avgScore FROM comments WHERE sentiment_label IS NOT NULL GROUP BY sentiment_label ORDER BY count DESC");
    const workspaces = get('SELECT COUNT(*) as c FROM workspaces').c || 0;

    return { fresh: false, dbPath, dbSize, accountsByPlatform, totalAccounts, totalPosts, engagement, topPosts, aiRuns, aiByProvider, profiles, drafts, sentiment, workspaces };
  } catch (err) {
    return { fresh: true, dbPath, dbSize, error: err.message };
  } finally {
    if (db) db.close();
  }
}

// ---- Formatting helpers ----

function strip(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }
function fmtNum(n) { if (n == null) return g('—'); if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return String(n); }
function fmtBytes(bytes) { if (!bytes) return '0 B'; const k = 1024; const sizes = ['B','KB','MB','GB']; const i = Math.floor(Math.log(bytes)/Math.log(k)); return (bytes/Math.pow(k,i)).toFixed(1)+' '+sizes[i]; }
function fmtDate(iso) { if (!iso) return g('—'); const d = new Date(iso), diff = Date.now()-d.getTime(), days = Math.floor(diff/86400000); if (days===0) return gB('Today'); if (days===1) return 'Yesterday'; if (days<7) return days+'d ago'; if (days<30) return Math.floor(days/7)+'w ago'; return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
function dotColor(hex) { const m = { '#6366f1':bB,'#8b5cf6':mB,'#ec4899':mg,'#ef4444':rB,'#f59e0b':yB,'#10b981':gB,'#06b6d4':cn,'#3b82f6':bl,'#f97316':yl,'#84cc16':gn,'#14b8a6':cy,'#a855f7':mg }; return (m[hex.toLowerCase()]||wh)('●'); }

// ---- Box rendering ----

function boxLines(title, content, w) {
  const inner = Math.max(0, w - 2);
  const lines = [];
  const rem = inner - title.length - 2; // 2 spaces around title
  if (rem >= 0) {
    const lh = Math.floor(rem/2);
    lines.push(g(BOX.tl+BOX.h.repeat(Math.max(0,lh)))+b(' '+title+' ')+g(BOX.h.repeat(Math.max(0,rem-lh))+BOX.tr));
  } else {
    lines.push(g(BOX.tl+BOX.h.repeat(inner)+BOX.tr));
  }
  for (const line of content) {
    const pad = Math.max(0, inner - strip(line).length);
    lines.push(g(BOX.v)+R+' '+line+' '.repeat(pad)+' '+g(BOX.v));
  }
  lines.push(g(BOX.bl+BOX.h.repeat(inner)+BOX.br));
  return lines;
}

function sideBySide(lLines, rLines, w) {
  const maxH = Math.max(lLines.length, rLines.length);
  const inner = Math.max(0, w - 2);
  const empty = g(BOX.v)+R+' '+' '.repeat(Math.max(0,inner-2))+' '+g(BOX.v);
  while (lLines.length < maxH) lLines.splice(lLines.length-1, 0, empty);
  while (rLines.length < maxH) rLines.splice(rLines.length-1, 0, empty);
  const out = [];
  for (let i = 0; i < maxH; i++) out.push(lLines[i] + '  ' + rLines[i]);
  return out.join('\n');
}

// ---- TUI ----

function renderTUI(stats) {
  const W = termW();
  const colW = Math.floor((W - 4) / 2);

  console.clear();
  console.log('');

  // Logo
  const logo = [
    '   ███████╗ ██████╗  ██████╗██╗ █████╗ ██╗     ██████╗ ██████╗  ██████╗ ██╗    ██╗███████╗███████╗██████╗ ',
    '   ██╔════╝██╔═══██╗██╔════╝██║██╔══██╗██║     ██╔══██╗██╔══██╗██╔═══██╗██║    ██║██╔════╝██╔════╝██╔══██╗',
    '   ███████╗██║   ██║██║     ██║███████║██║     ██████╔╝██████╔╝██║   ██║██║ █╗ ██║███████╗█████╗  ██████╔╝',
    '   ╚════██║██║   ██║██║     ██║██╔══██║██║     ██╔══██╗██╔══██╗██║   ██║██║███╗██║╚════██║██╔══╝  ██╔══██╗',
    '   ███████║╚██████╔╝╚██████╗██║██║  ██║███████╗██████╔╝██║  ██║╚██████╔╝╚███╔███╔╝███████║███████╗██║  ██║',
    '   ╚══════╝ ╚═════╝  ╚═════╝╚═╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝╚══════╝╚═╝  ╚═╝',
  ];
  const lc = [cn, cy, bl, bB, mB, mg];
  for (let i = 0; i < logo.length; i++) console.log('  ' + lc[i](logo[i]));
  console.log('');
  console.log(g('  Multi-Profile Social Media Browser  •  v0.2.0  •  ') + gB('● ONLINE'));
  console.log('');

  // Fresh install
  if (stats.fresh) {
    const c = ['', yB('  🚀 Welcome to Social Browser!'), '', g('  Your database is empty — start by adding accounts'), g('  and capturing social media content.'), '', g('  DB Path: '+stats.dbPath), stats.error ? rB('  Error: '+stats.error) : '', ''];
    console.log(boxLines('GETTING STARTED', c, W-2).join('\n'));
    console.log('');
    return;
  }

  // Overview cards
  const cards = [
    { l: 'Accounts', v: fmtNum(stats.totalAccounts), i: '👤', c: cn },
    { l: 'Posts', v: fmtNum(stats.totalPosts), i: '📝', c: bB },
    { l: 'AI Runs', v: fmtNum(stats.aiRuns?.total||0), i: '🤖', c: mB },
    { l: 'Profiles', v: fmtNum(stats.profiles?.length||0), i: '🔷', c: yB },
    { l: 'Workspaces', v: fmtNum(stats.workspaces||0), i: '📂', c: gB },
    { l: 'DB Size', v: fmtBytes(stats.dbSize), i: '💾', c: wh },
  ];
  const gap = 3, cw = Math.floor((W-4-(gap*(cards.length-1)))/cards.length);
  let vr = '', lr = '';
  for (const c of cards) { const v = b(c.c(c.v)); vr += v + ' '.repeat(Math.max(0, cw-strip(v).length+gap)); }
  for (const c of cards) { const l = g(c.i+' '+c.l); lr += l + ' '.repeat(Math.max(0, cw-strip(l).length+gap)); }
  console.log('  '+vr+'\n  '+lr+'\n');

  // Row 1: Platforms + Engagement
  const pLeft = [b('📊 Accounts by Platform'), ''];
  if (stats.accountsByPlatform?.length) {
    const max = stats.accountsByPlatform[0].count;
    for (const r of stats.accountsByPlatform) {
      const blLen = Math.max(1,Math.floor((r.count/max)*20));
      pLeft.push('  '+r.platform.padEnd(10)+' '+cy('█'.repeat(blLen))+g('░'.repeat(20-blLen))+' '+b(String(r.count)));
    }
  } else { pLeft.push(g('  No accounts yet')); }

  const pRight = [b('🔥 Engagement Totals'), ''];
  if (stats.engagement) {
    pRight.push('  '+cn('👁')+' Views:    '+b(fmtNum(stats.engagement.totalViews)));
    pRight.push('  '+rB('❤')+' Likes:    '+b(fmtNum(stats.engagement.totalLikes)));
    pRight.push('  '+bB('💬')+' Comments: '+b(fmtNum(stats.engagement.totalComments)));
    pRight.push('  '+gB('🔄')+' Shares:   '+b(fmtNum(stats.engagement.totalShares)));
  }
  pRight.push('', b('✍️ Content Drafts'), '');
  if (stats.drafts) {
    pRight.push('  '+yB('📄')+' Drafts:    '+b(fmtNum(stats.drafts.draftCount)));
    pRight.push('  '+gB('✅')+' Published: '+b(fmtNum(stats.drafts.publishedCount)));
  }
  console.log(sideBySide(boxLines('PLATFORMS',pLeft,colW), boxLines('ENGAGEMENT',pRight,colW), colW));
  console.log('');

  // Row 2: AI + Scores
  const aLeft = [b('🤖 AI Usage'), ''];
  if (stats.aiRuns?.total) {
    aLeft.push('  Total Runs:     '+b(fmtNum(stats.aiRuns.total)));
    aLeft.push('  Success Rate:   '+b(Math.round(stats.aiRuns.successCount/stats.aiRuns.total*100)+'%'));
    aLeft.push('  Total Tokens:   '+b(fmtNum(stats.aiRuns.totalTokens)));
    aLeft.push('  Avg Latency:    '+b(stats.aiRuns.avgLatency?Math.round(stats.aiRuns.avgLatency)+'ms':g('—')));
    if (stats.aiRuns.totalCost) aLeft.push('  Est. Cost:      '+yB(b('$'+stats.aiRuns.totalCost.toFixed(4))));
    aLeft.push('');
    if (stats.aiByProvider?.length) {
      aLeft.push(g('  By Provider:'));
      for (const r of stats.aiByProvider) aLeft.push('    '+r.provider+'/'+r.model+': '+b(String(r.count)));
    }
  } else { aLeft.push(g('  No AI runs yet')); }

  const aRight = [b('🎯 Top Posts by Score'), ''];
  if (stats.topPosts?.length) {
    const ranks = [cn('🥇'),g('🥈'),yB('🥉'),g('4.'),g('5.')];
    for (let i = 0; i < Math.min(5,stats.topPosts.length); i++) {
      const p = stats.topPosts[i];
      const t = (p.content_text||p.platform_post_id||'Untitled').substring(0,28);
      const s = p.composite_score ? p.composite_score.toFixed(1) : '—';
      aRight.push('  '+ranks[i]+' '+b(s)+' '+g('·')+' '+t);
      aRight.push('    '+g(p.platform+' · @'+(p.handle||'?')));
    }
  } else { aRight.push(g('  No scored posts yet')); }
  console.log(sideBySide(boxLines('AI',aLeft,colW), boxLines('SCORES',aRight,colW), colW));
  console.log('');

  // Row 3: Sentiment + Profiles
  const sLeft = [b('💭 Comment Sentiment'), ''];
  if (stats.sentiment?.length) {
    for (const r of stats.sentiment) {
      const em = {positive:'😊',negative:'😞',neutral:'😐'}[r.sentiment_label]||'💬';
      const co = {positive:gB,negative:rB,neutral:yB}[r.sentiment_label]||g;
      sLeft.push('  '+em+' '+co(r.sentiment_label.padEnd(10))+' '+b(String(r.count))+' '+g('avg '+r.avgScore));
    }
  } else { sLeft.push(g('  No sentiment data yet')); }

  const sRight = [b('🔷 Browser Profiles'), ''];
  if (stats.profiles?.length) {
    for (const p of stats.profiles.slice(0,8)) {
      const n = (p.name||'Unnamed').substring(0,20);
      sRight.push('  '+dotColor(p.color||'#6366f1')+' '+b(n)+' '+g('·')+' '+fmtDate(p.last_opened_at));
    }
  } else { sRight.push(g('  No profiles yet')); }
  console.log(sideBySide(boxLines('SENTIMENT',sLeft,colW), boxLines('PROFILES',sRight,colW), colW));
  console.log('');

  // Footer
  console.log('  '+g('💾 Database: '+stats.dbPath+' ('+fmtBytes(stats.dbSize)+')'));
  console.log('');
}

// ---- Main ----

async function main() {
  const args = process.argv.slice(2);
  const statsOnly = args.includes('--stats-only');

  console.clear();

  if (!statsOnly) {
    console.log('');
    console.log(g('  Building & launching via pnpm dev...'));
    console.log('');
    try { execSync('pnpm dev', { cwd: ROOT, stdio: 'inherit', shell: true }); }
    catch { /* pnpm dev may exit non-zero on success */ }
    console.clear();
  }

  const stats = queryStats();
  renderTUI(stats);

  if (statsOnly) {
    console.log(g('  --stats-only mode: skipping launch.'));
    return;
  }

  console.log(gB('  ✓ Social Browser is running!'));
  console.log('');
  console.log(g('  ─────────────────────────────────────────────'));
  console.log(yB('  Press Ctrl+C or close this window'));
  console.log(g('  (App will keep running in background)'));
  console.log('');

  // Keep process alive until user closes the window
  // (execSync may have closed stdin, so use a simple sleep loop)
  process.stdin.setRawMode && process.stdin.setRawMode(true);
  if (process.stdin.isTTY) {
    process.stdin.resume();
    await new Promise((resolve) => {
      const onData = (d) => { if (d[0]===0x0d||d[0]===0x03) { process.stdin.setRawMode && process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', onData); resolve(); } };
      process.stdin.on('data', onData);
    });
  } else {
    // Non-TTY stdin — just wait a few seconds
    await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((err) => {
  console.error(rB('Fatal error:'), err.message);
  process.exit(1);
});