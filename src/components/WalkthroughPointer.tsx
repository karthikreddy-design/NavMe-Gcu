"use client";

import { useEffect, useState } from "react";
import type { MpSdk } from "@matterport/sdk";
import { surfaceRing } from "@/data/surfaceRing";
import styles from "./WalkthroughPointer.module.css";

type Hit = Pick<MpSdk.Pointer.Intersection, "position" | "normal">;

export default function WalkthroughPointer({ sdk, mode, viewer, suppressed = false }: {
  sdk: MpSdk | null;
  mode: MpSdk.Mode.Mode | null;
  viewer: HTMLElement | null;
  suppressed?: boolean;
}) {
  const [pose, setPose] = useState<MpSdk.Camera.Pose | null>(null);
  const [hit, setHit] = useState<Hit | null>(null);
  const [frame, setFrame] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const walkthrough = !!sdk && (mode === sdk.Mode.Mode.INSIDE || mode === sdk.Mode.Mode.PANO360);

  useEffect(() => {
    if (!sdk || !mode) return;
    // Keep the faulty native reticle hidden throughout walkthrough and flights.
    const hidden = mode === sdk.Mode.Mode.INSIDE || mode === sdk.Mode.Mode.PANO360 || mode === sdk.Mode.Mode.TRANSITIONING;
    void sdk.Pointer.setVisible(!hidden).catch((cause: unknown) => {
      console.warn("Could not update the native navigation pointer.", cause);
    });
  }, [sdk, mode]);

  useEffect(() => {
    if (!sdk) return;
    return () => { void sdk.Pointer.setVisible(true).catch(() => undefined); };
  }, [sdk]);

  useEffect(() => {
    if (!sdk || !viewer || !walkthrough) return;
    const iframe = viewer.querySelector("iframe");
    if (!iframe) return;
    const clear = () => setHit(null);
    const measure = () => {
      const rect = iframe.getBoundingClientRect(), parent = viewer.getBoundingClientRect();
      setFrame({ left: rect.left - parent.left, top: rect.top - parent.top, width: rect.width, height: rect.height });
    };
    const camera = sdk.Camera.pose.subscribe(setPose);
    let initialIntersection = true;
    const pointer = sdk.Pointer.intersection.subscribe((intersection) => {
      // The initial value can be a stale hit from the previous view. Parent
      // :hover does not propagate through a cross-origin iframe in Chrome.
      if (initialIntersection) { initialIntersection = false; clear(); return; }
      if (intersection.object !== sdk.Pointer.Colliders.MODEL) {
        clear();
        return;
      }
      setHit({ position: { ...intersection.position }, normal: { ...intersection.normal } });
    });
    const observer = new ResizeObserver(measure);
    observer.observe(viewer);
    observer.observe(iframe);
    measure();
    // Events in the parent document mean the cursor is over our UI, not the scan.
    window.addEventListener("pointermove", clear);
    window.addEventListener("blur", clear);
    iframe.addEventListener("pointerleave", clear);
    return () => {
      camera.cancel();
      pointer.cancel();
      observer.disconnect();
      window.removeEventListener("pointermove", clear);
      window.removeEventListener("blur", clear);
      iframe.removeEventListener("pointerleave", clear);
    };
  }, [sdk, viewer, walkthrough]);

  if (suppressed || !sdk || !walkthrough || !pose || !hit || !frame.width || !frame.height) return null;
  const viewport = { w: frame.width, h: frame.height };
  const center = sdk.Conversion.worldToScreen(hit.position, pose, viewport);
  if (![center.x, center.y, center.z].every(Number.isFinite) || center.z > 1 ||
      center.x < 0 || center.x > frame.width || center.y < 0 || center.y > frame.height) return null;
  const points = surfaceRing(hit.position, hit.normal).map((point) => sdk.Conversion.worldToScreen(point, pose, viewport));
  if (!points.length || points.some((p) => ![p.x, p.y, p.z].every(Number.isFinite) || p.z > 1)) return null;
  const diameter = Math.max(Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)));
  const scale = diameter > 0 ? Math.max(32, Math.min(110, diameter)) / diameter : 1;
  const path = points.map((p, i) => `${i ? "L" : "M"}${(center.x + (p.x - center.x) * scale).toFixed(2)} ${(center.y + (p.y - center.y) * scale).toFixed(2)}`).join(" ") + " Z";
  return <svg className={styles.layer} style={frame} viewBox={`0 0 ${frame.width} ${frame.height}`}
    data-testid="walkthrough-ring" aria-hidden="true" focusable="false">
    <path className={styles.ring} d={path} />
  </svg>;
}
