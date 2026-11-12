"use client";
import { useEffect, useState } from "react";
import type { MpSdk } from "@matterport/sdk";
import type { Billboard } from "@/data/billboards";
import styles from "./Billboards.module.css";

type Props = { sdk: MpSdk; viewer: HTMLElement; billboards: Billboard[]; admin: boolean; onOpen: (billboard: Billboard) => void };
export default function BillboardLayer({ sdk, viewer, billboards, admin, onOpen }: Props) {
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
  return <div className={`${styles.billboardLayer} ${overview ? styles.overviewBillboards : ""}`} aria-label="Campus billboards" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
    {billboards.filter((b) => admin || (b.enabled && b.published)).map((billboard) => {
      const p = sdk.Conversion.worldToScreen(billboard.position, pose, { w: frame.w, h: frame.h });
      if (![p.x, p.y, p.z].every(Number.isFinite) || p.x < 0 || p.x > frame.w || p.y < 0 || p.y > frame.h || p.z > 1) return null;
      return <div key={billboard.id} className={styles.billboardAnchor} style={{ left: p.x, top: p.y }}>
        <div className={styles.billboard} role="group" aria-label={`${billboard.title} billboard`}>
          {admin && <small className={styles.billboardStatus}>{!billboard.enabled ? "Disabled" : billboard.published ? "Published" : "Draft"}</small>}
          <div className={styles.billboardHeading}>
            <svg className={styles.billboardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 6c-3-3-7-3-10-2v14c4-1 7 0 10 3 3-3 6-4 10-3V4c-3-1-7-1-10 2Zm0 0v15" />
            </svg>
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
