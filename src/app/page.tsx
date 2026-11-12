"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { MpSdk } from "@matterport/sdk";
import BillboardExperience from "@/components/BillboardExperience";
import BillboardCard from "@/components/BillboardCard";
import type { Billboard } from "@/data/billboards";
import BuildingNavigationPanel from "@/components/BuildingNavigationPanel";
import BuildingLabels from "@/components/BuildingLabels";
import { useSurveyMode } from "@/components/useSurveyMode";
import {
  BUILDINGS_STORAGE_KEY,
  isBuildingList,
  type Building,
} from "@/data/buildings";
import {
  getWalkthroughDestination,
  toSdkRotation,
} from "@/data/walkthroughDestinations";
import styles from "./page.module.css";

const SurveyWorkspace = dynamic(() => import("@/components/SurveyWorkspace"), { ssr: false });

const GCU_SPACE_ID = "jdjvM17BPEh";
const SDK_CONNECTION_TIMEOUT_MS = 60_000;
const MINIMUM_LOADING_SCREEN_MS = 2_000;
const LOADING_EXIT_MS = 550;

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

function moveToFloorAndWait(sdk: MpSdk, sequence: number) {
  return new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      sdk.off(sdk.Floor.Event.CHANGE_END, onFloorChangeEnd);
    };
    const onFloorChangeEnd = (floorIndex: number) => {
      if (floorIndex !== sequence) {
        return;
      }
      cleanup();
      resolve();
    };

    sdk.on(sdk.Floor.Event.CHANGE_END, onFloorChangeEnd);
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Matterport did not finish changing to the assigned floor."));
    }, 10000);

    void sdk.Floor.moveTo(sequence).catch((cause: unknown) => {
      cleanup();
      reject(cause);
    });
  });
}

function waitForStableCamera(sdk: MpSdk) {
  return new Promise<void>((resolve, reject) => {
    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (stableTimer !== null) {
        clearTimeout(stableTimer);
      }
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
      }
      subscription.cancel();
    };
    const resolveWhenStable = () => {
      if (stableTimer !== null) {
        clearTimeout(stableTimer);
      }
      stableTimer = setTimeout(() => {
        cleanup();
        resolve();
      }, 400);
    };

    const subscription = sdk.Camera.pose.subscribe(resolveWhenStable);
    timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error("Matterport camera did not settle after changing floors."));
    }, 8000);
    resolveWhenStable();
  });
}

function toWalkthroughRotation(
  yawPitchRadians: [number, number, number?],
): MpSdk.Rotation {
  return toSdkRotation(yawPitchRadians);
}

