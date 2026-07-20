/**
 * X (Twitter) Platform Adapter
 *
 * Implements the PlatformAdapter interface for X/Twitter.
 * Provides both:
 * 1. Pure functions for extraction/detection (exported for testing)
 * 2. An injection code generator that produces a self-contained JavaScript
 *    string to be injected into the page via executeJavaScript()
 *
 * X/Twitter DOM selectors (current 2026):
 * - article[data-testid="tweet"] — tweet container
 * - [data-testid="User-Name"] — author handle
 * - [data-testid="tweetText"] — tweet text
 * - [data-testid="like"] — like button (aria-label has count)
 * - [data-testid="reply"] — reply button
 * - [data-testid="retweet"] — repost button
 * - [data-testid="app-text-transition-container"] — view count
 * - [data-testid="tweetTextarea_0"] — compose box
 */

import type {
  OwnershipResult,
  NormalizedPost,
  EngagementMetrics,
  CommentData,
  OwnershipStatus,
} from './platform-adapter';

// ─── Adapter Metadata ────────────────────────────────────────────────

export const X_ADAPTER_VERSION = 1;
export const X_PLATFORM = 'x';

// ─── CSS Selectors ───────────────────────────────────────────────────

export const X_CONTENT_SELECTORS: string[] = [
  'article[data-testid="tweet"]',
];

export const X_COMPOSE_SELECTOR =
  '[data-testid="tweetTextarea_0"], [data-testid="pillar_custom_compose"] [role="textbox"]';

// ─── Ownership Detection ─────────────────────────────────────────────

export function extractAuthorHandle(node: Element): string | null {
  try {
    const userNameEl = node.querySelector('[data-testid="User-Name"]');
    if (!userNameEl) return null;
    const allSpans = userNameEl.querySelectorAll('span');
    for (const span of allSpans) {
      const text = span.textContent || '';
      if (text.startsWith('@') && text.length > 1) return text;
    }
    const anchors = userNameEl.querySelectorAll('a');
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('/') && !href.includes('/status/') && href.length > 1) {
        const h = href.split('/')[1] || '';
        if (h) return '@' + h;
      }
    }
    return null;
  } catch { return null; }
}

export function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, '').toLowerCase();
}

export function detectXOwnership(node: Element, accountHandle: string): OwnershipResult {
  const authorHandle = extractAuthorHandle(node);
  if (!authorHandle) return { status: 'unknown' as OwnershipStatus };
  if (normalizeHandle(authorHandle) === normalizeHandle(accountHandle)) {
    return { status: 'owned' as OwnershipStatus };
  }
  return { status: 'not-owned' as OwnershipStatus };
}

// ─── Post Extraction ─────────────────────────────────────────────────

export function extractPlatformPostId(node: Element): string | null {
  try {
    const timeLink = node.querySelector('a[href*="/status/"]');
    if (timeLink) {
      const href = timeLink.getAttribute('href') || '';
      const m = href.match(/\/status\/(\d+)/);
      if (m && m[1]) return m[1];
    }
    const timeEl = node.querySelector('time');
    if (timeEl) {
      const parentAnchor = timeEl.closest('a');
      if (parentAnchor) {
        const href = parentAnchor.getAttribute('href') || '';
        const m = href.match(/\/status\/(\d+)/);
        if (m && m[1]) return m[1];
      }
    }
    return null;
  } catch { return null; }
}

export function extractPublishedAt(node: Element): string | undefined {
  try {
    const timeEl = node.querySelector('time');
    if (timeEl) {
      const dt = timeEl.getAttribute('datetime');
      if (dt) return dt;
    }
    return undefined;
  } catch { return undefined; }
}

export function extractTweetText(node: Element): string | undefined {
  try {
    const textEl = node.querySelector('[data-testid="tweetText"]');
    if (textEl) return textEl.textContent || undefined;
    return undefined;
  } catch { return undefined; }
}

export function extractMediaRefs(node: Element): string | undefined {
  try {
    const media: string[] = [];
    node.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('https://')) media.push(src);
    });
    node.querySelectorAll('div[data-testid*="card"] img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('https://')) media.push(src);
    });
    if (media.length === 0) return undefined;
    return JSON.stringify(media);
  } catch { return undefined; }
}

export function extractXPost(node: Element): NormalizedPost | null {
  try {
    const platformPostId = extractPlatformPostId(node);
    if (!platformPostId) return null;
    return {
      platformPostId,
      contentText: extractTweetText(node),
      mediaRefs: extractMediaRefs(node),
      authorHandle: extractAuthorHandle(node) || undefined,
      publishedAt: extractPublishedAt(node),
    };
  } catch { return null; }
}

// ─── Engagement Extraction ───────────────────────────────────────────

