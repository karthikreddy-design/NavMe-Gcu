"use client";

import { useEffect, useId, useState } from "react";
import { flushSync } from "react-dom";
import ViewModeIcon from "./ViewModeIcon";
import styles from "./ViewModeControls.module.css";

export type CampusView = "dollhouse" | "floorplan" | "walkthrough";

const views: { view: CampusView; label: string; tooltip: string }[] = [
  { view: "dollhouse", label: "Dollhouse view", tooltip: "View Dollhouse" },
  { view: "floorplan", label: "Floor plan view", tooltip: "View Floor Plan" },
  { view: "walkthrough", label: "Walkthrough view", tooltip: "View 3D Space" },
];

export default function ViewModeControls({ viewer, activeView, busy, onChange, hideCredit = false }: {
  viewer: HTMLElement;
  activeView: CampusView | null;
  busy: boolean;
  hideCredit?: boolean;
  onChange: (view: CampusView) => void;
}) {
  const tooltipId = useId();
  const [hoveredView, setHoveredView] = useState<CampusView | null>(null);
  const [focusedView, setFocusedView] = useState<CampusView | null>(null);
  const visibleTooltip = hoveredView ?? focusedView;
  const [frame, setFrame] = useState<{
    left: number; top: number; width: number; creditLeft: number; creditWidth: number;
  } | null>(null);
  useEffect(() => {
    const iframe = viewer.querySelector("iframe");
    if (!iframe) return;
    const measure = () => {
      const parent = viewer.getBoundingClientRect();
      const rect = iframe.getBoundingClientRect();
      const creditWidth = rect.width < 420 ? 112 : 148;
      const reservedWidth = hideCredit ? 80 : creditWidth;
      setFrame({ left: rect.left - parent.left + 8,
        top: rect.bottom - parent.top - 66,
        width: Math.min(242, Math.max(0, rect.width - reservedWidth - 24)),
        creditLeft: rect.right - parent.left - creditWidth - 8,
        creditWidth });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewer);
    observer.observe(iframe);
    measure();
    return () => observer.disconnect();
  }, [viewer, hideCredit]);

  if (!frame) return null;
  return <>
  {hoveredView && <div className={styles.hoverDismiss} aria-hidden="true"
    onPointerEnter={() => flushSync(() => setHoveredView(null))}
    onPointerMove={() => flushSync(() => setHoveredView(null))} />}
  <nav className={styles.controls} style={{ left: frame.left, top: frame.top, width: frame.width }} aria-label="Campus view controls" aria-busy={busy}
    onKeyDown={(event) => { if (event.key === "Escape") { setHoveredView(null); setFocusedView(null); } }}>
    {views.map(({ view, label, tooltip }) => <button key={view} type="button" className={styles.button}
      aria-label={label} aria-describedby={`${tooltipId}-${view}`} aria-pressed={activeView === view} disabled={busy}
      data-hovered={hoveredView === view}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") setHoveredView(view); }} onPointerLeave={() => setHoveredView(null)}
      onPointerMove={(event) => { if (event.pointerType !== "touch") setHoveredView(view); }}
      onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) { setHoveredView(null); setFocusedView(view); } }}
      onBlur={() => setFocusedView(null)} onClick={() => onChange(view)}>
      <ViewModeIcon view={view} />
      <span className={styles.tooltip} id={`${tooltipId}-${view}`} role="tooltip" data-visible={visibleTooltip === view}>{tooltip}</span>
    </button>)}
  </nav>
  {!hideCredit && <div className={styles.credit} style={{ left: frame.creditLeft, top: frame.top, width: frame.creditWidth }} data-testid="navme-credit">
    <strong className={styles.creditName}>Nav<span>Me</span></strong>{" "}
    <span className={styles.creditCaption}>powered by</span>{" "}
    <span className={styles.creditCaption}>MetaDigi Labs, Inc.</span>
  </div>}
  </>;
}