function subscribeToBuildingStorage(listener: () => void) {
  storageListeners.add(listener);
  if (!storageInitialized) {
    storageInitialized = true;
    void loadSharedBuildings();
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === BUILDINGS_STORAGE_KEY || event.key === null) {
      void loadSharedBuildings();
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    storageListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

async function loadSharedBuildings() {
  try {
    const response = await fetch("/api/buildings", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load shared labels");
    const buildings: unknown = await response.json();
    if (!isBuildingList(buildings)) throw new Error("Invalid shared labels");
    publishStorageSnapshot({ buildings, ready: true, error: "" });
  } catch {
    const local = readStorageSnapshot();
    publishStorageSnapshot({ ...local, error: "Shared labels could not be loaded. Your browser backup is retained. Reload to retry." });
  }
}

function getBuildingStorageSnapshot() {
  return storageSnapshot;
}

export default function Home() {
  const surveyMode = useSurveyMode();
  const [surveyAuthorized, setSurveyAuthorized] = useState(false);
  const [billboardRevision, setBillboardRevision] = useState(0);
  const [openBillboard, setOpenBillboard] = useState<Billboard | null>(null);
  const updateAuthorization = useCallback((authorized: boolean) => {
    setSurveyAuthorized(authorized);
    setOpenBillboard(null);
  }, []);
  const refreshBillboards = useCallback(() => setBillboardRevision((n) => n + 1), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const connectionRef = useRef<Promise<MpSdk> | null>(null);
  const currentPoseRef = useRef<MpSdk.Camera.Pose | null>(null);
  const overviewPoseRef = useRef<MpSdk.Camera.Pose | null>(null);
  const focusInProgressRef = useRef(false);
  const returnInProgressRef = useRef(false);
  const viewSpaceInProgressRef = useRef(false);
  const [viewerElement, setViewerElement] = useState<HTMLElement | null>(null);
  const [sdk, setSdk] = useState<MpSdk | null>(null);
  const [currentMode, setCurrentMode] = useState<MpSdk.Mode.Mode | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(
    null,
  );
  const [isViewingSpace, setIsViewingSpace] = useState(false);
  const [isReturningToCampus, setIsReturningToCampus] = useState(false);
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
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [isLoadingExiting, setIsLoadingExiting] = useState(false);

  useEffect(() => {
    let disposed = false;
    const loadingStartedAt = Date.now();
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;

    const container = containerRef.current;
    const sdkKey = process.env.NEXT_PUBLIC_MATTERPORT_SDK_KEY?.trim();

    if (!container || !sdkKey) {
      setErrorMessage(
        "The Matterport SDK key is missing. Check the project’s .env.local file.",
      );
      setStatus("error");
      return () => {
        disposed = true;
      };
    }

    if (!connectionRef.current) {
      connectionRef.current = import("@matterport/sdk")
        .then(({ setupSdk }) =>
          setupSdk(sdkKey, {
            container,
            space: GCU_SPACE_ID,
            iframeAttributes: {
              title: "GCU Matterport scan",
              allow: "fullscreen; xr-spatial-tracking; web-share; autoplay",
            },
          }),
        )
        .catch((cause: unknown) => {
          console.error("Matterport Showcase failed to connect.", cause);
          throw cause;
        });
    }

    const connection = connectionRef.current;
    const isCurrentConnection = () => !disposed && connectionRef.current === connection;
    const connectionTimeout = setTimeout(() => {
      if (isCurrentConnection()) {
        setErrorMessage(
          `Matterport has not connected after 60 seconds. Check your connection and try again. If this continues, confirm that the SDK key allows ${window.location.host} and has access to this model.`,
        );
        setStatus("error");
      }
    }, SDK_CONNECTION_TIMEOUT_MS);

    connection.then(
      (matterportSdk) => {
        clearTimeout(connectionTimeout);
        if (isCurrentConnection()) {
          setSdk(matterportSdk);
          const remaining = Math.max(0, MINIMUM_LOADING_SCREEN_MS - (Date.now() - loadingStartedAt));
          revealTimer = setTimeout(() => {
            if (!isCurrentConnection()) return;
            setIsLoadingExiting(true);
            const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? 0 : LOADING_EXIT_MS;
            exitTimer = setTimeout(() => {
              if (isCurrentConnection()) setStatus("ready");
            }, duration);
          }, remaining);
        }
      },
      (cause: unknown) => {
        clearTimeout(connectionTimeout);
        if (!isCurrentConnection()) {
          return;
        }

        const detail =
          cause instanceof Error ? ` ${cause.message}` : " Please try again.";
        setErrorMessage(`The GCU Matterport scan could not be loaded.${detail}`);
        setStatus("error");
      },
    );

    return () => {
      disposed = true;
      clearTimeout(connectionTimeout);
      clearTimeout(revealTimer);
      clearTimeout(exitTimer);
    };
  }, [connectionAttempt]);

  const retryConnection = () => {
    // Ignore the old promise before removing its iframe and starting a fresh one.
    connectionRef.current = null;
    containerRef.current?.replaceChildren();
    setSdk(null);
    setCurrentMode(null);
    setErrorMessage("");
    setStatus("loading");
    setIsLoadingExiting(false);
    setConnectionAttempt((attempt) => attempt + 1);
  };

  useEffect(() => {
    if (!sdk) {
      return;
    }

    const subscription = sdk.Camera.pose.subscribe((pose) => {
      currentPoseRef.current = pose;
    });
    let previousMode: MpSdk.Mode.Mode | null = null;
    const modeSubscription = sdk.Mode.current.subscribe((mode) => {
      const returnedToOverview = previousMode === sdk.Mode.Mode.INSIDE &&
        (mode === sdk.Mode.Mode.DOLLHOUSE || mode === sdk.Mode.Mode.FLOORPLAN);
      if (returnedToOverview && !returnInProgressRef.current && !focusInProgressRef.current) {
        setSelectedBuilding(null);
      }
      if (mode !== null) previousMode = mode;
      setCurrentMode(mode);
    });

    return () => {
      subscription.cancel();
      modeSubscription.cancel();
    };
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
    void (async () => {
      try {
        await sdk.Mode.transition.waitUntil(
          ({ from, to }) => from === null && to === null,
        );
        const floors = building.floors ?? [];
        const currentFloor = await sdk.Floor.current.waitUntil(
          (floor) => floor.sequence !== undefined,
        );
        const assignedFloor =
          floors.length === 1
            ? floors[0]
            : floors.find(
                (floor) =>
                  floor.matterportSequence === currentFloor.sequence,
              );
        if (
          assignedFloor &&
          assignedFloor.matterportSequence !== currentFloor.sequence
        ) {
          await moveToFloorAndWait(sdk, assignedFloor.matterportSequence);
          await sdk.Floor.current.waitUntil(
            (floor) =>
              floor.sequence === assignedFloor.matterportSequence,
          );
          await waitForStableCamera(sdk);
        }

        await sdk.Mode.transition.waitUntil(
          ({ from, to }) => from === null && to === null,
        );
        const mode = await sdk.Mode.current.waitUntil(
          (mode) => mode !== null && mode !== sdk.Mode.Mode.TRANSITIONING,
        );
        if (mode === sdk.Mode.Mode.FLOORPLAN) {
          await sdk.Camera.lookAt(building.position, {
            mode: sdk.Mode.Mode.FLOORPLAN,
            offset: { x: 0, y: 18, z: 0 },
          });
        } else {
          await sdk.Mode.moveTo(sdk.Mode.Mode.FLOORPLAN, {
            position: building.position,
            rotation: { x: -90, y: 0 },
            zoom: 18,
            transition: sdk.Camera.TransitionType.FLY,
          });
        }
        await sdk.Mode.current.waitUntil(
          (mode) => mode === sdk.Mode.Mode.FLOORPLAN,
        );

        if (floors.length > 1 && !assignedFloor) {
          setNavigationError(
            "This space has multiple assigned floors. Use the Matterport floor selector to choose a floor.",
          );
        }
      } catch (cause: unknown) {
        console.error(`Could not focus on "${building.name}".`, cause);
        setNavigationError(
          `Matterport could not open the floor plan for ${building.name}. The selection is still active.`,
        );
      } finally {
        focusInProgressRef.current = false;
      }
    })();
  };

  const viewSelectedSpace = async () => {
    if (!sdk || !selectedBuilding || viewSpaceInProgressRef.current) {
      return;
    }

    viewSpaceInProgressRef.current = true;
    setIsViewingSpace(true);
    setNavigationError("");

    try {
      const focusDeadline = Date.now() + 15_000;
      while (focusInProgressRef.current && Date.now() < focusDeadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      if (focusInProgressRef.current) {
        throw new Error("Matterport did not finish focusing on the selected space.");
      }

      await sdk.Mode.transition.waitUntil(
        ({ from, to }) => from === null && to === null,
      );
      await waitForStableCamera(sdk);
      const destination = getWalkthroughDestination(selectedBuilding.name);
      if (!destination) {
        throw new Error(
          `No walkthrough point is configured for "${selectedBuilding.name}".`,
        );
      }

      const rotation = toWalkthroughRotation(destination.yawPitchRadians);
      if (destination.kind === "sweep") {
        const sweeps = await sdk.Sweep.data.waitUntil(
          (collection) => Object.keys(collection).length > 0,
        );
        const sweepList = Object.values(sweeps);
        const sweepOffset = destination.sweepIndex - 1;
        const sweep =
          Number.isInteger(destination.sweepIndex) &&
          sweepOffset >= 0
            ? sweepList[sweepOffset]
            : undefined;
        if (!sweep) {
          throw new Error(
            `Matterport sweep position ${destination.sweepIndex} is not available in this scan (${sweepList.length} sweeps found).`,
          );
        }

        await sdk.Sweep.moveTo(sweep.id, {
          rotation,
          transition: sdk.Camera.TransitionType.FLY,
          transitionTime: 1500,
        });
      } else {
        await sdk.Mode.moveTo(sdk.Mode.Mode.INSIDE, {
          position: destination.position,
          rotation,
          transition: sdk.Camera.TransitionType.FLY,
        });
      }

      await sdk.Mode.current.waitUntil(
        (mode) => mode === sdk.Mode.Mode.INSIDE,
      );
    } catch (cause: unknown) {
      console.error(
        `Could not open the walkthrough for "${selectedBuilding.name}".`,
        cause,
      );
      setNavigationError(
        `Matterport could not open the walkthrough for ${selectedBuilding.name}. Check that the supplied scan point is available.`,
      );
    } finally {
      viewSpaceInProgressRef.current = false;
      setIsViewingSpace(false);
    }
  };

  const returnToCampus = async () => {
    if (
      !sdk ||
      returnInProgressRef.current ||
      viewSpaceInProgressRef.current
    ) {
      return;
    }

    const buildingToRestore = selectedBuilding;
    returnInProgressRef.current = true;
    setIsReturningToCampus(true);
    setNavigationError("");
    try {
      const focusDeadline = Date.now() + 15_000;
      while (focusInProgressRef.current && Date.now() < focusDeadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      if (focusInProgressRef.current) {
        throw new Error("Matterport is still focusing on the selected building.");
      }
      await sdk.Mode.transition.waitUntil(
        ({ from, to }) => from === null && to === null,
      );
      const currentMode = await sdk.Mode.current.waitUntil(
        (mode) => mode !== null,
      );
      const overviewPose = overviewPoseRef.current;
      if (currentMode !== sdk.Mode.Mode.DOLLHOUSE) {
        await sdk.Mode.moveTo(sdk.Mode.Mode.DOLLHOUSE, {
          transition: sdk.Camera.TransitionType.FLY,
        });
      }
      await sdk.Mode.transition.waitUntil(
        ({ from, to }) => from === null && to === null,
      );

      let floorRestoreError = false;
      try {
        const currentFloor = await sdk.Floor.current.waitUntil(
          (floor) => floor.sequence !== undefined,
        );
        if (currentFloor.sequence !== -1) {
          await sdk.Floor.showAll();
          await sdk.Floor.current.waitUntil(
            (floor) => floor.sequence === -1,
          );
          await waitForStableCamera(sdk);
        }
      } catch (cause) {
        floorRestoreError = true;
        console.error("Matterport could not restore all floors.", cause);
      }

      await sdk.Mode.transition.waitUntil(
        ({ from, to }) => from === null && to === null,
      );
      // Fit the whole scan rather than reusing a possibly zoomed-in camera.
      const sweeps = await sdk.Sweep.data.waitUntil(
        (collection) => Object.keys(collection).length > 0,
      );
      const positions = [
        ...Object.values(sweeps).map((sweep) => sweep.position),
        ...storage.buildings.map((building) => building.position),
      ].filter((position) => [position.x, position.y, position.z].every(Number.isFinite));
      if (positions.length === 0) {
        throw new Error("Campus bounds are not available yet.");
      }
      const center = {
        x: (Math.min(...positions.map((p) => p.x)) + Math.max(...positions.map((p) => p.x))) / 2,
        y: (Math.min(...positions.map((p) => p.y)) + Math.max(...positions.map((p) => p.y))) / 2,
        z: (Math.min(...positions.map((p) => p.z)) + Math.max(...positions.map((p) => p.z))) / 2,
      };
      const radius = Math.max(10, ...positions.map((p) =>
        Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z),
      ));
      const frame = containerRef.current?.getBoundingClientRect();
      const aspect = frame && frame.height > 0 ? frame.width / frame.height : 1;
      const projection = currentPoseRef.current?.projection;
      const focalLength = Math.abs(projection?.[5] ?? 0);
      const verticalHalfFov = focalLength > 0 ? Math.atan(1 / focalLength) : Math.PI / 8;
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
      const distance = radius * 1.3 / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
      const heading = overviewPose
        ? Math.atan2(overviewPose.position.x - center.x, overviewPose.position.z - center.z)
        : Math.PI / 4;
      const elevation = Math.PI / 3;
      await sdk.Camera.lookAt(center, {
        mode: sdk.Mode.Mode.DOLLHOUSE,
        offset: {
          x: Math.sin(heading) * distance * Math.cos(elevation),
          y: distance * Math.sin(elevation),
          z: Math.cos(heading) * distance * Math.cos(elevation),
        },
        transition: sdk.Camera.TransitionType.FLY,
        transitionTime: 1800,
      });
      await sdk.Mode.current.waitUntil((mode) => mode === sdk.Mode.Mode.DOLLHOUSE);
      await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
      await waitForStableCamera(sdk);
      if (floorRestoreError) {
        setNavigationError(
          "Campus view restored, but Matterport could not show all floors. The current floor remains visible.",
        );
      }
      setSelectedBuilding(null);
    } catch (cause) {
      console.error("Could not return to the campus overview.", cause);
      setSelectedBuilding(buildingToRestore);
      setNavigationError(
        "Matterport could not return to the campus overview. Try the viewer's Dollhouse control.",
      );
    } finally {
      returnInProgressRef.current = false;
      setIsReturningToCampus(false);
    }
  };

  const saveBuildings = async (updatedBuildings: Building[]) => {
    if (!surveyMode || !surveyAuthorized || !storage.ready || storage.error) {
      return false;
    }

    try {
      const response = await fetch("/api/buildings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-survey-mode": "1" },
        body: JSON.stringify(updatedBuildings),
      });
      if (!response.ok) throw new Error("Shared label save failed");
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
          "Labels could not be saved to both shared storage and the browser backup. Reload to retry.",
      });
      return false;
    }
  };

  return (
    <main
      className={`${styles.viewer} ${selectedBuilding ? styles.withSelectedSpace : ""}`}
      aria-label="GCU Matterport tour"
      ref={setViewerElement}
    >
      <div className={styles.container} ref={containerRef} />
      <BillboardExperience sdk={sdk} viewer={viewerElement} admin={surveyMode && surveyAuthorized}
        revision={billboardRevision} onOpen={setOpenBillboard} />
      {openBillboard && <BillboardCard billboard={openBillboard} onClose={() => setOpenBillboard(null)} />}
      {surveyMode && <SurveyWorkspace sdk={sdk} buildings={storage.buildings}
        storageReady={storage.ready} storageError={storage.error} onSaveBuildings={saveBuildings}
        onAuthorization={updateAuthorization} onBillboardsChanged={refreshBillboards} onPreview={setOpenBillboard} />}
      {sdk && viewerElement && (
        <>
          <BuildingLabels
            sdk={sdk}
            viewer={viewerElement}
            buildings={storage.buildings}
            selectedBuildingId={selectedBuilding?.id ?? null}
            visible={
              !isViewingSpace && !isReturningToCampus &&
              (currentMode === sdk.Mode.Mode.INSIDE
                ? selectedBuilding !== null
                : surveyMode || currentMode === sdk.Mode.Mode.DOLLHOUSE ||
                  currentMode === sdk.Mode.Mode.FLOORPLAN)
            }
            onSelect={focusBuilding}
          />
          {storage.error && (
            <p className={styles.dataError} role="alert">
              {storage.error}
            </p>
          )}
          {selectedBuilding && (
            <BuildingNavigationPanel
              building={selectedBuilding}
              error={navigationError}
              isViewingSpace={isViewingSpace || isReturningToCampus}
              onViewSpace={() => void viewSelectedSpace()}
              onReturnToCampus={() => void returnToCampus()}
            />
          )}
          {navigationError && !selectedBuilding && (
            <p className={styles.navigationNotice} role="status">
              {navigationError}
            </p>
          )}
        </>
      )}
      {status !== "ready" && (
        <div
          className={`${styles.status} ${status === "error" ? styles.connectionError : styles.loadingScreen} ${isLoadingExiting && status === "loading" ? styles.loadingExit : ""}`}
          role={status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {status === "loading" ? (
            <div className={styles.loadingContent}>
              <svg className={styles.universityLogo} viewBox="0 0 200 200" role="img" aria-label="Garden City University G logo">
                <path d="M30 100a70 70 0 0 1 119.5-49.5" fill="none" stroke="#fff" strokeWidth="28" />
                <path d="M30 100a70 70 0 0 0 140 0h-65" fill="none" stroke="#b7433e" strokeWidth="28" />
              </svg>
              <p className={styles.motto}>EMPHASIS ON LIFE</p>
              <h1 className={styles.universityName}>GARDEN CITY UNIVERSITY</h1>
              <div className={styles.loadingProgress}>
                <span className={styles.spinner} aria-hidden="true" />
                <p>Loading your campus experience…</p>
              </div>
              <button className={styles.loadingRetry} type="button" onClick={retryConnection}>Retry connection</button>
            </div>
          ) : (
            <div className={styles.error}>
              <p>{errorMessage}</p>
              <button className={styles.retry} type="button" onClick={retryConnection}>
                Retry connection
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
