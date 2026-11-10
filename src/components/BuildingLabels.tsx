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
};

type ProjectedBuilding = {
  building: Building;
  x: number;
  y: number;
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
}: Props) {
  const [pose, setPose] = useState<MpSdk.Camera.Pose | null>(null);
  const [viewport, setViewport] = useState<ProjectionViewport>({
    left: 0,
    top: 0,
    w: 0,
    h: 0,
  });

  useEffect(() => {
    const subscription = sdk.Camera.pose.subscribe(setPose);
    const iframe = viewer.querySelector("iframe");
    const observer = new ResizeObserver(() => {
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
    });

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
      ? buildings.flatMap((building) => {
          const point = sdk.Conversion.worldToScreen(
            building.position,
            pose,
            { w: viewport.w, h: viewport.h },
          );
          if (
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            point.x < 0 ||
            point.x > viewport.w ||
            point.y < 0 ||
            point.y > viewport.h
          ) {
            return [];
          }

          return [
            {
              building,
              x: viewport.left + point.x,
              y: viewport.top + point.y,
            },
          ];
        })
      : [];

  return (
    <div className={styles.layer} aria-label="Campus buildings">
      {projectedBuildings.map(({ building, x, y }) => (
        <div
          className={styles.marker}
          key={building.id}
          style={{ left: x, top: y }}
        >
          <svg className={styles.anchorPin} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 23s8-7 8-14a8 8 0 1 0-16 0c0 7 8 14 8 14Z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <button
            className={`${styles.label} ${
              selectedBuildingId === building.id ? styles.selected : ""
            }`}
            type="button"
            aria-pressed={selectedBuildingId === building.id}
            aria-label={`Select ${building.name}`}
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
