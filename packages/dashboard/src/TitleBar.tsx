import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, X, SquaresFour, ArrowLeft, ArrowRight, ArrowClockwise, List, Lock, CircleNotch, Clock, MagnifyingGlass, Globe, Trash, Star, BookmarkSimple, DotsThreeVertical, Gear, Copy, Check, SlidersHorizontal, ShieldCheck, Cookie, CaretRight, ArrowSquareOut, Info, ShieldWarning, Shield } from '@phosphor-icons/react';
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
  onNavigateView?: (view: DashboardView) => void;
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

interface SuggestionItem {
  type: 'history' | 'preset' | 'search';
  url: string;
  label: string;
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

    let effectiveHost = '';
    try {
      const u = new URL(effectiveUrl.startsWith('http') ? effectiveUrl : `https://${effectiveUrl}`);
      effectiveHost = u.hostname.replace(/^www\./, '');
    } catch {}

    if (!effectiveHost) return '';

    // Check if active tab has matching domain and a favicon
    if (activeTab?.favicon && activeTab.url) {
      try {
        const activeHost = new URL(activeTab.url).hostname.replace(/^www\./, '');
        if (activeHost === effectiveHost) {
          return activeTab.favicon;
        }
      } catch {}
    }

    // Check if any open tab has matching domain and a favicon
    const matchingTab = tabs.find(t => {
      if (!t.url || !t.favicon) return false;
      try {
        return new URL(t.url).hostname.replace(/^www\./, '') === effectiveHost;
      } catch {
        return false;
      }
    });
    if (matchingTab?.favicon) return matchingTab.favicon;

    // Fallback to Google S2 Favicon API for effectiveHost
    return `https://www.google.com/s2/favicons?domain=${effectiveHost}&sz=64`;
  }, [isSecure, effectiveUrl, activeTab, tabs]);

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

