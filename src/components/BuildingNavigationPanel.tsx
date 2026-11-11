"use client";

import type { Building } from "@/data/buildings";
import styles from "./BuildingNavigationPanel.module.css";

type Props = {
  building: Building;
  error: string;
  isViewingSpace: boolean;
  onViewSpace: () => void;
  onReturnToCampus: () => void;
};

export default function BuildingNavigationPanel({
  building,
  error,
  isViewingSpace,
  onViewSpace,
  onReturnToCampus,
}: Props) {
  return (
    <aside className={styles.panel} aria-label="Selected space details">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SELECTED SPACE</span>
          <h1>{building.name}</h1>
        </div>
        <button
          className={styles.close}
          type="button"
          disabled={isViewingSpace}
          aria-label="Return to campus overview"
          onClick={onReturnToCampus}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </header>

      <div className={styles.section}>
        <h2>Details</h2>
        <p className={styles.note}>
          {building.details?.trim() ||
            "No details have been added for this space yet."}
        </p>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        className={styles.viewSpace}
        type="button"
        disabled={isViewingSpace}
        onClick={onViewSpace}
      >
        {isViewingSpace ? "Opening space…" : "View space"}
      </button>
      <button
        className={styles.return}
        type="button"
        disabled={isViewingSpace}
        onClick={onReturnToCampus}
      >
        Return to full campus
      </button>
    </aside>
  );
}
