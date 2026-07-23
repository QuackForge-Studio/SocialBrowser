import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, X, SquaresFour, ArrowLeft, ArrowRight, ArrowClockwise, List, Lock, CircleNotch, Clock, MagnifyingGlass, Globe, Trash, Star, BookmarkSimple, DotsThreeVertical, Gear } from '@phosphor-icons/react';
import type { PlatformTab, DashboardView } from './types';
import logoPng from './logo.png';

function formatDisplayUrl(url: string): string {
  if (!url) return '';
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
    const u = new URL(url);
    let host = u.hostname;
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return url;
  }
}

interface TitleBarProps {
  tabs: PlatformTab[];
  activeTabId: string | null;
  activeView: DashboardView;
  sidebarOpen: boolean;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onAddTab: () => void;
  onToggleSidebar: () => void;
}

const PLATFORMS: Record<string, { color: string }> = {
  twitter: { color: '#1DA1F2' }, linkedin: { color: '#0A66C2' }, facebook: { color: '#0866FF' },
  instagram: { color: '#E4405F' }, reddit: { color: '#FF4500' }, tiktok: { color: '#00F2EA' },
  browser: { color: '#f59e0b' },
};

const DEFAULT_PRESETS = [
  { url: 'https://www.google.com', label: 'Google' },
  { url: 'https://www.youtube.com', label: 'YouTube' },
  { url: 'https://x.com', label: 'X (Twitter)' },
  { url: 'https://www.facebook.com', label: 'Facebook' },
  { url: 'https://www.instagram.com', label: 'Instagram' },
  { url: 'https://www.linkedin.com', label: 'LinkedIn' },
  { url: 'https://github.com', label: 'GitHub' },
  { url: 'https://www.reddit.com', label: 'Reddit' },
  { url: 'https://www.tiktok.com', label: 'TikTok' },
];

const HISTORY_KEY = 'social_browser_url_history';
const BOOKMARKS_KEY = 'social_browser_bookmarks';

interface BookmarkItem {
  url: string;
  title: string;
  createdAt: number;
}

function getUrlHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUrlToHistory(url: string) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;
  try {
    const list = getUrlHistory().filter(item => item !== url);
    list.unshift(url);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // ignore
  }
}

function removeUrlFromHistory(url: string) {
  try {
    const list = getUrlHistory().filter(item => item !== url);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function getBookmarks(): BookmarkItem[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function toggleBookmark(url: string, title?: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  try {
    const list = getBookmarks();
    const existingIndex = list.findIndex(b => b.url === url);
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
      return false;
    } else {
      list.unshift({ url, title: title || url, createdAt: Date.now() });
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
      return true;
    }
  } catch {
    return false;
  }
}

function SvgIcon({ d, w, h }: { d: string; w: number; h: number }) {
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none"><path d={d} stroke="currentColor" strokeWidth="1" /></svg>;
}

function WindowControls() {
  const [isMaxed, setIsMaxed] = useState(false);
  const api = () => (window as any).__socialBrowserWindow;
  return (
    <div className="flex h-full items-stretch shrink-0" style={{ WebkitAppRegion: 'no-drag' as any }}>
      <button onClick={() => api()?.minimize()} title="Minimize" className="flex h-full w-[44px] items-center justify-center text-text-muted hover:bg-[#1e2230] hover:text-white transition-colors">
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>
      <button onClick={async () => { const r = await api()?.maximize(); setIsMaxed(!!r); }} title={isMaxed ? "Restore" : "Maximize"} className="flex h-full w-[44px] items-center justify-center text-text-muted hover:bg-[#1e2230] hover:text-white transition-colors">
        {isMaxed ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M3 1h6v6M1 3h6v6H1z" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" fill="none" />
          </svg>
        )}
      </button>
      <button onClick={() => api()?.close()} title="Close" className="flex h-full w-[44px] items-center justify-center text-text-muted hover:bg-[#e81123] hover:text-white transition-colors">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M1 1l8 8M9 1l-8 8" />
        </svg>
      </button>
    </div>
  );
}

function TabFavicon({ tab, platformColor }: { tab: PlatformTab; platformColor: string }) {
  const [imgState, setImgState] = useState<'primary' | 'fallback' | 'icon'>('primary');

  const domain = useMemo(() => {
    if (!tab.url || !tab.url.startsWith('http')) return '';
    try {
      return new URL(tab.url).hostname;
    } catch {
      return '';
    }
  }, [tab.url]);

  const primarySrc = useMemo(() => {
    if (tab.favicon) return tab.favicon;
    if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    return '';
  }, [tab.favicon, domain]);

  const fallbackSrc = useMemo(() => {
    if (domain) return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    return '';
  }, [domain]);

  useEffect(() => {
    setImgState('primary');
  }, [tab.url, tab.favicon]);

  if (tab.isLoading) {
    return <CircleNotch size={15} weight="bold" className="animate-spin text-amber-400 shrink-0" />;
  }

  if (imgState === 'primary' && primarySrc) {
    return (
      <img
        src={primarySrc}
        alt=""
        className="h-4 w-4 rounded-sm object-contain shrink-0"
        onError={() => {
          if (fallbackSrc) setImgState('fallback');
          else setImgState('icon');
        }}
      />
    );
  }

  if (imgState === 'fallback' && fallbackSrc) {
    return (
      <img
        src={fallbackSrc}
        alt=""
        className="h-4 w-4 rounded-sm object-contain shrink-0"
        onError={() => setImgState('icon')}
      />
    );
  }

  return (
    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: platformColor }} />
  );
}