export function TitleBar({ tabs, activeTabId, activeView, sidebarOpen, onTabSelect, onTabClose, onAddTab, onToggleSidebar, onNavigateView }: TitleBarProps) {
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
  const [showSiteInfoMenu, setShowSiteInfoMenu] = useState(false);
  const [showAdBlockMenu, setShowAdBlockMenu] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [adBlockEnabled, setAdBlockEnabled] = useState(true);
  const [adBlockStats, setAdBlockStats] = useState<{ totalBlocked: number; tabBlocked: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const [isUrlActionsHovered, setIsUrlActionsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleActionsMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsUrlActionsHovered(true);
    }, 100);
  };

  const handleActionsMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsUrlActionsHovered(false);
    }, 250);
  };

  const isActionsExpanded = isUrlActionsHovered || showSiteInfoMenu || showAdBlockMenu;

  // Loading progress bar state machine: Smooth continuous CSS transition, accelerating fast to 100% on finish
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'finishing' | 'fade-out'>('idle');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const prevLoadingRef = useRef<boolean>(false);
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeTab = tabs.find(t => t.id === activeTabId);

  useEffect(() => {
    const isLoading = !!activeTab?.isLoading;

    if (isLoading) {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setLoadingState('loading');
      setLoadingProgress(88);
    } else if (prevLoadingRef.current && !isLoading) {
      // Just finished loading! Accelerate rapidly from current position to 100% in 220ms
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);

      setLoadingProgress(100);
      setLoadingState('finishing');

      loadingTimerRef.current = setTimeout(() => {
        setLoadingState('fade-out');

        loadingTimerRef.current = setTimeout(() => {
          setLoadingState('idle');
          setLoadingProgress(0);
        }, 300);
      }, 200);
    } else if (!isLoading && loadingState === 'idle') {
      setLoadingProgress(0);
    }

    prevLoadingRef.current = isLoading;
  }, [activeTab?.isLoading]);

  useEffect(() => {
    const isOpen = showSiteInfoMenu || showAdBlockMenu || showBookmarksMenu || showHistoryMenu || showBrowserMenu || showAboutModal;
    const bridge = (window as any).__socialBrowserDashboard;
    if (bridge?.setPopoverOpen) {
      bridge.setPopoverOpen(isOpen);
    }
  }, [showSiteInfoMenu, showAdBlockMenu, showBookmarksMenu, showHistoryMenu, showBrowserMenu, showAboutModal]);

  useEffect(() => {
    if (showAdBlockMenu) {
      const bridge = (window as any).__socialBrowserDashboard;
      if (bridge?.getAdBlockStats) {
        bridge.getAdBlockStats(activeTabId).then((res: any) => {
          if (res) {
            setAdBlockEnabled(res.enabled);
            setAdBlockStats({ totalBlocked: res.totalBlocked, tabBlocked: res.tabBlocked });
          }
        }).catch(() => {});
      }
    }
  }, [showAdBlockMenu, activeTabId]);

  const [siteInfoView, setSiteInfoView] = useState<'main' | 'security' | 'cookies'>('main');
  const [clearedSiteDataStatus, setClearedSiteDataStatus] = useState<string | null>(null);

  const closeAllPopovers = React.useCallback(() => {
    setShowBookmarksMenu(false);
    setShowHistoryMenu(false);
    setShowBrowserMenu(false);
    setShowSiteInfoMenu(false);
    setShowAdBlockMenu(false);
    setIsInputFocused(false);
    setSelectedIndex(-1);
    setSiteInfoView('main');
    setClearedSiteDataStatus(null);
  }, []);

  useEffect(() => {
    const isAnyPopoverOpen =
      showBookmarksMenu ||
      showHistoryMenu ||
      showBrowserMenu ||
      showSiteInfoMenu ||
      showAdBlockMenu ||
      isInputFocused;

    if (!isAnyPopoverOpen) return;

    const handleOutsideClick = () => {
      closeAllPopovers();
    };

    const handleWindowBlur = () => {
      closeAllPopovers();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('blur', handleWindowBlur);

    const bridge = (window as any).__socialBrowserDashboard;
    let unsub: (() => void) | undefined;
    if (bridge?.onClosePopovers) {
      unsub = bridge.onClosePopovers(() => {
        closeAllPopovers();
      });
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('blur', handleWindowBlur);
      if (unsub) unsub();
    };
  }, [
    showBookmarksMenu,
    showHistoryMenu,
    showBrowserMenu,
    showSiteInfoMenu,
    showAdBlockMenu,
    isInputFocused,
    closeAllPopovers,
  ]);

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.preventDefault();
    const urlToCopy = currentUrl || activeTab?.url || '';
    if (!urlToCopy) return;
    navigator.clipboard.writeText(urlToCopy);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
  };
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingNavRef = useRef<{ url: string; time: number } | null>(null);
  const wasFocusedAndSelectedRef = useRef(false);
  const [navAnimClass, setNavAnimClass] = useState('');
  const navAnimTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    let clean = full.replace(/^https?:\/\/(www\.)?/, '');
    if (clean.endsWith('/') && clean.indexOf('/') === clean.length - 1) {
      clean = clean.slice(0, -1);
    }

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

    if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('about:') && !target.startsWith('socialbrowser://')) {
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
        <div
          className="mt-[5px] relative flex items-center gap-2 h-[46px] px-3.5 rounded-t-[15px] bg-[#161925] border border-[#2d3345] shadow-xs transition-all duration-200"
          style={{
            marginLeft: sidebarOpen ? '238px' : '5px',
            marginRight: '5px',
            WebkitAppRegion: 'no-drag' as any,
          }}
        >
          <button onClick={() => sendNav('javascript:history.back()', 'back')} title="Back"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[#202535] hover:text-white transition-all"><ArrowLeft size={16} weight="bold" /></button>
          <button onClick={() => sendNav('javascript:history.forward()', 'forward')} title="Forward"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[#202535] hover:text-white transition-all"><ArrowRight size={16} weight="bold" /></button>
          <button onClick={() => sendNav('javascript:location.reload()')} title="Reload"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[#202535] hover:text-white transition-all mr-0.5">
            <ArrowClockwise size={16} weight="bold" />
          </button>

          <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="relative flex-1 flex items-center rounded-xl bg-[#0e1017] border border-[#272d3e] focus-within:border-amber-500/70 focus-within:ring-2 focus-within:ring-amber-500/20 px-3 h-8.5 text-[13.5px] transition-all shadow-inner group"
          >
            {/* Left Section: Favicon / Secure Site Icon */}
            <div className="flex items-center gap-1 shrink-0 mr-1.5" style={{ WebkitAppRegion: 'no-drag' as any }}>
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
            </div>

            {/* Middle Section: URL Input Box */}
            <div className="flex-1 flex items-center min-w-0 relative">
              <input
                ref={inputRef}
                type="text"
                value={isInputFocused ? urlInput : getUnfocusedDisplayText()}
                onChange={handleInputChange}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  wasFocusedAndSelectedRef.current = isInputFocused && isAllSelected;
                }}
                onFocus={(e) => {
                  reloadHistory();
                  setIsInputFocused(true);
                  setIsAllSelected(true);
                  setSelectedIndex(-1);
                  setHasInlineCompletion(false);

                  const full = currentUrl || activeTab?.url || '';
                  let clean = full.replace(/^https?:\/\/(www\.)?/, '');
                  if (clean.endsWith('/') && clean.indexOf('/') === clean.length - 1) {
                    clean = clean.slice(0, -1);
                  }
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
                    let full = currentUrl || activeTab?.url || '';
                    if (full.endsWith('/') && (full.match(/\//g) || []).length === 3) {
                      full = full.slice(0, -1);
                    }
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
                className={`url-input-box flex-1 min-w-0 bg-transparent text-[13.5px] outline-none border-none placeholder:text-text-faint font-medium truncate transition-colors duration-150 ${
                  isInputFocused || isHovered ? 'text-white' : 'text-[#8b9bb4] group-hover:text-white focus:text-white'
                } ${navAnimClass}`}
                style={{ WebkitAppRegion: 'no-drag' as any }}
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

            {/* Right End Action Cluster (Site Info & AdBlock expand to the LEFT of Copy & Star) */}
            <div
              onMouseEnter={handleActionsMouseEnter}
              onMouseLeave={handleActionsMouseLeave}
              className="flex items-center gap-1 shrink-0 ml-1.5 select-none"
              style={{ WebkitAppRegion: 'no-drag' as any }}
            >
              {/* Expandable Action Icons (Site Info & AdBlock Engine) placed TO THE LEFT of Copy & Star */}
              <div
                className={`flex items-center gap-1 transition-all duration-300 ease-in-out ${
                  isActionsExpanded ? 'max-w-[70px] opacity-100 scale-100 pointer-events-auto mr-0.5' : 'max-w-0 opacity-0 scale-95 pointer-events-none mr-0 overflow-hidden'
                }`}
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                {/* 1. Site Information Button */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowSiteInfoMenu(prev => {
                        if (!prev) {
                          setSiteInfoView('main');
                          setClearedSiteDataStatus(null);
                        }
                        return !prev;
                      });
                      setShowAdBlockMenu(false);
                      setShowBookmarksMenu(false);
                      setShowHistoryMenu(false);
                      setShowBrowserMenu(false);
                    }}
                    title="Site Information & Security"
                    className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                      showSiteInfoMenu ? 'bg-[#222736] text-white' : 'text-text-muted hover:bg-[#222736] hover:text-white'
                    }`}
                    style={{ WebkitAppRegion: 'no-drag' as any }}
                  >
                    <SlidersHorizontal size={14} />
                  </button>

                  {/* Site Info Dropdown Card */}
                  {showSiteInfoMenu && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute right-0 top-[34px] z-50 w-80 rounded-2xl bg-[#1d202c] border border-[#2e3548] shadow-2xl overflow-hidden p-3.5 animate-dropdown text-white select-none"
                      style={{ WebkitAppRegion: 'no-drag' as any }}
                    >
                      {/* Main View */}
                      {siteInfoView === 'main' && (
                        <>
                          <div className="flex items-center justify-between border-b border-[#2b3144] pb-2.5 mb-2.5 px-1">
                            <span className="text-[14px] font-bold text-white truncate max-w-[220px]">
                              {formatDisplayUrl(currentUrl || activeTab?.url || '') || 'Current Site'}
                            </span>
                            <button
                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowSiteInfoMenu(false); }}
                              className="text-text-muted hover:text-white p-1 rounded-md hover:bg-[#272d3e]"
                              style={{ WebkitAppRegion: 'no-drag' as any }}
                            >
                              <X size={14} />
                            </button>
                          </div>

                          <div className="flex flex-col gap-1 text-[13px]">
                            {/* 1. Connection Security */}
                            <div
                              onClick={() => setSiteInfoView('security')}
                              className="flex items-center justify-between px-2.5 py-2.5 rounded-xl hover:bg-[#262b3d] cursor-pointer transition-colors group"
                            >
                              <div className="flex items-center gap-3">
                                <Lock size={16} className={currentUrl?.startsWith('https') ? 'text-emerald-400' : 'text-red-400'} />
                                <span className="font-medium text-[#e2e8f0]">
                                  {currentUrl?.startsWith('https') ? 'Connection is secure' : 'Not secure'}
                                </span>
                              </div>
                              <CaretRight size={14} className="text-text-faint group-hover:text-white" />
                            </div>

                            {/* 2. Cookies & Site Data */}
                            <div
                              onClick={() => { setSiteInfoView('cookies'); setClearedSiteDataStatus(null); }}
                              className="flex items-center justify-between px-2.5 py-2.5 rounded-xl hover:bg-[#262b3d] cursor-pointer transition-colors group"
                            >
                              <div className="flex items-center gap-3">
                                <Cookie size={16} className="text-amber-400" />
                                <span className="font-medium text-[#e2e8f0]">Cookies and site data</span>
                              </div>
                              <CaretRight size={14} className="text-text-faint group-hover:text-white" />
                            </div>

                            {/* 3. Site Settings */}
                            <div
                              onClick={() => {
                                setShowSiteInfoMenu(false);
                                onTabSelect('');
                                if (onNavigateView) onNavigateView('settings');
                              }}
                              className="flex items-center justify-between px-2.5 py-2.5 rounded-xl hover:bg-[#262b3d] cursor-pointer transition-colors group"
                            >
                              <div className="flex items-center gap-3">
                                <Gear size={16} className="text-sky-400" />
                                <span className="font-medium text-[#e2e8f0]">Site settings</span>
                              </div>
                              <ArrowSquareOut size={14} className="text-text-faint group-hover:text-white" />
                            </div>
                          </div>
                        </>
                      )}

                      {/* Security Details Sub-View */}
                      {siteInfoView === 'security' && (
                        <div>
                          <div className="flex items-center gap-2 border-b border-[#2b3144] pb-2.5 mb-3">
                            <button
                              onClick={() => setSiteInfoView('main')}
                              className="p-1 rounded-lg text-text-muted hover:text-white hover:bg-[#272d3e] transition-colors"
                            >
                              <ArrowLeft size={16} />
                            </button>
                            <span className="text-[13.5px] font-bold text-white">Connection Security</span>
                          </div>

                          <div className="bg-[#141722] rounded-xl p-3.5 border border-[#282f42] space-y-2.5">
                            <div className="flex items-center gap-2.5">
                              {currentUrl?.startsWith('https') ? (
                                <ShieldCheck size={24} className="text-emerald-400 shrink-0" />
                              ) : (
                                <ShieldWarning size={24} className="text-red-400 shrink-0" />
                              )}
                              <div>
                                <h4 className="text-[13px] font-bold text-white">
                                  {currentUrl?.startsWith('https') ? 'Your connection is private' : 'Connection is unencrypted'}
                                </h4>
                                <p className="text-[11px] text-amber-400 font-mono">
                                  {formatDisplayUrl(currentUrl || activeTab?.url || '')}
                                </p>
                              </div>
                            </div>
                            <p className="text-[11.5px] text-[#94a3b8] leading-relaxed">
                              {currentUrl?.startsWith('https')
                                ? 'Information you send to this site (passwords, messages, or cookies) is protected with 256-bit TLS encryption.'
                                : 'You should not enter sensitive info on this site (passwords, credit cards) because it could be intercepted by attackers.'}
                            </p>
                            <div className="pt-1 border-t border-[#252b3d] flex items-center justify-between text-[11px] text-text-faint">
                              <span>Certificate:</span>
                              <span className={currentUrl?.startsWith('https') ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                                {currentUrl?.startsWith('https') ? 'Valid (TLS 1.3)' : 'Insecure (HTTP)'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cookies Sub-View */}
                      {siteInfoView === 'cookies' && (
                        <div>
                          <div className="flex items-center gap-2 border-b border-[#2b3144] pb-2.5 mb-3">
                            <button
                              onClick={() => setSiteInfoView('main')}
                              className="p-1 rounded-lg text-text-muted hover:text-white hover:bg-[#272d3e] transition-colors"
                            >
                              <ArrowLeft size={16} />
                            </button>
                            <span className="text-[13.5px] font-bold text-white">Cookies & Site Storage</span>
                          </div>

                          <div className="bg-[#141722] rounded-xl p-3.5 border border-[#282f42] space-y-3">
                            <div>
                              <div className="text-[13px] font-bold text-white flex items-center gap-2">
                                <Cookie size={16} className="text-amber-400" />
                                <span>{formatDisplayUrl(currentUrl || activeTab?.url || '')}</span>
                              </div>
                              <p className="text-[11.5px] text-[#94a3b8] leading-relaxed mt-1">
                                Cookies and site data are stored in an isolated browser profile partition for this tab.
                              </p>
                            </div>

                            {clearedSiteDataStatus ? (
                              <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[12px] flex items-center justify-center gap-2">
                                <Check size={16} />
                                <span>{clearedSiteDataStatus}</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  const bridge = (window as any).__socialBrowserDashboard;
                                  if (bridge?.clearSiteData) {
                                    const res: any = await bridge.clearSiteData({ tabId: activeTabId, url: currentUrl });
                                    if (res?.success) {
                                      setClearedSiteDataStatus(`Cleared storage for ${res.domain || 'site'}`);
                                    } else {
                                      setClearedSiteDataStatus(res?.error || 'Failed to clear data');
                                    }
                                  }
                                }}
                                className="w-full py-2 px-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 hover:text-red-300 font-semibold text-[12.5px] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Trash size={15} />
                                <span>Clear Cookies & Site Data</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Brave AdBlock Engine Button */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowAdBlockMenu(prev => !prev);
                      setShowSiteInfoMenu(false);
                      setShowBookmarksMenu(false);
                      setShowHistoryMenu(false);
                      setShowBrowserMenu(false);
                    }}
                    title="Brave AdBlock Engine"
                    className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                      showAdBlockMenu ? 'bg-[#222736] text-emerald-400' : 'text-text-muted hover:bg-[#222736] hover:text-white'
                    }`}
                    style={{ WebkitAppRegion: 'no-drag' as any }}
                  >
                    <ShieldCheck size={15} className={adBlockEnabled ? 'text-emerald-400' : 'text-red-400'} />
                  </button>

                  {/* AdBlock Dropdown Popover */}
                  {showAdBlockMenu && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute right-0 top-[34px] z-50 w-80 rounded-2xl bg-[#1d202c] border border-[#2e3548] shadow-2xl overflow-hidden p-3.5 animate-dropdown text-white"
                      style={{ WebkitAppRegion: 'no-drag' as any }}
                    >
                      <div className="flex items-center justify-between border-b border-[#2b3144] pb-2.5 mb-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={18} className="text-emerald-400" />
                          <span className="text-[14px] font-bold text-white">Brave AdBlock Engine</span>
                        </div>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const bridge = (window as any).__socialBrowserDashboard;
                            if (bridge?.toggleAdBlock) {
                              bridge.toggleAdBlock().then((res: any) => {
                                if (res) setAdBlockEnabled(res.enabled);
                              });
                            }
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                            adBlockEnabled ? 'bg-emerald-500' : 'bg-gray-600'
                          }`}
                          style={{ WebkitAppRegion: 'no-drag' as any }}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            adBlockEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`} />
                        </button>
                      </div>

                      <div className="bg-[#141722] rounded-xl p-3 border border-[#282f42]">
                        <div className="text-[12.5px] font-semibold text-text-muted mb-1 flex items-center justify-between">
                          <span>Ads & Trackers Blocked:</span>
                          <span className="text-emerald-400 font-bold text-[14px]">
                            {adBlockStats?.tabBlocked ?? 0} on page
                          </span>
                        </div>
                        <div className="text-[11.5px] text-text-faint">
                          Total blocked across session: <strong className="text-white">{adBlockStats?.totalBlocked ?? 0}</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Anchored Far Right Sub-group: Copy URL & Bookmark Star */}
              <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion: 'no-drag' as any }}>
                {/* Copy URL Button */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCopyUrl(e);
                  }}
                  title={copiedUrl ? 'Copied!' : 'Copy URL'}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-[#222736] hover:text-white transition-colors relative shrink-0"
                  style={{ WebkitAppRegion: 'no-drag' as any }}
                >
                  {copiedUrl ? (
                    <Check size={14} className="text-emerald-400 font-bold" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>

                {/* Bookmark Star Button */}
                {currentUrl && currentUrl.startsWith('http') && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleBookmark(currentUrl, activeTab?.label || currentUrl);
                      reloadBookmarks();
                    }}
                    title={isCurrentUrlBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-[#222736] transition-colors shrink-0"
                    style={{ WebkitAppRegion: 'no-drag' as any }}
                  >
                    <Star
                      size={15}
                      weight={isCurrentUrlBookmarked ? 'fill' : 'regular'}
                      className={isCurrentUrlBookmarked ? 'text-amber-400' : 'text-text-muted hover:text-amber-400'}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* URL Suggestions Dropdown */}
            {isInputFocused && suggestions.length > 0 && (
              <div
                ref={dropdownRef}
                onMouseDown={(e) => e.stopPropagation()}
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
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                <BookmarkSimple size={17} weight="bold" />
              </button>

              {/* Bookmarks Dropdown */}
              {showBookmarksMenu && (
                <div onMouseDown={(e) => e.stopPropagation()} className="absolute right-0 top-[38px] z-50 w-72 rounded-xl bg-[#161822] border border-[#2b3042] shadow-2xl overflow-hidden py-2 animate-dropdown" style={{ WebkitAppRegion: 'no-drag' as any }}>
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
                  e.stopPropagation();
                  setShowHistoryMenu(prev => !prev);
                  setShowBookmarksMenu(false);
                  setShowBrowserMenu(false);
                }}
                title="History"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  showHistoryMenu ? 'bg-[#222736] text-amber-400' : 'text-[#8b9bb4] hover:bg-[#1f2330] hover:text-white'
                }`}
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                <Clock size={17} weight="bold" />
              </button>

              {/* History Dropdown */}
              {showHistoryMenu && (
                <div onMouseDown={(e) => e.stopPropagation()} className="absolute right-0 top-[38px] z-50 w-80 rounded-xl bg-[#161822] border border-[#2b3042] shadow-2xl overflow-hidden py-2 animate-dropdown" style={{ WebkitAppRegion: 'no-drag' as any }}>
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
                  e.stopPropagation();
                  setShowBrowserMenu(prev => !prev);
                  setShowBookmarksMenu(false);
                  setShowHistoryMenu(false);
                }}
                title="Browser Settings & Menu"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  showBrowserMenu ? 'bg-[#222736] text-amber-400' : 'text-[#8b9bb4] hover:bg-[#1f2330] hover:text-white'
                }`}
                style={{ WebkitAppRegion: 'no-drag' as any }}
              >
                <DotsThreeVertical size={18} weight="bold" />
              </button>

              {/* Browser Menu Dropdown */}
              {showBrowserMenu && (
                <div onMouseDown={(e) => e.stopPropagation()} className="absolute right-0 top-[38px] z-50 w-56 rounded-xl bg-[#161822] border border-[#2b3042] shadow-2xl overflow-hidden p-1.5 animate-dropdown" style={{ WebkitAppRegion: 'no-drag' as any }}>
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
                      if (onNavigateView) onNavigateView('settings');
                      setShowBrowserMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-muted hover:bg-[#202433] hover:text-white transition-colors text-left font-medium"
                  >
                    <Gear size={15} className="text-amber-400" />
                    <span>Browser Settings</span>
                  </button>
                  <button
                    onClick={async () => {
                      setShowBrowserMenu(false);
                      const bridge = (window as any).__socialBrowserDashboard;
                      if (bridge?.openDefaultBrowserTab) {
                        const res: any = await bridge.openDefaultBrowserTab({ url: 'about:social-browser' });
                        if (res?.tabId && bridge?.activateTab) {
                          await bridge.activateTab({ tabId: res.tabId });
                        }
                      }
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-text-muted hover:bg-[#202433] hover:text-white transition-colors text-left font-medium"
                  >
                    <Info size={15} className="text-amber-400" />
                    <span>About Us</span>
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

          {/* Animated orange loading line: High-contrast subtle 2.5px line with dark outline/shadow for white/light & dark web pages */}
          {loadingState !== 'idle' && (
            <div
              className="absolute -bottom-[2.5px] left-0 right-0 z-30 pointer-events-none overflow-hidden drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
              style={{
                height: loadingState === 'finishing' || loadingState === 'fade-out' ? '3px' : '2.5px',
                clipPath: loadingState === 'fade-out' ? 'inset(0 0% 0 100%)' : 'inset(0 0% 0 0%)',
                transition: 'clip-path 300ms ease-in-out, height 180ms ease-out, opacity 250ms ease-in-out',
              }}
            >
              {/* Dark track overlay for ultra high contrast against white/light background web pages */}
              <div className="absolute inset-0 bg-black/50 border-b border-[#2d3345]" />

              {/* Vibrant progress line */}
              <div
                className={`relative h-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-300 border-b border-[#2d3345] ${
                  loadingState === 'finishing'
                    ? 'opacity-100 shadow-[0_0_12px_rgba(245,158,11,1)] brightness-125'
                    : 'opacity-95 shadow-[0_0_6px_rgba(245,158,11,0.7)]'
                }`}
                style={{
                  width: `${loadingProgress}%`,
                  transition:
                    loadingState === 'finishing'
                      ? 'width 220ms cubic-bezier(0.2, 0.9, 0.3, 1)'
                      : loadingState === 'loading'
                      ? 'width 9.5s cubic-bezier(0.08, 0.6, 0.12, 1)'
                      : 'none',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* About Social Browser & AdBlock Licenses Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-dropdown">
          <div className="w-full max-w-lg rounded-2xl bg-[#161925] border border-[#2f364a] shadow-2xl p-6 relative overflow-hidden text-white">
            <button
              onClick={() => setShowAboutModal(false)}
              className="absolute right-4 top-4 text-text-muted hover:text-white p-1 rounded-lg hover:bg-[#232838]"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3.5 mb-4 pb-4 border-b border-[#2b3145]">
              <img src={logoPng} alt="Social Browser" className="h-10 w-auto" />
              <div>
                <h2 className="text-[17px] font-bold text-white leading-tight">Social Browser</h2>
                <p className="text-[12px] text-amber-400 font-medium">Version 0.2.1 (Built with Electron & Vite)</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 text-[13px] text-[#94a3b8] [::-webkit-scrollbar]:w-1.5 [::-webkit-scrollbar-thumb]:bg-[#2c3347] [::-webkit-scrollbar-thumb]:rounded-full">
              <div>
                <h3 className="text-[14px] font-bold text-white mb-1 flex items-center gap-2">
                  <ShieldCheck size={17} className="text-emerald-400" />
                  Brave AdBlock Rust Engine Integration
                </h3>
                <p className="text-[12.5px] leading-relaxed">
                  Social Browser integrates high-performance network request filter rules based on the <strong>Brave adblock-rust engine</strong> and EasyList/EasyPrivacy rulesets to block intrusive ads, trackers, and popup scripts automatically.
                </p>
              </div>

              <div className="bg-[#0e1017] p-3.5 rounded-xl border border-[#252b3c] space-y-2.5 text-[11.5px] font-mono">
                <div className="font-bold text-amber-400 text-[12px] font-sans uppercase tracking-wider">Open Source License Disclosures</div>
                <div>
                  <div className="text-white font-semibold">1. Mozilla Public License 2.0 (MPL-2.0)</div>
                  <p className="text-text-muted text-[11px] leading-normal mt-0.5">
                    Brave adblock-rust filter engine components are licensed under the Mozilla Public License v2.0. Copyright (c) Brave Software Inc. All rights reserved.
                  </p>
                </div>
                <div>
                  <div className="text-white font-semibold">2. MIT License</div>
                  <p className="text-text-muted text-[11px] leading-normal mt-0.5">
                    Copyright (c) Brave Software Inc. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files...
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#2b3145] flex justify-end">
              <button
                onClick={() => setShowAboutModal(false)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-[13px] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TitleBar;