export function parseCountText(text: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/([\d,.]+)\s*([KMBkmb])?/);
  if (!m) return undefined;
  const num = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(num)) return undefined;
  const suffix = (m[2] || '').toUpperCase();
  if (suffix === 'K') return Math.round(num * 1000);
  if (suffix === 'M') return Math.round(num * 1000000);
  if (suffix === 'B') return Math.round(num * 1000000000);
  return Math.round(num);
}

export function extractLikeCount(node: Element): number | undefined {
  try {
    const btn = node.querySelector('[data-testid="like"]') || node.querySelector('[data-testid="unlike"]');
    if (btn) {
      const lbl = btn.getAttribute('aria-label');
      if (lbl) return parseCountText(lbl);
    }
    return undefined;
  } catch { return undefined; }
}

export function extractReplyCount(node: Element): number | undefined {
  try {
    const btn = node.querySelector('[data-testid="reply"]');
    if (btn) {
      const lbl = btn.getAttribute('aria-label');
      if (lbl) return parseCountText(lbl);
    }
    return undefined;
  } catch { return undefined; }
}

export function extractRepostCount(node: Element): number | undefined {
  try {
    const btn = node.querySelector('[data-testid="retweet"]') || node.querySelector('[data-testid="unrepost"]');
    if (btn) {
      const lbl = btn.getAttribute('aria-label');
      if (lbl) return parseCountText(lbl);
    }
    return undefined;
  } catch { return undefined; }
}

export function extractViewCount(node: Element): number | undefined {
  try {
    const vc = node.querySelector('[data-testid="app-text-transition-container"]');
    if (vc) {
      const t = vc.textContent || '';
      const c = parseCountText(t);
      if (c !== undefined) return c;
    }
    return undefined;
  } catch { return undefined; }
}

export function extractXEngagementSnapshot(node: Element): EngagementMetrics | null {
  try {
    const likes = extractLikeCount(node);
    const shares = extractRepostCount(node);
    const commentsCount = extractReplyCount(node);
    const views = extractViewCount(node);
    if (likes === undefined && shares === undefined && commentsCount === undefined && views === undefined) return null;
    return { likes, shares, commentsCount, views };
  } catch { return null; }
}

// ─── Comment Extraction ──────────────────────────────────────────────

export function extractXComments(node: Element): CommentData[] {
  try {
    const comments: CommentData[] = [];
    const parentSection = node.closest('section') || node.parentElement;
    if (!parentSection) return [];
    const allTweets = parentSection.querySelectorAll('article[data-testid="tweet"]');
    for (const tweet of allTweets) {
      if (tweet === node) continue;
      comments.push({
        platformCommentId: extractPlatformPostId(tweet) || undefined,
        authorHandle: extractAuthorHandle(tweet) || undefined,
        text: extractTweetText(tweet),
      });
    }
    return comments;
  } catch { return []; }
}

// ─── Injection Script Generator ──────────────────────────────────────

