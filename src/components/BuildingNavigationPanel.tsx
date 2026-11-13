"use client";

import type { Building } from "@/data/buildings";
import styles from "./BuildingNavigationPanel.module.css";

type Props = {
  building: Building;
  error: string;
  isBusy: boolean;
  busyLabel: string;
  isWalkthrough: boolean;
  onViewSpace: () => void;
  onReturnToCampus: () => void;
};

export default function BuildingNavigationPanel({
  building,
  error,
  isBusy,
  busyLabel,
  isWalkthrough,
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
          disabled={isBusy}
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
      <div className={styles.actions}>
      <button
        className={styles.viewSpace}
        type="button"
        disabled={isBusy}
        onClick={onViewSpace}
      >
        {isBusy ? busyLabel : isWalkthrough ? "Return to floor plan" : "View space"}
      </button>
      <button
        className={styles.return}
        type="button"
        disabled={isBusy}
        onClick={onReturnToCampus}
      >
        Return to full campus
      </button>
      </div>
    </aside>
  );
}
