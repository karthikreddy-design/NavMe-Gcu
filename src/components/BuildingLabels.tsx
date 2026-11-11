"use client";

import { useEffect, useState } from "react";
import type { MpSdk } from "@matterport/sdk";
import type { Building } from "@/data/buildings";
import styles from "./BuildingLabels.module.css";

type Props = {
  sdk: MpSdk;
  viewer: HTMLElement;
  buildings: readonly Building[];
  onSelect: (building: Building) => void;
  selectedBuildingId: string | null;
  visible: boolean;
};

type ProjectedBuilding = {
  building: Building;
  x: number;
  y: number;
  hasAnchor: boolean;
};

type ProjectionViewport = {
  left: number;
  top: number;
  w: number;
  h: number;
};

export default function BuildingLabels({
  sdk,
  viewer,
  buildings,
  onSelect,
  selectedBuildingId,
  visible,
}: Props) {
  const [pose, setPose] = useState<MpSdk.Camera.Pose | null>(null);
  const [textWidths, setTextWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      context.font = "600 13px Arial";
      setTextWidths(Object.fromEntries(buildings.map((building) =>
        [building.id, Math.ceil(context.measureText(building.name).width)],
      )));
    });
    return () => { cancelled = true; };
  }, [buildings]);
  const [viewport, setViewport] = useState<ProjectionViewport>({
    left: 0,
    top: 0,
    w: 0,
    h: 0,
  });

  useEffect(() => {
    const subscription = sdk.Camera.pose.subscribe(setPose);
    const iframe = viewer.querySelector("iframe");
    const updateViewport = () => {
      const viewerRect = viewer.getBoundingClientRect();
      const frameRect = iframe?.getBoundingClientRect();
      if (!frameRect) {
        return;
      }

      setViewport({
        left: frameRect.left - viewerRect.left,
        top: frameRect.top - viewerRect.top,
        w: frameRect.width,
        h: frameRect.height,
      });
    };
    updateViewport();
    const observer = new ResizeObserver(updateViewport);

    observer.observe(viewer);
    if (iframe) {
      observer.observe(iframe);
    }

    return () => {
      subscription.cancel();
      observer.disconnect();
    };
  }, [sdk, viewer]);

  const projectedBuildings: ProjectedBuilding[] =
    pose && viewport.w > 0 && viewport.h > 0
      ? buildings.filter((building) =>
          selectedBuildingId === null || building.id === selectedBuildingId,
        ).flatMap((building) => {
          const point = sdk.Conversion.worldToScreen(
            building.position,
            pose,
            { w: viewport.w, h: viewport.h },
          );
          const hasAnchor = Number.isFinite(point.x) && Number.isFinite(point.y) &&
            point.x >= 0 && point.x <= viewport.w &&
            point.y >= 0 && point.y <= viewport.h;
          if (!hasAnchor) {
            return [];
          }

          return [
            {
              building,
              x: viewport.left + point.x,
              y: viewport.top + point.y,
              hasAnchor,
            },
          ];
        })
      : [];

  if (!visible) {
    return null;
  }

  // Start above each anchor, then choose the nearest unoccupied rectangle.
  const margin = 16;
  const gap = 10;
  const labelHeight = 36;
  const placed: { x: number; y: number; width: number }[] = [];
  const positionedBuildings = [...projectedBuildings]
    .sort((a, b) => a.building.id.localeCompare(b.building.id))
    .map((item) => {
      const labelWidth = Math.max(40, Math.min(
        (textWidths[item.building.id] ?? item.building.name.length * 8) + 26,
        240, viewport.w - margin * 2,
      ));
      const minX = viewport.left + margin;
      const maxX = Math.max(minX, viewport.left + viewport.w - margin - labelWidth);
      const minY = viewport.top + margin;
      const maxY = Math.max(minY, viewport.top + viewport.h - 80 - labelHeight);
      const preferredX = Math.max(minX, Math.min(maxX, item.x - labelWidth / 2));
      const preferredY = Math.max(minY, Math.min(maxY, item.y - labelHeight - 22));
      const xs = [preferredX, minX, maxX, ...placed.flatMap((rect) =>
        [rect.x - gap - labelWidth, rect.x + rect.width + gap])];
      const ys = [preferredY, minY, maxY, ...placed.flatMap((rect) =>
        [rect.y - gap - labelHeight, rect.y + labelHeight + gap])];
      const candidates = xs.flatMap((x) => ys.map((y) => ({ x, y })))
        .filter(({ x, y }) => x >= minX && x <= maxX && y >= minY && y <= maxY)
        .sort((a, b) =>
          (a.x - preferredX) ** 2 + (a.y - preferredY) ** 2 -
          ((b.x - preferredX) ** 2 + (b.y - preferredY) ** 2));
      const slot = candidates.find(({ x, y }) => placed.every((rect) =>
        x + labelWidth + gap <= rect.x || x >= rect.x + rect.width + gap ||
        y + labelHeight + gap <= rect.y || y >= rect.y + labelHeight + gap));
      const position = slot ?? { x: preferredX, y: preferredY };
      placed.push({ ...position, width: labelWidth });
      return { ...item, labelX: position.x, labelY: position.y, labelWidth, fits: !!slot };
    });
  const crowded = positionedBuildings.some((item) => !item.fits);

  return (
    <div className={`${styles.layer} ${crowded ? styles.crowded : ""}`} aria-label="Campus buildings">
      {!crowded && (
        <svg className={styles.connectors} aria-hidden="true">
          {positionedBuildings.filter((item) => item.hasAnchor).map(({ building, x, y, labelX, labelY, labelWidth }) => (
            <line key={building.id} x1={x} y1={y}
              x2={Math.max(labelX + 8, Math.min(labelX + labelWidth - 8, x))}
              y2={Math.max(labelY, Math.min(labelY + labelHeight, y))} />
          ))}
        </svg>
      )}
      {positionedBuildings.map(({ building, x, y, labelX, labelY, labelWidth, hasAnchor }) => (
        <div
          className={styles.marker}
          key={building.id}
          style={crowded ? undefined : { left: labelX, top: labelY, width: labelWidth }}
        >
          {hasAnchor && <svg className={styles.anchorPin} style={{ left: x - labelX, top: y - labelY }} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 23s8-7 8-14a8 8 0 1 0-16 0c0 7 8 14 8 14Z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>}
          <button
            className={`${styles.label} ${
              selectedBuildingId === building.id ? styles.selected : ""
            }`}
            type="button"
            aria-pressed={selectedBuildingId === building.id}
            aria-label={`Select ${building.name}`}
            title={building.name}
            onClick={() => {
              if (selectedBuildingId !== building.id) {
                onSelect(building);
              }
            }}
          >
            <span>{building.name}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
