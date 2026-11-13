"use client";
import { useEffect, useState } from "react";
import type { MpSdk } from "@matterport/sdk";
import type { Billboard } from "@/data/billboards";
import styles from "./Billboards.module.css";
import BillboardIcon from "./BillboardIcon";
import { layoutBillboards, layoutFixedBillboards } from "@/data/billboardLayout";

type Props = { sdk: MpSdk; viewer: HTMLElement; billboards: Billboard[]; buildingName: string; admin: boolean; onOpen: (billboard: Billboard) => void };
export default function BillboardLayer({ sdk, viewer, billboards, buildingName, admin, onOpen }: Props) {
  const [pose, setPose] = useState<MpSdk.Camera.Pose | null>(null);
  const [frame, setFrame] = useState({ x: 0, y: 0, w: 0, h: 0 });
  useEffect(() => {
    const subscription = sdk.Camera.pose.subscribe(setPose);
    const iframe = viewer.querySelector("iframe");
    const measure = () => {
      const rect = iframe?.getBoundingClientRect();
      const parent = viewer.getBoundingClientRect();
      if (rect) setFrame({ x: rect.left - parent.left, y: rect.top - parent.top, w: rect.width, h: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewer);
    if (iframe) observer.observe(iframe);
    return () => { subscription.cancel(); observer.disconnect(); };
  }, [sdk, viewer]);
  if (!pose || !frame.w || !frame.h) return null;
  const overview = pose.mode === sdk.Mode.Mode.DOLLHOUSE || pose.mode === sdk.Mode.Mode.FLOORPLAN;
  const baseWidth = 112;
  const baseHeight = 79;
  const projected = billboards.filter((b) => admin || (b.enabled && b.published)).flatMap((billboard) => {
    const anchor = sdk.Conversion.worldToScreen(billboard.position, pose, { w: frame.w, h: frame.h });
    // A fixed world offset keeps floor-mounted signs at the same height as
    // the viewer moves; it never depends on the camera's height or distance.
    const lift = overview ? 0 : 0.65;
    const signPosition = { ...billboard.position, y: billboard.position.y + lift };
    const sign = sdk.Conversion.worldToScreen(signPosition, pose, { w: frame.w, h: frame.h });
    // Center walkthrough cards over their floor anchor so the stem is vertical.
    const p = overview ? sign : { ...sign, x: anchor.x };
    if (![p.x, p.y, p.z].every(Number.isFinite) || p.x < 0 || p.x > frame.w || p.y < 0 || p.y > frame.h || p.z > 1) return [];
    const pixelsPerUnit = overview ? Math.max(...(["x", "y", "z"] as const).map((axis) => {
      const q = sdk.Conversion.worldToScreen({ ...signPosition, [axis]: signPosition[axis] + 1 }, pose, { w: frame.w, h: frame.h });
      const distance = Math.hypot(q.x - p.x, q.y - p.y);
      return Number.isFinite(distance) ? distance : 0;
    })) : 0;
    const displayWidth = overview
      ? Math.max(76, Math.min(140, pixelsPerUnit * 4))
      : 104;
    const scale = displayWidth / baseWidth;
    const distance = Math.hypot(signPosition.x - pose.position.x, signPosition.y - pose.position.y, signPosition.z - pose.position.z);
    return [{ billboard, id: billboard.id, x: p.x, y: p.y, anchor, width: displayWidth, height: (baseHeight + 14) * scale, scale, distance }];
  });
  const layout = overview ? layoutBillboards(projected, frame.w, frame.h) : layoutFixedBillboards(projected, frame.w, frame.h);
  return <div className={`${styles.billboardLayer} ${styles.compactBillboards}`} aria-label="Campus billboards" data-view-mode={overview ? "overview" : "walkthrough"} style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
    <svg className={`${styles.billboardLeaders} ${!overview ? styles.walkthroughStems : ""}`} aria-hidden="true">
      {layout.map((card) => {
        const anchor = projected.find((item) => item.id === card.id)!.anchor;
        if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;
        return <g key={card.id}>
          <line x1={anchor.x} y1={anchor.y} x2={card.left + card.width / 2} y2={card.top + card.height - 3} />
          {overview ? <circle cx={anchor.x} cy={anchor.y} r="3" />
            : <ellipse cx={anchor.x} cy={anchor.y} rx="8" ry="3" />}
        </g>;
      })}
    </svg>
    {layout.map((card) => {
      const item = projected.find((p) => p.id === card.id)!;
      const { billboard } = item;
      return <div key={billboard.id} className={styles.billboardAnchor} style={{ left: card.left, top: card.top, width: card.width, height: card.height }}>
        <div className={styles.billboard} role="group" aria-label={`${billboard.title} billboard`}
          style={{ transform: `scale(${item.scale * card.factor})` }}
          title={admin ? `${billboard.title} — ${!billboard.enabled ? "Disabled" : billboard.published ? "Published" : "Draft"}` : billboard.title}>
          <div className={styles.billboardHeading}>
            <BillboardIcon buildingName={buildingName} className={styles.billboardIcon} />
            <span className={styles.billboardTitle} title={billboard.title}>{billboard.title}</span>
          </div>
          <button className={styles.billboardView} type="button" onClick={() => onOpen(billboard)} aria-label={`View ${billboard.title}`}>
            <span>View</span>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
          </button>
        </div>
      </div>;
    })}
  </div>;
}
