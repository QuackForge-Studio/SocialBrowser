import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  detectXOwnership,
  extractXPost,
  extractXEngagementSnapshot,
  extractXComments,
  parseCountText,
  normalizeHandle,
  X_CONTENT_SELECTORS,
  X_COMPOSE_SELECTOR,
  X_ADAPTER_VERSION,
  generateXAdapterInjectionScript,
  createXAdapter,
} from '../adapters/x-adapter';


function createTweetFixture(overrides) {
  const { handle='@testuser', postId='1234567890', text='Test', likes=42, replies=7, reposts=15, views=5000, hasMedia=false, publishedAt='2026-07-19T12:00:00.000Z' } = overrides || {};
  const ch = handle.replace('@', '');
  const mh = hasMedia ? '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/p.jpg" alt="I"/></div><div data-testid="card"><img src="https://pbs.twimg.com/card.jpg" alt="C"/></div>' : '';
  const html = '<article data-testid="tweet" tabindex="-1">' +
    '<div data-testid="User-Name"><a href="/' + ch + '" role="link"><div><span><span>DN</span></span><span>' + handle + '</span></div></a></div>' +
    '<div data-testid="tweetText"><span>' + text + '</span></div>' +
    mh +
    '<div role="group">' +
    '<div data-testid="reply" role="button" aria-label="' + replies + ' replies"></div>' +
    '<div data-testid="retweet" role="button" aria-label="' + reposts + ' reposts"></div>' +
    '<div data-testid="like" role="button" aria-label="' + likes + ' likes"></div>' +
    '<div data-testid="app-text-transition-container"><span>' + views + '</span></div></div>' +
    '<a href="/' + ch + '/status/' + postId + '" aria-label="View"><time datetime="' + publishedAt + '"></time></a>' +
    '</article>';
  const dom = new JSDOM(html, { url: 'https://x.com/home' });
  return dom.window.document.querySelector('article');
}

function createLikedTweetFixture() {
  const dom = new JSDOM(
    '<article data-testid="tweet" tabindex="-1">' +
    '<div data-testid="User-Name"><a href="/testuser" role="link"><div><span><span>TU</span></span><span>@testuser</span></div></a></div>' +
    '<div data-testid="tweetText"><span>Liked</span></div>' +
    '<div role="group">' +
    '<div data-testid="unlike" role="button" aria-label="100 likes"></div>' +
    '<div data-testid="retweet" role="button" aria-label="20 reposts"></div>' +
    '<div data-testid="reply" role="button" aria-label="5 replies"></div></div>' +
    '<a href="/testuser/status/98765" aria-label="View"><time datetime="2026-07-19T15:00:00.000Z"></time></a>' +
    '</article>',
    { url: 'https://x.com/home' }
  );
  return dom.window.document.querySelector('article');
}

function createThreadFixture(handle) {
  const ch = handle.replace('@', '');
  const dom = new JSDOM(
    '<section>' +
    '<article data-testid="tweet" tabindex="-1" id="main-tweet">' +
    '<div data-testid="User-Name"><a href="/' + ch + '" role="link"><div><span><span>OP</span></span><span>@' + ch + '</span></div></a></div>' +
    '<div data-testid="tweetText"><span>Original</span></div>' +
    '<div role="group"><div data-testid="reply" role="button" aria-label="3 replies"></div><div data-testid="retweet" role="button" aria-label="5 reposts"></div><div data-testid="like" role="button" aria-label="12 likes"></div></div>' +
    '<a href="/' + ch + '/status/111" aria-label="View"><time datetime="2026-07-19T12:00:00.000Z"></time></a>' +
    '</article>' +
    '<article data-testid="tweet" tabindex="-1">' +
    '<div data-testid="User-Name"><a href="/replyuser1" role="link"><div><span><span>RU1</span></span><span>@replyuser1</span></div></a></div>' +
    '<div data-testid="tweetText"><span>Great post!</span></div>' +
    '<a href="/replyuser1/status/222" aria-label="View"><time datetime="2026-07-19T12:30:00.000Z"></time></a>' +
    '</article>' +
    '<article data-testid="tweet" tabindex="-1">' +
    '<div data-testid="User-Name"><a href="/replyuser2" role="link"><div><span><span>RU2</span></span><span>@replyuser2</span></div></a></div>' +
    '<div data-testid="tweetText"><span>Interesting!</span></div>' +
    '<a href="/replyuser2/status/333" aria-label="View"><time datetime="2026-07-19T13:00:00.000Z"></time></a>' +
    '</article>' +
    '</section>',
    { url: 'https://x.com/home' }
  );
  const section = dom.window.document.querySelector('section');
  const mainTweet = dom.window.document.querySelector('#main-tweet');
  return { section, mainTweet };
}

