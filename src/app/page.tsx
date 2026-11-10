"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MpSdk } from "@matterport/sdk";
import AnchorSurvey from "@/components/AnchorSurvey";
import BuildingNavigationPanel from "@/components/BuildingNavigationPanel";
import BuildingLabels from "@/components/BuildingLabels";
import {
  BUILDINGS_STORAGE_KEY,
  isBuildingList,
  type Building,
} from "@/data/buildings";
import styles from "./page.module.css";

const GCU_SPACE_ID = "jdjvM17BPEh";

type BuildingStorageSnapshot = {
  buildings: Building[];
  ready: boolean;
  error: string;
};

const EMPTY_STORAGE_SNAPSHOT: BuildingStorageSnapshot = {
  buildings: [],
  ready: false,
  error: "",
};
let storageSnapshot = EMPTY_STORAGE_SNAPSHOT;
let storageInitialized = false;
const storageListeners = new Set<() => void>();

function publishStorageSnapshot(snapshot: BuildingStorageSnapshot) {
  storageSnapshot = snapshot;
  storageListeners.forEach((listener) => listener());
}

function readStorageSnapshot(): BuildingStorageSnapshot {
  try {
    const saved = window.localStorage.getItem(BUILDINGS_STORAGE_KEY);
    if (saved === null) {
      return { buildings: [], ready: true, error: "" };
    }

    const parsed: unknown = JSON.parse(saved);
    if (!isBuildingList(parsed)) {
      throw new Error("Saved building data has an invalid format.");
    }
    return { buildings: parsed, ready: true, error: "" };
  } catch (cause) {
    console.error("Could not load saved building labels.", cause);
    return {
      buildings: [],
      ready: true,
      error:
        "Saved building labels could not be read from this browser. Check browser storage and reload before editing.",
    };
  }
}

function waitForStableCamera(sdk: MpSdk) {
  return new Promise<void>((resolve, reject) => {
    let stableTimer: ReturnType<typeof setTimeout> | null = null;

    const subscription = sdk.Camera.pose.subscribe(() => {
      if (stableTimer) {
        clearTimeout(stableTimer);
      }
      stableTimer = setTimeout(() => {
        clearTimeout(timeoutTimer);
        subscription.cancel();
        resolve();
      }, 350);
    });

    const timeoutTimer = setTimeout(() => {
      if (stableTimer) {
        clearTimeout(stableTimer);
      }
      subscription.cancel();
      reject(new Error("Matterport camera did not settle before navigation."));
    }, 5000);
  });
}