export function generateXAdapterInjectionScript(config: {
  accountHandle: string;
  accountId: string;
}): string {
  const { accountHandle, accountId } = config;
  const escapedHandle = accountHandle.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const escapedAccountId = accountId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  return [
    '(function() {',
    '  "use strict";',
    '  var ACCOUNT_HANDLE = "' + escapedHandle + '";',
    '  var ACCOUNT_ID = "' + escapedAccountId + '";',
    '  var ADAPTER_VERSION = 1;',
    '  var PLATFORM = "x";',
    '  var PROCESSED_TWEETS = new WeakSet();',
    '',
    '  function normalizeHandle(h) { return h.replace(/^@/, "").toLowerCase(); }',
    '',
    '  function parseCountText(t) {',
    '    if (!t) return undefined;',
    '    var m = t.match(/([\\d,.]+)\\s*([KMBkmb])?/);',
    '    if (!m) return undefined;',
    '    var n = parseFloat(m[1].replace(/,/g, ""));',
    '    if (isNaN(n)) return undefined;',
    '    var s = (m[2] || "").toUpperCase();',
    '    if (s === "K") return Math.round(n * 1000);',
    '    if (s === "M") return Math.round(n * 1000000);',
    '    if (s === "B") return Math.round(n * 1000000000);',
    '    return Math.round(n);',
    '  }',
    '',
    '  function detectOwnership(node) {',
    '    try {',
    '      var el = node.querySelector("[data-testid=\\"User-Name\\"]");',
    '      if (!el) return {status:"unknown"};',
    '      var spans = el.querySelectorAll("span");',
    '      var handle = null;',
    '      for (var i=0;i<spans.length;i++) {',
    '        var t = spans[i].textContent || "";',
    '        if (t.indexOf("@")===0 && t.length>1) { handle = t; break; }',
    '      }',
    '      if (!handle) {',
    '        var anchors = el.querySelectorAll("a");',
    '        for (var j=0;j<anchors.length;j++) {',
    '          var h = anchors[j].getAttribute("href") || "";',
    '          if (h.indexOf("/")===0 && h.indexOf("/status/")===-1 && h.length>1) {',
    '            handle = "@"+h.split("/")[1]; break;',
    '          }',
    '        }',
    '      }',
    '      if (!handle) return {status:"unknown"};',
    '      if (normalizeHandle(handle)===normalizeHandle(ACCOUNT_HANDLE)) return {status:"owned"};',
    '      return {status:"not-owned"};',
    '    } catch(e) { return {status:"unknown"}; }',
    '  }',
    '',
    '  function extractPost(node) {',
    '    try {',
    '      var link = node.querySelector("a[href*=\\"/status/\\"]");',
    '      var id = null;',
    '      if (link) {',
    '        var hr = link.getAttribute("href") || "";',
    '        var m = hr.match(/\\/status\\/(\\d+)/);',
    '        if (m && m[1]) id = m[1];',
    '      }',
    '      if (!id) {',
    '        var te = node.querySelector("time");',
    '        if (te) {',
    '          var pa = te.closest("a");',
    '          if (pa) {',
    '            var h2 = pa.getAttribute("href") || "";',
    '            var m2 = h2.match(/\\/status\\/(\\d+)/);',
    '            if (m2 && m2[1]) id = m2[1];',
    '          }',
    '        }',
    '      }',
    '      if (!id) return null;',
    '      var tx = node.querySelector("[data-testid=\\"tweetText\\"]");',
    '      var text = tx ? (tx.textContent || undefined) : undefined;',
    '      var media = [];',
    '      node.querySelectorAll("[data-testid=\\"tweetPhoto\\"] img").forEach(function(img) {',
    '        var src = img.getAttribute("src");',
    '        if (src && src.indexOf("https://")===0) media.push(src);',
    '      });',
    '      node.querySelectorAll("div[data-testid*=\\"card\\"] img").forEach(function(img) {',
    '        var src = img.getAttribute("src");',
    '        if (src && src.indexOf("https://")===0) media.push(src);',
    '      });',
    '      var ah = null;',
    '      var ae = node.querySelector("[data-testid=\\"User-Name\\"]");',
    '      if (ae) {',
    '        var sp = ae.querySelectorAll("span");',
    '        for (var n=0;n<sp.length;n++) {',
    '          var t2 = sp[n].textContent || "";',
    '          if (t2.indexOf("@")===0 && t2.length>1) { ah = t2; break; }',
    '        }',
    '        if (!ah) {',
    '          var an = ae.querySelectorAll("a");',
    '          for (var p=0;p<an.length;p++) {',
    '            var hn = an[p].getAttribute("href") || "";',
    '            if (hn.indexOf("/")===0 && hn.indexOf("/status/")===-1 && hn.length>1) {',
    '              ah = "@"+hn.split("/")[1]; break;',
    '            }',
    '          }',
    '        }',
    '      }',
    '      var timeEl = node.querySelector("time");',
    '      var pub = timeEl ? (timeEl.getAttribute("datetime") || undefined) : undefined;',
    '      return {',
    '        platformPostId: id,',
    '        contentText: text,',
    '        mediaRefs: media.length>0 ? JSON.stringify(media) : undefined,',
    '        authorHandle: ah || undefined,',
    '        publishedAt: pub,',
    '      };',
    '    } catch(e) { return null; }',
    '  }',
    '',
    '  function extractEngagementSnapshot(node) {',
    '    try {',
    '      var likes = undefined;',
    '      var lb = node.querySelector("[data-testid=\\"like\\"]") || node.querySelector("[data-testid=\\"unlike\\"]");',
    '      if (lb) { var al = lb.getAttribute("aria-label"); if (al) likes = parseCountText(al); }',
    '      var cc = undefined;',
    '      var rb = node.querySelector("[data-testid=\\"reply\\"]");',
    '      if (rb) { var al2 = rb.getAttribute("aria-label"); if (al2) cc = parseCountText(al2); }',
    '      var shares = undefined;',
    '      var sb = node.querySelector("[data-testid=\\"retweet\\"]") || node.querySelector("[data-testid=\\"unrepost\\"]");',
    '      if (sb) { var al3 = sb.getAttribute("aria-label"); if (al3) shares = parseCountText(al3); }',
    '      var views = undefined;',
    '      var vc = node.querySelector("[data-testid=\\"app-text-transition-container\\"]");',
    '      if (vc) { var vt = vc.textContent || ""; views = parseCountText(vt); }',
    '      if (likes===undefined && shares===undefined && cc===undefined && views===undefined) return null;',
    '      return {likes:likes, shares:shares, commentsCount:cc, views:views};',
    '    } catch(e) { return null; }',
    '  }',
    '',
    '  function extractComments(node) {',
    '    try {',
    '      var result = [];',
    '      var ps = node.closest("section") || node.parentElement;',
    '      if (!ps) return result;',
    '      var tweets = ps.querySelectorAll("article[data-testid=\\"tweet\\"]");',
    '      for (var q=0;q<tweets.length;q++) {',
    '        var tw = tweets[q];',
    '        if (tw===node) continue;',
    '        var tl = tw.querySelector("a[href*=\\"/status/\\"]");',
    '        var cid = null;',
    '        if (tl) { var hr = tl.getAttribute("href")||""; var mt = hr.match(/\\/status\\/(\\d+)/); if (mt&&mt[1]) cid=mt[1]; }',
    '        var ct = tw.querySelector("[data-testid=\\"tweetText\\"]");',
    '        var ctxt = ct ? (ct.textContent || undefined) : undefined;',
    '        var ca = tw.querySelector("[data-testid=\\"User-Name\\"]");',
    '        var ch = null;',
    '        if (ca) {',
    '          var cs = ca.querySelectorAll("span");',
    '          for (var r=0;r<cs.length;r++) {',
    '            var ct2 = cs[r].textContent||"";',
    '            if (ct2.indexOf("@")===0&&ct2.length>1) { ch=ct2; break; }',
    '          }',
    '        }',
    '        result.push({platformCommentId:cid||undefined, authorHandle:ch||undefined, text:ctxt});',
    '      }',
    '      return result;',
    '    } catch(e) { return []; }',
    '  }',
    '',
    '  function processTweet(node) {',
    '    if (PROCESSED_TWEETS.has(node)) return;',
    '    var te = node.matches && node.matches("article[data-testid=\\"tweet\\"]") ? node : (node.querySelector ? node.querySelector("article[data-testid=\\"tweet\\"]") : null);',
    '    if (!te) return;',
    '    if (PROCESSED_TWEETS.has(te)) return;',
    '    PROCESSED_TWEETS.add(te);',
    '    var own = detectOwnership(te);',
    '    if (own.status === "owned") {',
    '      var post = extractPost(te);',
    '      if (post) {',
    '        window.__socialBrowser.sendPost({platform:PLATFORM, accountId:ACCOUNT_ID, normalizedPost:post});',
    '        var eng = extractEngagementSnapshot(te);',
    '        if (eng) window.__socialBrowser.sendSnapshot({platform:PLATFORM, accountId:ACCOUNT_ID, postId:post.platformPostId, snapshot:eng});',
    '        var cmts = extractComments(te);',
    '        for (var s=0;s<cmts.length;s++) window.__socialBrowser.sendComment({platform:PLATFORM, accountId:ACCOUNT_ID, postId:post.platformPostId, comment:cmts[s]});',
    '      }',
    '    } else if (own.status === "unknown") {',
    '      window.__socialBrowser.sendError({platform:PLATFORM, accountId:ACCOUNT_ID, error:"Unknown ownership: tweet could not be identified"});',
    '    }',
    '  }',
    '',
    '  var observer = new MutationObserver(function(mutations) {',
    '    for (var i=0;i<mutations.length;i++) {',
    '      if (mutations[i].type!=="childList") continue;',
    '      var nodes = mutations[i].addedNodes;',
    '      for (var j=0;j<nodes.length;j++) {',
    '        if (nodes[j].nodeType!==1) continue;',
    '        processTweet(nodes[j]);',
    '      }',
    '    }',
    '  });',
    '',
    '  function startObserver() {',
    '    if (document.body) { observer.observe(document.body, {childList:true, subtree:true}); }',
    '    else { document.addEventListener("DOMContentLoaded", function() { observer.observe(document.body, {childList:true, subtree:true}); }); }',
    '  }',
    '  startObserver();',
    '',
    '  window.__socialBrowser.sendAdapterReady({platform:PLATFORM, accountId:ACCOUNT_ID, adapterVersion:ADAPTER_VERSION});',
    '})();',
  ].join('\n');
}

export function createXAdapter() {
  return {
    platform: X_PLATFORM,
    version: X_ADAPTER_VERSION,
    contentSelectors: X_CONTENT_SELECTORS,
    composeSelector: X_COMPOSE_SELECTOR,
    detectOwnership: detectXOwnership,
    extractPost: extractXPost,
    extractEngagementSnapshot: extractXEngagementSnapshot,
    extractComments: extractXComments,
  };
}