// Content Selectors
describe('X Adapter - Content Selectors (VAL-CAPTURE-053)', () => {
  it('should have a non-empty contentSelectors array', () => {
    expect(X_CONTENT_SELECTORS).toBeDefined();
    expect(Array.isArray(X_CONTENT_SELECTORS)).toBe(true);
    expect(X_CONTENT_SELECTORS.length).toBeGreaterThan(0);
  });

  it('should contain valid CSS selector strings', () => {
    for (const sel of X_CONTENT_SELECTORS) {
      expect(typeof sel).toBe('string');
      expect(sel.length).toBeGreaterThan(0);
    }
  });

  it('should include article[data-testid="tweet"] selector', () => {
    expect(X_CONTENT_SELECTORS).toContain('article[data-testid="tweet"]');
  });
});

// Compose Selector
describe('X Adapter - Compose Selector (VAL-CAPTURE-054)', () => {
  it('should be a non-empty CSS selector string', () => {
    expect(X_COMPOSE_SELECTOR).toBeDefined();
    expect(typeof X_COMPOSE_SELECTOR).toBe('string');
    expect(X_COMPOSE_SELECTOR.length).toBeGreaterThan(0);
  });

  it('should target the compose textarea', () => {
    expect(X_COMPOSE_SELECTOR).toContain('tweetTextarea');
  });
});

// Version
describe('X Adapter - Version', () => {
  it('should have a positive integer version', () => {
    expect(X_ADAPTER_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(X_ADAPTER_VERSION)).toBe(true);
  });
});

// Utility Functions
describe('X Adapter - parseCountText', () => {
  it('should parse plain numbers', () => {
    expect(parseCountText('42 likes')).toBe(42);
    expect(parseCountText('0 replies')).toBe(0);
    expect(parseCountText('1,234 views')).toBe(1234);
  });

  it('should parse K/M/B suffixes', () => {
    expect(parseCountText('12.5K likes')).toBe(12500);
    expect(parseCountText('1.2M views')).toBe(1200000);
    expect(parseCountText('1.5B reposts')).toBe(1500000000);
  });

  it('should return undefined for non-numeric text', () => {
    expect(parseCountText('')).toBeUndefined();
    expect(parseCountText('abc')).toBeUndefined();
  });
});

describe('X Adapter - normalizeHandle', () => {
  it('should strip leading @ and lowercase', () => {
    expect(normalizeHandle('@ElonMusk')).toBe('elonmusk');
    expect(normalizeHandle('ELONMUSK')).toBe('elonmusk');
    expect(normalizeHandle('@elonmusk')).toBe('elonmusk');
    expect(normalizeHandle('elonmusk')).toBe('elonmusk');
  });
});

