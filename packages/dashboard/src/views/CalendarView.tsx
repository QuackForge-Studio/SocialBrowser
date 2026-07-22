import React, { useState, useEffect, useCallback } from "react";
import type { Post, Draft, Account, DashboardBridge } from "../types";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getBridge(): DashboardBridge | undefined { return window.__socialBrowserDashboard; }

export function CalendarView() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) { setLoading(false); return; }
    bridge.getPosts({ limit: 500 }).then((d: any) => { setPosts(d as Post[]); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const isToday = (y: number, m: number, d: number) => y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
  const formatDate = (y: number, m: number, d: number) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const getPostsForDate = (ds: string) => posts.filter(p => p.publishedAt?.startsWith(ds));

  const prevMonth = () => currentMonth === 0 ? (setCurrentMonth(11), setCurrentYear(currentYear-1)) : setCurrentMonth(currentMonth-1);
  const nextMonth = () => currentMonth === 11 ? (setCurrentMonth(0), setCurrentYear(currentYear+1)) : setCurrentMonth(currentMonth+1);
  const goToToday = () => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()); };

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-[16px]">Loading calendar...</p>
      </div>
    </div>
  );

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  return (
    <div className="flex h-full flex-col p-6" style={{ WebkitAppRegion: 'no-drag' as any }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[19px] font-semibold text-text">Calendar</h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-dim transition-colors hover:bg-bg-hover hover:text-text">&larr;</button>
          <span className="min-w-[150px] text-center text-[16px] font-medium text-text">{MONTHS[currentMonth]} {currentYear}</span>
          <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-dim transition-colors hover:bg-bg-hover hover:text-text">&rarr;</button>
          <button onClick={goToToday} className="rounded-lg border border-border px-3 py-1.5 text-[14px] text-text-dim transition-colors hover:bg-bg-hover hover:text-text">Today</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0 overflow-y-auto">
        {DAYS.map(d => <div key={d} className="py-1.5 text-center text-[13px] font-semibold uppercase tracking-wider text-text-faint">{d}</div>)}
        {calendarDays.map((day, idx) => {
          if (day === null) return <div key={"e-"+idx} className="rounded-lg border border-dashed border-border/30 min-h-[80px]" />;
          const dateStr = formatDate(currentYear, currentMonth, day);
          const dayPosts = getPostsForDate(dateStr);
          const isCur = isToday(currentYear, currentMonth, day);
          return (
            <div key={dateStr} className={["rounded-lg border p-2 min-h-[80px] transition-colors",
              isCur ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover",
            ].join(" ")}>
              <div className={["text-[14px] font-medium mb-1", isCur ? "text-accent" : "text-text-dim"].join(" ")}>{day}</div>
              {dayPosts.slice(0, 3).map(p => (
                <div key={p.id} className="mb-0.5 flex items-center gap-1.5 rounded bg-bg-elevated px-1.5 py-0.5 text-[12px] text-text-dim" title={p.contentText?.slice(0, 100)}>
                  <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: p.compositeScore ? p.compositeScore >= 70 ? '#34d399' : p.compositeScore >= 40 ? '#fbbf24' : '#f87171' : 'var(--color-text-faint)' }} />
                  <span className="truncate">{p.compositeScore?.toFixed(0) ?? "?"}</span>
                </div>
              ))}
              {dayPosts.length > 3 && <div className="text-[11px] text-text-faint">+{dayPosts.length-3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}