function subscribeToBuildingStorage(listener: () => void) {
  storageListeners.add(listener);
  if (!storageInitialized) {
    storageInitialized = true;
    publishStorageSnapshot(readStorageSnapshot());
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === BUILDINGS_STORAGE_KEY || event.key === null) {
      publishStorageSnapshot(readStorageSnapshot());
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    storageListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function getBuildingStorageSnapshot() {
  return storageSnapshot;
}

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const connectionRef = useRef<Promise<MpSdk> | null>(null);
  const isActiveRef = useRef(false);
  const currentPoseRef = useRef<MpSdk.Camera.Pose | null>(null);
  const overviewPoseRef = useRef<MpSdk.Camera.Pose | null>(null);
  const focusInProgressRef = useRef(false);
  const returnInProgressRef = useRef(false);
  const [viewerElement, setViewerElement] = useState<HTMLElement | null>(null);
  const [sdk, setSdk] = useState<MpSdk | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(
    null,
  );
  const [navigationError, setNavigationError] = useState("");
  const storage = useSyncExternalStore(
    subscribeToBuildingStorage,
    getBuildingStorageSnapshot,
    () => EMPTY_STORAGE_SNAPSHOT,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    isActiveRef.current = true;

    const container = containerRef.current;
    const sdkKey = process.env.NEXT_PUBLIC_MATTERPORT_SDK_KEY;

    if (!container || !sdkKey) {
      setErrorMessage(
        "The Matterport SDK key is missing. Check the project’s .env.local file.",
      );
      setStatus("error");
      return () => {
        isActiveRef.current = false;
      };
    }

    if (!connectionRef.current) {
      connectionRef.current = import("@matterport/sdk")
        .then(({ setupSdk }) =>
          setupSdk(sdkKey, {
            container,
            space: GCU_SPACE_ID,
            iframeAttributes: {
              title: "Grand Canyon University Matterport scan",
              allow:
                "fullscreen https://my.matterport.com; xr-spatial-tracking https://my.matterport.com",
            },
          }),
        )
        .catch((cause: unknown) => {
          console.error("Matterport Showcase failed to connect.", cause);
          throw cause;
        });
    }

    connectionRef.current.then(
      (matterportSdk) => {
        if (isActiveRef.current) {
          setSdk(matterportSdk);
          setStatus("ready");
        }
      },
      (cause: unknown) => {
        if (!isActiveRef.current) {
          return;
        }

        const detail =
          cause instanceof Error ? ` ${cause.message}` : " Please try again.";
        setErrorMessage(`The GCU Matterport scan could not be loaded.${detail}`);
        setStatus("error");
      },
    );

    return () => {
      isActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sdk) {
      return;
    }

    const subscription = sdk.Camera.pose.subscribe((pose) => {
      currentPoseRef.current = pose;
    });

    return () => subscription.cancel();
  }, [sdk]);

  const focusBuilding = (building: Building) => {
    if (!sdk || focusInProgressRef.current) {
      return;
    }

    setSelectedBuilding(building);
    setNavigationError("");

    const currentPose = currentPoseRef.current;
    if (
      overviewPoseRef.current === null &&
      currentPose?.mode === sdk.Mode.Mode.DOLLHOUSE
    ) {
      overviewPoseRef.current = currentPose;
    }

    focusInProgressRef.current = true;
    void sdk.Mode.transition
      .waitUntil(({ from, to }) => from === null && to === null)
      .then(() => waitForStableCamera(sdk))
      .then(() =>
        sdk.Camera.lookAt(building.position, {
          mode: sdk.Mode.Mode.DOLLHOUSE,
        }),
      )
      .catch((cause: unknown) => {
        console.error(`Could not focus on "${building.name}".`, cause);
        setNavigationError(
          `Matterport could not move the camera to ${building.name}. The selection is still active.`,
        );
      })
      .finally(() => {
        focusInProgressRef.current = false;
      });
  };

  const returnToCampus = async () => {
    if (!sdk || returnInProgressRef.current) {
      return;
    }

    const buildingToRestore = selectedBuilding;
    returnInProgressRef.current = true;
    setNavigationError("");
    setSelectedBuilding(null);
    try {
      await sdk.Floor.showAll();
      await sdk.Floor.current.waitUntil(
        (currentFloor) => currentFloor.sequence === -1,
      );
      await sdk.Mode.transition.waitUntil(
        ({ from, to }) => from === null && to === null,
      );
      await waitForStableCamera(sdk);
      const overviewPose = overviewPoseRef.current;
      await sdk.Mode.moveTo(sdk.Mode.Mode.DOLLHOUSE, {
        ...(overviewPose
          ? {
              position: overviewPose.position,
              rotation: overviewPose.rotation,
            }
          : {}),
        transition: sdk.Camera.TransitionType.FLY,
      });
    } catch (cause) {
      console.error("Could not return to the campus overview.", cause);
      setSelectedBuilding(buildingToRestore);
      setNavigationError(
        "Matterport could not return to the campus overview. Try the viewer's Dollhouse control.",
      );
    } finally {
      returnInProgressRef.current = false;
    }
  };

  const saveBuildings = (updatedBuildings: Building[]) => {
    if (!storage.ready || storage.error) {
      return false;
    }

    try {
      window.localStorage.setItem(
        BUILDINGS_STORAGE_KEY,
        JSON.stringify(updatedBuildings),
      );
      publishStorageSnapshot({
        buildings: updatedBuildings,
        ready: true,
        error: "",
      });
      setSelectedBuilding((selected) =>
        selected
          ? updatedBuildings.find((building) => building.id === selected.id) ??
            null
          : null,
      );
      return true;
    } catch (cause) {
      console.error("Could not save building labels.", cause);
      publishStorageSnapshot({
        ...storage,
        error:
          "Building changes were not saved. Check browser storage space and permissions, then reload.",
      });
      return false;
    }
  };

  return (
    <main
      className={styles.viewer}
      aria-label="GCU Matterport tour"
      ref={setViewerElement}
    >
      <div className={styles.container} ref={containerRef} />
      {sdk && viewerElement && (
        <>
          <BuildingLabels
            sdk={sdk}
            viewer={viewerElement}
            buildings={storage.buildings}
            selectedBuildingId={selectedBuilding?.id ?? null}
            onSelect={focusBuilding}
          />
          <AnchorSurvey
            sdk={sdk}
            buildings={storage.buildings}
            storageReady={storage.ready}
            storageError={storage.error}
            onSave={saveBuildings}
          />
          {storage.error && (
            <p className={styles.dataError} role="alert">
              {storage.error}
            </p>
          )}
          {selectedBuilding && (
            <BuildingNavigationPanel
              sdk={sdk}
              building={selectedBuilding}
              error={navigationError}
              onReturnToCampus={() => void returnToCampus()}
            />
          )}
        </>
      )}
      {status !== "ready" && (
        <div
          className={styles.status}
          role={status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {status === "loading" ? (
            <p>Loading the GCU Matterport scan…</p>
          ) : (
            <p className={styles.error}>{errorMessage}</p>
          )}
        </div>
      )}
    </main>
  );
}