// Ownership Detection
describe('X Adapter - detectOwnership (VAL-CAPTURE-048/049/031)', () => {
  it('should detect owned tweet by matching handle (VAL-CAPTURE-048)', () => {
    const tweet = createTweetFixture({ handle: '@myaccount' });
    expect(detectXOwnership(tweet, '@myaccount').status).toBe('owned');
  });

  it('should detect owned tweet without @ prefix', () => {
    const tweet = createTweetFixture({ handle: '@myaccount' });
    expect(detectXOwnership(tweet, 'myaccount').status).toBe('owned');
  });

  it('should detect non-owned tweet (VAL-CAPTURE-049)', () => {
    const tweet = createTweetFixture({ handle: '@otheruser' });
    expect(detectXOwnership(tweet, '@myaccount').status).toBe('not-owned');
  });

  it('should return unknown when no author handle (VAL-CAPTURE-031)', () => {
    const dom = new JSDOM('<article data-testid="tweet"><div>No author</div></article>', { url: 'https://x.com' });
    const tweet = dom.window.document.querySelector('article');
    expect(detectXOwnership(tweet, '@myaccount').status).toBe('unknown');
  });

  it('should always return a valid OwnershipResult (VAL-CAPTURE-031)', () => {
    const t1 = createTweetFixture({ handle: '@me' });
    const r1 = detectXOwnership(t1, '@me');
    expect(['owned','not-owned','unknown']).toContain(r1.status);

    const t2 = createTweetFixture({ handle: '@other' });
    const r2 = detectXOwnership(t2, '@me');
    expect(['owned','not-owned','unknown']).toContain(r2.status);

    const dom = new JSDOM('<div></div>', { url: 'https://x.com' });
    const r3 = detectXOwnership(dom.window.document.querySelector('div'), '@me');
    expect(['owned','not-owned','unknown']).toContain(r3.status);
  });
});

// Post Extraction
describe('X Adapter - extractPost (VAL-CAPTURE-050)', () => {
  it('should return post with all required fields', () => {
    const tweet = createTweetFixture({
      handle: '@testuser', postId: '1234567890', text: 'Hello!',
      publishedAt: '2026-07-19T12:00:00.000Z', hasMedia: true,
    });
    const post = extractXPost(tweet);
    expect(post).not.toBeNull();
    expect(post.platformPostId).toBe('1234567890');
    expect(post.contentText).toBe('Hello!');
    expect(post.authorHandle).toBe('@testuser');
    expect(post.publishedAt).toBe('2026-07-19T12:00:00.000Z');
    expect(post.mediaRefs).toBeDefined();
    const media = JSON.parse(post.mediaRefs);
    expect(Array.isArray(media)).toBe(true);
    expect(media.length).toBeGreaterThan(0);
  });

  it('should return null for non-tweet elements', () => {
    const dom = new JSDOM('<div>Not a tweet</div>', { url: 'https://x.com' });
    expect(extractXPost(dom.window.document.querySelector('div'))).toBeNull();
  });

  it('should handle tweets without media', () => {
    const tweet = createTweetFixture({ hasMedia: false });
    expect(extractXPost(tweet).mediaRefs).toBeUndefined();
  });

  it('should handle tweets without text', () => {
    const tweet = createTweetFixture({ text: '' });
    expect(extractXPost(tweet).contentText).toBeUndefined();
  });
});

// Engagement Extraction
describe('X Adapter - extractEngagementSnapshot (VAL-CAPTURE-051)', () => {
  it('should return non-negative engagement metrics', () => {
    const tweet = createTweetFixture({ likes:42, replies:7, reposts:15, views:5000 });
    const eng = extractXEngagementSnapshot(tweet);
    expect(eng).not.toBeNull();
    expect(eng.likes).toBe(42);
    expect(eng.commentsCount).toBe(7);
    expect(eng.shares).toBe(15);
    expect(eng.views).toBe(5000);
    for (const m of [eng.likes, eng.commentsCount, eng.shares, eng.views]) {
      if (m !== undefined) expect(m).toBeGreaterThanOrEqual(0);
    }
  });

  it('should detect likes from unlike button', () => {
    const tweet = createLikedTweetFixture();
    expect(extractXEngagementSnapshot(tweet).likes).toBe(100);
  });

  it('should return null when no engagement data', () => {
    const dom = new JSDOM('<article data-testid="tweet"><div data-testid="tweetText"><span>No eng</span></div><a href="/u/status/1"><time datetime="2026-01-01"></time></a></article>', { url: 'https://x.com' });
    expect(extractXEngagementSnapshot(dom.window.document.querySelector('article'))).toBeNull();
  });
});