function UrlBarIcon({
  currentUrl,
  activeTab,
  tabs,
  isInputFocused,
  urlInput,
  suggestions,
  selectedIndex,
  hasInlineCompletion,
}: {
  currentUrl: string;
  activeTab?: PlatformTab;
  tabs: PlatformTab[];
  isInputFocused: boolean;
  urlInput: string;
  suggestions: SuggestionItem[];
  selectedIndex: number;
  hasInlineCompletion: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  // Determine effective URL being displayed or typed
  const effectiveUrl = useMemo(() => {
    if (isInputFocused) {
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        return suggestions[selectedIndex].url;
      }
      if (urlInput) {
        const matchedTab = tabs.find(t => t.url && (t.url.includes(urlInput) || urlInput.includes(t.url.replace(/^https?:\/\/(www\.)?/, ''))));
        if (matchedTab?.url) return matchedTab.url;
        if (urlInput.startsWith('http://') || urlInput.startsWith('https://')) return urlInput;
        return `https://${urlInput}`;
      }
    }
    return currentUrl || activeTab?.url || '';
  }, [isInputFocused, selectedIndex, suggestions, urlInput, tabs, currentUrl, activeTab]);

  // Reset imgError when effectiveUrl changes
  useEffect(() => {
    setImgError(false);
  }, [effectiveUrl]);

  // Determine if HTTPS/secure
  const isSecure = useMemo(() => {
    if (!effectiveUrl) return true;
    if (effectiveUrl.startsWith('http://')) return false;
    return true; // default to secure for https:// or plain domain
  }, [effectiveUrl]);

  // Determine Favicon URL
  const faviconUrl = useMemo(() => {
    if (!isSecure || !effectiveUrl) return '';

    // Check if active tab has favicon
    if (activeTab?.favicon && (effectiveUrl === currentUrl || effectiveUrl === activeTab.url)) {
      return activeTab.favicon;
    }

    // Check if any open tab matches
    const tabMatch = tabs.find(t => t.url && (t.url === effectiveUrl || t.url.includes(effectiveUrl)));
    if (tabMatch?.favicon) return tabMatch.favicon;

    // Extract domain for Google Favicon API
    try {
      const u = new URL(effectiveUrl.startsWith('http') ? effectiveUrl : `https://${effectiveUrl}`);
      if (u.hostname && u.hostname.includes('.')) {
        return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
      }
    } catch {
      // ignore
    }
    return '';
  }, [isSecure, effectiveUrl, activeTab, currentUrl, tabs]);

  // Render logic:
  if (!isSecure) {
    return <Lock size={15} weight="fill" className="mr-2 shrink-0 text-red-500" />;
  }

  if (faviconUrl && !imgError) {
    return (
      <img
        src={faviconUrl}
        alt=""
        onError={() => setImgError(true)}
        className="mr-2 h-4 w-4 shrink-0 rounded-xs object-contain"
      />
    );
  }

  return <Lock size={15} weight="fill" className="mr-2 shrink-0 text-emerald-500" />;
}

