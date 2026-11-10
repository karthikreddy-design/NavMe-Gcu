"use client";

import { useEffect, useState } from "react";
import type { MpSdk } from "@matterport/sdk";
import type { Building, BuildingFloor } from "@/data/buildings";
import styles from "./BuildingNavigationPanel.module.css";

type Props = {
  sdk: MpSdk;
  building: Building;
  error: string;
  onReturnToCampus: () => void;
};

const NO_BUILDING_FLOORS: BuildingFloor[] = [];

export default function BuildingNavigationPanel({
  sdk,
  building,
  error,
  onReturnToCampus,
}: Props) {
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [floorError, setFloorError] = useState("");
  const [isChangingFloor, setIsChangingFloor] = useState(false);
  const floors = building.floors ?? NO_BUILDING_FLOORS;

  useEffect(() => {
    const subscription = sdk.Floor.current.subscribe((current) => {
      const currentFloor = floors.find(
        (floor) => floor.matterportSequence === current.sequence,
      );
      setSelectedFloorId(currentFloor?.id ?? null);
    });

    return () => subscription.cancel();
  }, [building.id, floors, sdk]);

  const chooseFloor = async (floor: BuildingFloor) => {
    setIsChangingFloor(true);
    setFloorError("");
    try {
      await sdk.Floor.moveTo(floor.matterportSequence);
      setSelectedFloorId(floor.id);
    } catch (cause) {
      console.error(`Could not move to floor "${floor.name}".`, cause);
      setFloorError(
        `Matterport could not switch to ${floor.name}. The model may not have this floor available.`,
      );
    } finally {
      setIsChangingFloor(false);
    }
  };

  return (
    <aside className={styles.panel} aria-label="Selected building navigation">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SELECTED BUILDING</span>
          <h1>{building.name}</h1>
        </div>
        <button
          className={styles.close}
          type="button"
          aria-label="Return to campus overview"
          onClick={onReturnToCampus}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </header>

      <div className={styles.section}>
        <h2>Available floors</h2>
        {floors.length > 0 ? (
          <div className={styles.floorList}>
            {floors.map((floor) => (
              <button
                className={`${styles.floorButton} ${
                  selectedFloorId === floor.id ? styles.floorSelected : ""
                }`}
                key={floor.id}
                type="button"
                aria-pressed={selectedFloorId === floor.id}
                disabled={isChangingFloor}
                onClick={() => void chooseFloor(floor)}
              >
                <span className={styles.floorIcon} aria-hidden="true">
                  {floor.matterportSequence + 1}
                </span>
                <span>{floor.name}</span>
                {selectedFloorId === floor.id && (
                  <span className={styles.activeText}>Selected</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            No floors have been assigned to this building yet.
          </p>
        )}
      </div>

      <p className={styles.note}>
        Matterport changes the active floor for the whole scan. Other buildings
        on that floor may remain visible.
      </p>
      {(error || floorError) && (
        <p className={styles.error} role="alert">
          {error || floorError}
        </p>
      )}
      <button
        className={styles.return}
        type="button"
        onClick={onReturnToCampus}
      >
        Return to full campus
      </button>
    </aside>
  );
}