// Comment Extraction
describe('X Adapter - extractComments (VAL-CAPTURE-052)', () => {
  it('should extract comments from a thread', () => {
    const { mainTweet } = createThreadFixture('@myaccount');
    const comments = extractXComments(mainTweet);
    expect(comments).toHaveLength(2);
    expect(comments[0].authorHandle).toBe('@replyuser1');
    expect(comments[0].text).toBe('Great post!');
    expect(comments[0].platformCommentId).toBe('222');
    expect(comments[1].authorHandle).toBe('@replyuser2');
    expect(comments[1].text).toBe('Interesting!');
    expect(comments[1].platformCommentId).toBe('333');
  });

  it('should return empty array when no comments', () => {
    expect(extractXComments(createTweetFixture())).toEqual([]);
  });

  it('should return empty array on empty node', () => {
    const dom = new JSDOM('<div></div>', { url: 'https://x.com' });
    expect(extractXComments(dom.window.document.querySelector('div'))).toEqual([]);
  });
});

// Adapter Object
describe('X Adapter - createXAdapter', () => {
  it('should create an adapter with correct structure', () => {
    const a = createXAdapter();
    expect(a.platform).toBe('x');
    expect(a.version).toBe(1);
    expect(Array.isArray(a.contentSelectors)).toBe(true);
    expect(a.contentSelectors.length).toBeGreaterThan(0);
    expect(typeof a.composeSelector).toBe('string');
    expect(a.composeSelector.length).toBeGreaterThan(0);
    expect(typeof a.detectOwnership).toBe('function');
    expect(typeof a.extractPost).toBe('function');
    expect(typeof a.extractEngagementSnapshot).toBe('function');
    expect(typeof a.extractComments).toBe('function');
  });
});

// Injection Script
describe('X Adapter - Injection Script', () => {
  it('should produce valid JS code', () => {
    const script = generateXAdapterInjectionScript({ accountHandle:'@myaccount', accountId:'test-uuid' });
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(100);
    expect(script).toContain('detectOwnership');
    expect(script).toContain('extractPost');
    expect(script).toContain('extractEngagementSnapshot');
    expect(script).toContain('extractComments');
    expect(script).toContain('MutationObserver');
    expect(script).toContain('sendAdapterReady');
  });

  it('should include account handle and ID', () => {
    const s = generateXAdapterInjectionScript({ accountHandle:'@special_u', accountId:'uuid-abc' });
    expect(s).toContain('@special_u');
    expect(s).toContain('uuid-abc');
  });

  it('should produce syntactically valid JS', () => {
    const s = generateXAdapterInjectionScript({ accountHandle:'@me', accountId:'id' });
    expect(() => new Function(s)).not.toThrow();
  });
});

// Ownership Flow
describe('X Adapter - Ownership Flow (VAL-CAPTURE-021/022/030)', () => {
  it('should detect owned and extract post (VAL-CAPTURE-021)', () => {
    const tweet = createTweetFixture({ handle:'@myaccount' });
    expect(detectXOwnership(tweet,'@myaccount').status).toBe('owned');
    expect(extractXPost(tweet).authorHandle).toBe('@myaccount');
  });

  it('should detect non-owned (VAL-CAPTURE-022)', () => {
    expect(detectXOwnership(createTweetFixture({ handle:'@other' }),'@myaccount').status).toBe('not-owned');
  });

  it('should detect unknown (VAL-CAPTURE-030)', () => {
    const dom = new JSDOM('<article data-testid="tweet"><div data-testid="tweetText"><span>Mysterious</span></div></article>', { url:'https://x.com' });
    expect(detectXOwnership(dom.window.document.querySelector('article'),'@myaccount').status).toBe('unknown');
  });
});