export function TitleBar({ tabs, activeTabId, activeView, sidebarOpen, onTabSelect, onTabClose, onAddTab, onToggleSidebar }: TitleBarProps) {
  const [urlInput, setUrlInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [hasInlineCompletion, setHasInlineCompletion] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [showBookmarksMenu, setShowBookmarksMenu] = useState(false);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [showBrowserMenu, setShowBrowserMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingNavRef = useRef<{ url: string; time: number } | null>(null);
  const wasFocusedAndSelectedRef = useRef(false);
  const [navAnimClass, setNavAnimClass] = useState('');
  const navAnimTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const isCurrentUrlBookmarked = useMemo(() => {
    if (!currentUrl) return false;
    return bookmarks.some(b => b.url === currentUrl);
  }, [bookmarks, currentUrl]);

  const reloadHistory = () => setHistory(getUrlHistory());
  const reloadBookmarks = () => setBookmarks(getBookmarks());

  const triggerNavAnim = (direction: 'back' | 'forward') => {
    if (navAnimTimeoutRef.current) clearTimeout(navAnimTimeoutRef.current);
    const cls = direction === 'back' ? 'animate-url-back' : 'animate-url-forward';
    setNavAnimClass(cls);
    navAnimTimeoutRef.current = setTimeout(() => {
      setNavAnimClass('');
    }, 300);
  };

  const getUnfocusedDisplayText = () => {
    const full = currentUrl || activeTab?.url || '';
    if (!full) return '';

    const clean = full.replace(/^https?:\/\/(www\.)?/, '');

    // Hover state: show path after domain (without https:// or www.), hide page title
    if (isHovered) {
      return clean;
    }

    // Unfocused & not hovered state: show domain + web page title (only if title has > 2 words)
    let domain = '';
    try {
      const u = new URL(full.startsWith('http') ? full : `https://${full}`);
      domain = u.hostname.replace(/^www\./, '');
    } catch {
      domain = clean;
    }

    const title = activeTab?.label;
    if (title && title !== domain && title !== full && !domain.includes(title)) {
      const wordCount = title.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount > 2) {
        return `${domain} — ${title}`;
      }
    }
    return domain || clean;
  };

  useEffect(() => {
    reloadHistory();
    reloadBookmarks();
  }, []);

  useEffect(() => {
    const active = tabs.find(t => t.id === activeTabId);
    if (active?.url) {
      setCurrentUrl(active.url);
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    pendingNavRef.current = null;
    const bridge = (window as any).__socialBrowserDashboard;
    if (!bridge?.getBrowserTabs) return;
    const poll = () => {
      bridge.getBrowserTabs().then((t: PlatformTab[]) => {
        if (activeTabId && t) {
          const active = t.find((tab) => tab.id === activeTabId);
          if (active?.url) {
            // If user recently triggered a navigation, prevent poll from reverting URL to old page
            if (pendingNavRef.current) {
              const { url: pUrl, time: pTime } = pendingNavRef.current;
              const isRecent = Date.now() - pTime < 4000;
              const isSameUrl = active.url === pUrl || active.url.startsWith(pUrl);

              if (isRecent && !isSameUrl) {
                return;
              }
              pendingNavRef.current = null;
            }

            setCurrentUrl(active.url);
            if (active.url.startsWith('http')) {
              saveUrlToHistory(active.url);
              setHistory(getUrlHistory());
            }
          }
        }
      }).catch(() => {});
    };
    poll();
    const i = setInterval(poll, 1500);
    return () => clearInterval(i);
  }, [activeTabId]);

  const navigateTo = (rawUrl: string) => {
    let target = rawUrl.trim();
    if (!target) return;

    if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('about:')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        target = 'https://www.google.com/search?q=' + encodeURIComponent(target);
      }
    }
    pendingNavRef.current = { url: target, time: Date.now() };
    saveUrlToHistory(target);
    reloadHistory();
    if (activeTabId) {
      (window as any).__socialBrowserDashboard?.navigateTab?.({ tabId: activeTabId, url: target });
    }

    // Optimistically update active tab title & favicon immediately on navigation start
    if (activeTab) {
      try {
        const u = new URL(target);
        activeTab.url = target;
        activeTab.favicon = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
      } catch {}
    }

    setCurrentUrl(target);
    setUrlInput(target);
    setIsInputFocused(false);
    setIsAllSelected(false);
    setHasInlineCompletion(false);
    setShowBookmarksMenu(false);
    setShowHistoryMenu(false);
    setShowBrowserMenu(false);
    setSelectedIndex(-1);

    if (inputRef.current) {
      inputRef.current.setSelectionRange(target.length, target.length);
      inputRef.current.blur();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    const nativeEvt = e.nativeEvent as InputEvent;
    const isDeleting = nativeEvt?.inputType?.includes('delete') || nativeEvt?.inputType === 'deleteContentBackward';

    setUrlInput(newVal);
    setIsAllSelected(false);
    setSelectedIndex(-1);

    if (isDeleting || !newVal.trim()) {
      setHasInlineCompletion(false);
      return;
    }

    const typedLower = newVal.toLowerCase();
    const allCandidates = Array.from(new Set([
      ...history,
      ...DEFAULT_PRESETS.map(p => p.url)
    ]));

    let foundMatch = false;
    for (const candidateUrl of allCandidates) {
      let cleanDomain = '';
      try {
        const parsed = new URL(candidateUrl);
        cleanDomain = parsed.hostname.replace(/^www\./, '');
      } catch {
        cleanDomain = candidateUrl;
      }

      let matchText = '';
      if (candidateUrl.toLowerCase().startsWith(typedLower)) {
        matchText = candidateUrl;
      } else if (cleanDomain.toLowerCase().startsWith(typedLower)) {
        matchText = cleanDomain;
      } else if (('www.' + cleanDomain).toLowerCase().startsWith(typedLower)) {
        matchText = 'www.' + cleanDomain;
      }

      if (matchText && matchText.length > newVal.length) {
        setUrlInput(matchText);
        setHasInlineCompletion(true);
        foundMatch = true;
        const start = newVal.length;
        const end = matchText.length;
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(start, end);
          }
        });
        break;
      }
    }
    if (!foundMatch) {
      setHasInlineCompletion(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = inputRef.current;
    const hasSelection = el && el.selectionStart !== null && el.selectionEnd !== null && el.selectionEnd > el.selectionStart;

    if (e.key === 'Tab' || (e.key === 'ArrowRight' && hasSelection)) {
      if (hasSelection && el) {
        e.preventDefault();
        el.setSelectionRange(el.value.length, el.value.length);
        setHasInlineCompletion(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        navigateTo(suggestions[selectedIndex].url);
      } else {
        navigateTo(urlInput);
      }
    } else if (e.key === 'Escape') {
      setIsInputFocused(false);
      setIsAllSelected(false);
      setSelectedIndex(-1);
      setHasInlineCompletion(false);
      if (el) {
        el.setSelectionRange(el.value.length, el.value.length);
        el.blur();
      }
    }
  };

  const suggestions = useMemo(() => {
    if (!isInputFocused) return [];
    const query = urlInput.trim().toLowerCase();
    const result: { type: 'history' | 'preset' | 'search'; url: string; label: string }[] = [];

    // 1. History matches
    const matchedHistory = history.filter(item => !query || item.toLowerCase().includes(query));
    matchedHistory.slice(0, 5).forEach(item => {
      result.push({ type: 'history', url: item, label: item });
    });

    // 2. Google Search option
    if (query && !result.some(r => r.url.toLowerCase() === query)) {
      const searchUrl = query.includes('.') && !query.includes(' ')
        ? (query.startsWith('http') ? query : `https://${query}`)
        : `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      const searchLabel = query.includes('.') && !query.includes(' ')
        ? `Go to https://${query.replace(/^https?:\/\//, '')}`
        : `Search Google for "${query}"`;

      result.push({ type: 'search', url: searchUrl, label: searchLabel });
    }

    // 3. Preset matches
    const matchedPresets = DEFAULT_PRESETS.filter(p =>
      !result.some(r => r.url === p.url) &&
      (!query || p.url.toLowerCase().includes(query) || p.label.toLowerCase().includes(query))
    );
    matchedPresets.slice(0, 4).forEach(p => {
      result.push({ type: 'preset', url: p.url, label: `${p.label} — ${p.url}` });
    });

    return result.slice(0, 8);
  }, [isInputFocused, urlInput, history]);

  const sendNav = (js: string, direction?: 'back' | 'forward') => {
    if (direction) triggerNavAnim(direction);
    if (activeTabId) (window as any).__socialBrowserDashboard?.navigateTab?.({ tabId: activeTabId, url: js });
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 select-none pointer-events-auto">
      {/* Row 1: Tab strip */}
      <div className="flex h-10 items-stretch bg-[#0c0e14] border-none" style={{ WebkitAppRegion: 'drag' as any, paddingLeft: 10 }}>
        <button onClick={onToggleSidebar} title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          className="flex items-center gap-2 mr-3 my-auto shrink-0 rounded-lg px-2 py-1 -ml-1 transition-all hover:bg-bg-hover active:scale-95"
          style={{ WebkitAppRegion: 'no-drag' as any }}>
          <img src={logoPng} alt="Social Browser" className="h-6 w-auto" />
          <span className="text-[10px] font-medium text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded-md"><List size={14} weight="bold" /></span>
        </button>

        <div className="h-4 w-px bg-border/40 my-auto mr-2 shrink-0" />

        <div className="flex-1 flex items-center gap-2 overflow-x-auto [::-webkit-scrollbar]:hidden py-1 pr-2">
          {/* Workspaces Tab Button */}
          <button
            onClick={() => onTabSelect('')}
            className={`flex h-8 items-center gap-2.5 px-3.5 text-[13px] font-medium transition-all shrink-0 min-w-[125px] ${
              activeTabId === null
                ? 'rounded-xl bg-[#222736] border border-amber-500/40 text-white shadow-sm ring-1 ring-amber-500/20'
                : 'rounded-xl text-text-muted hover:bg-[#1a1d28] hover:text-text-primary'
            }`}
            style={{ WebkitAppRegion: 'no-drag' as any }}
          >
            <SquaresFour size={15} weight="duotone" className={activeTabId === null ? 'text-amber-500' : 'text-text-faint'} />
            <span>Workspaces</span>
          </button>

          {/* Browser & Platform Tabs */}
          {tabs.map(tab => {
            const active = tab.id === activeTabId;
            const pColor = PLATFORMS[tab.platform] ?? { color: '#f59e0b' };

            return (
              <button
                key={tab.id}
                onClick={() => onTabSelect(tab.id)}
                className={`group relative flex h-8 items-center gap-2.5 px-3 text-[13px] font-medium transition-all shrink-0 min-w-[135px] max-w-[230px] ${
                  active
                    ? 'rounded-xl bg-[#222736] border border-amber-500/40 text-white shadow-sm ring-1 ring-amber-500/20'
                    : 'rounded-xl text-text-muted hover:bg-[#1a1d28] hover:text-text-primary border border-transparent'
                }`}
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                {/* Tab Favicon */}
                <TabFavicon tab={tab} platformColor={pColor.color} />

                <span className="truncate flex-1 text-left">{tab.label}</span>

                {/* Close Button */}
                <span
                  onClick={e => { e.stopPropagation(); onTabClose(tab.id); }}
                  title="Close tab"
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded-lg opacity-60 group-hover:opacity-100 hover:bg-[#383e54] text-text-muted hover:text-white transition-all shrink-0"
                >
                  <X size={12} weight="bold" />
                </span>
              </button>
            );
          })}

          {/* New Tab Button */}
          <button onClick={onAddTab} title="New browser tab"
            className="flex h-7 w-7 items-center justify-center rounded-xl text-text-faint hover:bg-[#1a1d28] hover:text-amber-400 transition-all shrink-0 ml-1 border border-transparent hover:border-[#2b3042]"
            style={{ WebkitAppRegion: 'no-drag' as any }}>
            <Plus size={14} weight="bold" />
          </button>
        </div>

        <WindowControls />
      </div>

      {/* Row 2: URL bar (only when a browser tab is active) — Integrated into Unified Container Card */}
      {activeTabId && (
        <div className="mx-[5px] mt-[5px] relative flex items-center gap-2 h-[46px] px-3.5 rounded-t-[15px] bg-[#161925] border-t border-x border-[#2d3345] shadow-xs"
          style={{ WebkitAppRegion: 'no-drag' as any }}>
          <button onClick={() => sendNav('javascript:history.back()', 'back')} title="Back"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[#202535] hover:text-white transition-all"><ArrowLeft size={16} weight="bold" /></button>
          <button onClick={() => sendNav('javascript:history.forward()', 'forward')} title="Forward"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[#202535] hover:text-white transition-all"><ArrowRight size={16} weight="bold" /></button>
          <button onClick={() => sendNav('javascript:location.reload()')} title="Reload"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[#202535] hover:text-white transition-all mr-0.5">
            <ArrowClockwise size={16} weight="bold" />
          </button>

          <div className="relative flex-1 flex items-center rounded-xl bg-[#0e1017] border border-[#272d3e] focus-within:border-amber-500/70 focus-within:ring-2 focus-within:ring-amber-500/20 px-3 h-8.5 text-[13.5px] transition-all shadow-inner">
            <UrlBarIcon
              currentUrl={currentUrl}
              activeTab={activeTab}
              tabs={tabs}
              isInputFocused={isInputFocused}
              urlInput={urlInput}
              suggestions={suggestions}
              selectedIndex={selectedIndex}
              hasInlineCompletion={hasInlineCompletion}
            />
            <div className="flex-1 flex items-center min-w-0 relative">
              <input
                ref={inputRef}
                type="text"
                value={isInputFocused ? urlInput : getUnfocusedDisplayText()}
                onChange={handleInputChange}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onMouseDown={() => {
                  wasFocusedAndSelectedRef.current = isInputFocused && isAllSelected;
                }}
                onFocus={(e) => {
                  reloadHistory();
                  setIsInputFocused(true);
                  setIsAllSelected(true);
                  setSelectedIndex(-1);
                  setHasInlineCompletion(false);

                  const full = currentUrl || activeTab?.url || '';
                  const clean = full.replace(/^https?:\/\/(www\.)?/, '');
                  setUrlInput(clean);

                  requestAnimationFrame(() => {
                    if (inputRef.current) {
                      inputRef.current.select();
                    }
                  });
                }}
                onClick={() => {
                  // If input was ALREADY focused and ALL text was selected before this click:
                  if (wasFocusedAndSelectedRef.current) {
                    wasFocusedAndSelectedRef.current = false;
                    setIsAllSelected(false);
                    const full = currentUrl || activeTab?.url || '';
                    setUrlInput(full);
                  }
                }}
                onBlur={() => {
                  if (inputRef.current) {
                    inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
                  }
                  setTimeout(() => {
                    setIsInputFocused(false);
                    setIsAllSelected(false);
                    setHasInlineCompletion(false);
                  }, 150);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search Google or type a URL..."
                className={`url-input-box bg-transparent text-[13.5px] text-white outline-none border-none placeholder:text-text-faint font-medium truncate ${navAnimClass}`}
                style={{
                  WebkitAppRegion: 'no-drag' as any,
                  width: hasInlineCompletion ? undefined : '100%',
                  flex: hasInlineCompletion ? '0 1 auto' : '1 1 0%',
                }}
              />

              {/* Translucent inline autocompletion indicator hint badge with dashed border */}
              {hasInlineCompletion && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-dashed border-white/20 text-[#8b9bb4] opacity-75 shrink-0 select-none ml-2 font-sans text-[10.5px]">
                  <span className="text-[10px] text-[#94a3b8]/80 font-medium">Press</span>
                  <kbd className="px-1.5 py-0.2 rounded bg-[#141722] text-[9.5px] font-mono text-[#cbd5e1] border border-dashed border-[#343d54]">Tab ↹</kbd>
                  <span className="text-[10px] text-[#94a3b8]/80 font-medium">or</span>
                  <kbd className="px-1.5 py-0.2 rounded bg-[#141722] text-[9.5px] font-mono text-[#cbd5e1] border border-dashed border-[#343d54]">↵ Enter</kbd>
                </div>
              )}
            </div>

            {/* Bookmark Star Icon inside URL bar - perfectly centered */}
            {currentUrl && currentUrl.startsWith('http') && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggleBookmark(currentUrl, activeTab?.label || currentUrl);
                  reloadBookmarks();
                }}
                title={isCurrentUrlBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-[#222736] transition-colors shrink-0 ml-1.5"
              >
                <Star
                  size={16}
                  weight={isCurrentUrlBookmarked ? 'fill' : 'regular'}
                  className={isCurrentUrlBookmarked ? 'text-amber-400' : 'text-text-muted hover:text-amber-400'}
                />
              </button>
            )}

            {/* URL Suggestions Dropdown */}
            {isInputFocused && suggestions.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute left-0 right-0 top-[42px] z-50 rounded-xl bg-[#161822] border border-[#2b3042] shadow-2xl overflow-hidden py-1.5 animate-dropdown"
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                <div className="px-3.5 py-1.5 text-[11.5px] font-bold text-text-faint uppercase tracking-wider flex items-center justify-between border-b border-border/40 pb-1.5 mb-1">
                  <span>Suggestions & History</span>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        localStorage.removeItem(HISTORY_KEY);
                        setHistory([]);
                      }}
                      className="hover:text-red-400 text-[11.5px] normal-case transition-colors text-text-faint font-semibold"
                    >
                      Clear history
                    </button>
                  )}
                </div>

                {suggestions.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={item.url + index}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        navigateTo(item.url);
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex items-center justify-between px-3.5 py-2.5 text-[14px] cursor-pointer transition-colors ${
                        isSelected ? 'bg-amber-500/20 text-white font-semibold' : 'text-text-primary hover:bg-[#202433]'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate flex-1 mr-2">
                        {item.type === 'history' && <Clock size={16} className="text-amber-400 shrink-0" />}
                        {item.type === 'search' && <MagnifyingGlass size={16} className="text-sky-400 shrink-0" />}
                        {item.type === 'preset' && <Globe size={16} className="text-emerald-400 shrink-0" />}
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.type === 'history' && (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeUrlFromHistory(item.url);
                            reloadHistory();
                          }}
                          title="Remove from history"
                          className="opacity-50 hover:opacity-100 hover:text-red-400 p-1 rounded transition-opacity"
                        >
                          <Trash size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Toolbar Action Shortcuts: Bookmarks, History, Browser Settings Menu */}
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {/* Bookmarks Popover Button */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowBookmarksMenu(prev => !prev);
                  setShowHistoryMenu(false);
                  setShowBrowserMenu(false);
                }}
                title="Bookmarks"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  showBookmarksMenu ? 'bg-[#222736] text-amber-400' : 'text-text-muted hover:bg-[#1f2330] hover:text-white'
                }`}
              >
                <BookmarkSimple size={17} weight="bold" />
              </button>

              {/* Bookmarks Dropdown */}
              {showBookmarksMenu && (
                <div className="absolute right-0 top-[38px] z-50 w-72 rounded-xl bg-[#161822] border border-[#2b3042] shadow-2xl overflow-hidden py-2 animate-dropdown">
                  <div className="px-3.5 py-1.5 text-[11.5px] font-bold text-text-faint uppercase tracking-wider flex items-center justify-between border-b border-border/40 pb-1.5 mb-1">
                    <span>Bookmarks ({bookmarks.length})</span>
                    {bookmarks.length > 0 && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          localStorage.removeItem(BOOKMARKS_KEY);
                          setBookmarks([]);
                        }}
                        className="text-red-400 hover:underline text-[10.5px] normal-case"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {bookmarks.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[12.5px] text-text-faint">
                        No bookmarks saved yet.<br />Click the ⭐ in the URL bar to bookmark pages!
                      </div>
                    ) : (
                      bookmarks.map(bm => (
                        <div
                          key={bm.url}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            navigateTo(bm.url);
                          }}
                          className="flex items-center justify-between px-3 py-2 text-[13px] hover:bg-[#202433] cursor-pointer text-text-muted hover:text-white transition-colors group"
                        >
                          <div className="flex items-center gap-2 truncate mr-2">
                            <Star size={13} weight="fill" className="text-amber-400 shrink-0" />
                            <span className="truncate">{bm.title || bm.url}</span>
                          </div>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleBookmark(bm.url);
                              reloadBookmarks();
                            }}
                            title="Remove bookmark"
                            className="opacity-40 group-hover:opacity-100 hover:text-red-400 p-1"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* History Popover Button */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowHistoryMenu(prev => !prev);
                  setShowBookmarksMenu(false);
                  setShowBrowserMenu(false);
                }}
                title="History"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  showHistoryMenu ? 'bg-[#222736] text-amber-400' : 'text-[#8b9bb4] hover:bg-[#1f2330] hover:text-white'
                }`}
              >
                <Clock size={17} weight="bold" />
              </button>

              {/* History Dropdown */}
              {showHistoryMenu && (
                <div className="absolute right-0 top-[38px] z-50 w-80 rounded-xl bg-[#161822] border border-[#2b3042] shadow-2xl overflow-hidden py-2 animate-dropdown">
                  <div className="px-3.5 py-1.5 text-[11.5px] font-bold text-text-faint uppercase tracking-wider flex items-center justify-between border-b border-border/40 pb-1.5 mb-1">
                    <span>Browsing History</span>
                    {history.length > 0 && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          localStorage.removeItem(HISTORY_KEY);
                          setHistory([]);
                        }}
                        className="text-red-400 hover:underline text-[10.5px] normal-case"
                      >
                        Clear history
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {history.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[12.5px] text-text-faint">
                        No browsing history recorded yet.
                      </div>
                    ) : (
                      history.map((urlItem) => (
                        <div
                          key={urlItem}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            navigateTo(urlItem);
                          }}
                          className="flex items-center justify-between px-3 py-2 text-[13px] hover:bg-[#202433] cursor-pointer text-text-muted hover:text-white transition-colors group"
                        >
                          <div className="flex items-center gap-2 truncate mr-2">
                            <Clock size={13} className="text-amber-400 shrink-0" />
                            <span className="truncate">{urlItem}</span>
                          </div>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeUrlFromHistory(urlItem);
                              reloadHistory();
                            }}
                            title="Remove"
                            className="opacity-40 group-hover:opacity-100 hover:text-red-400 p-1"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Browser Settings & Menu (3 dots) */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowBrowserMenu(prev => !prev);
                  setShowBookmarksMenu(false);
                  setShowHistoryMenu(false);
                }}
                title="Browser Settings & Menu"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  showBrowserMenu ? 'bg-[#222736] text-amber-400' : 'text-[#8b9bb4] hover:bg-[#1f2330] hover:text-white'
                }`}
              >
                <DotsThreeVertical size={18} weight="bold" />
              </button>

              {/* Browser Menu Dropdown */}
              {showBrowserMenu && (
                <div className="absolute right-0 top-[38px] z-50 w-56 rounded-xl bg-[#161822] border border-[#2b3042] shadow-2xl overflow-hidden p-1.5 animate-dropdown">
                  <div className="px-3 py-1 text-[10.5px] font-bold text-text-faint uppercase tracking-wider">
                    Browser Menu
                  </div>
                  <button
                    onClick={() => {
                      onAddTab();
                      setShowBrowserMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-muted hover:bg-[#202433] hover:text-white transition-colors text-left font-medium"
                  >
                    <Plus size={15} className="text-amber-400" />
                    <span>New Tab</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowBookmarksMenu(true);
                      setShowBrowserMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-muted hover:bg-[#202433] hover:text-white transition-colors text-left font-medium"
                  >
                    <BookmarkSimple size={15} className="text-amber-400" />
                    <span>Bookmarks Manager</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowHistoryMenu(true);
                      setShowBrowserMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-muted hover:bg-[#202433] hover:text-white transition-colors text-left font-medium"
                  >
                    <Clock size={15} className="text-amber-400" />
                    <span>Browsing History</span>
                  </button>
                  <div className="my-1 border-t border-border/40" />
                  <button
                    onClick={() => {
                      onTabSelect('');
                      setShowBrowserMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-muted hover:bg-[#202433] hover:text-white transition-colors text-left font-medium"
                  >
                    <Gear size={15} className="text-amber-400" />
                    <span>Browser Settings</span>
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem(HISTORY_KEY);
                      localStorage.removeItem(BOOKMARKS_KEY);
                      setHistory([]);
                      setBookmarks([]);
                      setShowBrowserMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-red-400 hover:bg-error-soft transition-colors text-left font-medium"
                  >
                    <Trash size={15} />
                    <span>Clear Browsing Data</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Animated orange loading bar at bottom of URL bar */}
          {activeTab?.isLoading && (
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-amber-500/20 overflow-hidden z-20">
              <div className="h-full bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 animate-pulse w-full shadow-lg shadow-amber-500/50" style={{ animationDuration: '0.7s' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TitleBar;