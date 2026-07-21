import React, { useState, useEffect, useCallback, useRef } from "react";

// ── palette ──

const C = {
  bg: "#1a1a2e",
  surface: "#16213e",
  primary: "#0f3460",
  accent: "#e94560",
  text: "#eee",
  textDim: "#888",
  success: "#2ecc71",
  error: "#e74c3c",
  warning: "#f39c12",
  border: "#2a2a4a",
};

export interface DenialBannerMessage {
  id: string;
  text: string;
  type?: "error" | "warning";
}

export interface DenialBannerProps {
  /** Single message to display */
  message?: string;
  /** Type of the banner styling */
  type?: "error" | "warning";
  /** Auto-dismiss timeout in ms (default 5000). Set to 0 to disable. */
  dismissMs?: number;
  /** Called when the banner is dismissed */
  onDismiss?: () => void;
}

const bannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  animation: "denialSlideIn 0.3s ease-out",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  fontSize: 14,
  padding: "2px 6px",
  marginLeft: 12,
  opacity: 0.7,
  flexShrink: 0,
};

/**
 * A single denial/error banner that auto-dismisses after a configurable timeout.
 * Multiple DenialBanner instances can be stacked vertically.
 */
export function DenialBanner({
  message,
  type = "error",
  dismissMs = 5000,
  onDismiss,
}: DenialBannerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    if (dismissMs > 0 && message) {
      timerRef.current = setTimeout(handleDismiss, dismissMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismissMs, handleDismiss, message]);

  if (!message) return null;

  const isWarning = type === "warning";
  const bgColor = isWarning ? "rgba(243, 156, 18, 0.15)" : "rgba(231, 76, 60, 0.15)";
  const borderColor = isWarning ? C.warning : C.error;
  const textColor = isWarning ? C.warning : C.error;

  return (
    <div
      style={{
        ...bannerStyle,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderLeft: `4px solid ${borderColor}`,
        color: textColor,
      }}
      role="alert"
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={handleDismiss}
        style={closeBtn}
        title="Dismiss"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Container that manages a stack of denial banners.
 * Use addBanner(text, type) to push a new banner; it auto-dismisses after 5s.
 */
export function useDenialBanners() {
  const [banners, setBanners] = useState<DenialBannerMessage[]>([]);

  const addBanner = useCallback(
    (text: string, type: "error" | "warning" = "error") => {
      const id = `denial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setBanners((prev) => [...prev, { id, text, type }]);
    },
    []
  );

  const dismissBanner = useCallback((id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setBanners([]);
  }, []);

  const bannerElements = banners.map((b) => (
    <DenialBanner
      key={b.id}
      message={b.text}
      type={b.type}
      onDismiss={() => dismissBanner(b.id)}
    />
  ));

  return {
    banners,
    addBanner,
    dismissBanner,
    clearAll,
    /** JSX element array to render in your component */
    bannerElements,
  };
}

export default DenialBanner;
