"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { flushSync } from "react-dom";
import Image from "next/image";
import type { MpSdk } from "@matterport/sdk";
import BillboardExperience from "@/components/BillboardExperience";
import WalkthroughPointer from "@/components/WalkthroughPointer";
import ViewModeControls, { type CampusView } from "@/components/ViewModeControls";
import BillboardCard from "@/components/BillboardCard";
import type { Billboard } from "@/data/billboards";
import { getCampusOverviewFraming, getFloorPlanFraming } from "@/data/floorPlanFraming";
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


async function restoreCampusOverview(sdk: MpSdk, container: HTMLElement) {
  await sdk.Mode.current.waitUntil((mode) => mode !== null && mode !== sdk.Mode.Mode.TRANSITIONING);
  await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
  await sdk.Mode.moveTo(sdk.Mode.Mode.DOLLHOUSE, { transition: sdk.Camera.TransitionType.INSTANT });
  await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
  // Show all floors before framing: showAll itself recenters the orbit camera.
  await sdk.Floor.showAll();
  await sdk.Floor.current.waitUntil((floor) => floor.sequence === -1);
  await waitForStableCamera(sdk);
  const rect = container.getBoundingClientRect();
  const framing = getCampusOverviewFraming(rect.width / rect.height);
  // Reapply the full frame after the orthographic transition settles. The
  // native transition otherwise overwrites its target and zoom on entry.
  for (let attempt = 0; attempt < 2; attempt++) {
    await sdk.Mode.moveTo(sdk.Mode.Mode.FLOORPLAN, {
      position: framing.position, rotation: framing.rotation, zoom: framing.zoom,
      transition: sdk.Camera.TransitionType.INSTANT,
    });
    await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
  }
  await sdk.Mode.moveTo(sdk.Mode.Mode.DOLLHOUSE, { transition: sdk.Camera.TransitionType.INSTANT });
  await sdk.Mode.current.waitUntil((mode) => mode === sdk.Mode.Mode.DOLLHOUSE);
  await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
  await sdk.Camera.setRotation(framing.orbitRotation, { speed: 360 });
  await waitForStableCamera(sdk);
  await sdk.Floor.current.waitUntil((floor) => floor.sequence === -1);
}


async function zoomOutToCampus(sdk: MpSdk, container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  const framing = getCampusOverviewFraming(rect.width / rect.height);
  const destination = {
    position: framing.dollhousePosition,
    rotation: framing.orbitRotation,
    transition: sdk.Camera.TransitionType.FLY,
  };
  const mode = await sdk.Mode.current.waitUntil((mode) => mode !== null && mode !== sdk.Mode.Mode.TRANSITIONING);
  if (mode === sdk.Mode.Mode.FLOORPLAN) {
    // Orthographic floor visibility changes do not lift the viewpoint.
    await sdk.Floor.showAll();
    await sdk.Floor.current.waitUntil((floor) => floor.sequence === -1);
    await sdk.Mode.moveTo(sdk.Mode.Mode.DOLLHOUSE, destination);
  } else {
    // Walkthrough retains its active floor on exit. Clear it during the flight,
    // while the destination owns the camera, rather than recentering on arrival.
    const flight = sdk.Mode.moveTo(sdk.Mode.Mode.DOLLHOUSE, destination);
    await Promise.race([
      flight,
      sdk.Mode.transition.waitUntil(({ to }) => to === sdk.Mode.Mode.DOLLHOUSE),
    ]);
    await sdk.Floor.showAll();
    await flight;
  }
  await sdk.Mode.current.waitUntil((mode) => mode === sdk.Mode.Mode.DOLLHOUSE);
  await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
  await waitForStableCamera(sdk);
  await sdk.Floor.current.waitUntil((floor) => floor.sequence === -1);
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
  const [isMatterportTagOpen, setIsMatterportTagOpen] = useState(false);
  const [isMatterportTagDocked, setIsMatterportTagDocked] = useState(false);
  const updateAuthorization = useCallback((authorized: boolean) => {
    setSurveyAuthorized(authorized);
    setOpenBillboard(null);
  }, []);
  const refreshBillboards = useCallback(() => setBillboardRevision((n) => n + 1), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const connectionRef = useRef<Promise<MpSdk> | null>(null);
  const focusInProgressRef = useRef(false);
  const viewChangeInProgressRef = useRef(false);
  const returnInProgressRef = useRef(false);
  const viewSpaceInProgressRef = useRef(false);
  const [viewerElement, setViewerElement] = useState<HTMLElement | null>(null);
  const [sdk, setSdk] = useState<MpSdk | null>(null);
  const [currentMode, setCurrentMode] = useState<MpSdk.Mode.Mode | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(
    null,
  );
  const [isViewingSpace, setIsViewingSpace] = useState(false);
  const [isChangingView, setIsChangingView] = useState(false);
  const [isFocusingBuilding, setIsFocusingBuilding] = useState(false);
  const [focusedBuildingId, setFocusedBuildingId] = useState<string | null>(null);
  const [isReturningToCampus, setIsReturningToCampus] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const storage = useSyncExternalStore(
    subscribeToBuildingStorage,
    getBuildingStorageSnapshot,
    () => EMPTY_STORAGE_SNAPSHOT,
  );
  const [status, setStatus] = useState<"loading" | "intro" | "intro-exiting" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [isLoadingExiting, setIsLoadingExiting] = useState(false);
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const [introNeedsPlay, setIntroNeedsPlay] = useState(false);

  const finishIntro = useCallback(() => {
    setStatus(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "ready" : "intro-exiting");
  }, []);

  const playIntro = useCallback(() => {
    const video = introVideoRef.current;
    if (!video) return;
    if (video.error) {
      finishIntro();
      return;
    }
    void video.play().catch(() => {
      if (introVideoRef.current === video && !video.error) setIntroNeedsPlay(true);
    });
  }, [finishIntro]);

  useEffect(() => {
    if (status === "intro") playIntro();
  }, [status, playIntro]);

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
            iframeQueryParams: { title: 0 },
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
      async (matterportSdk) => {
        if (!isCurrentConnection()) return;
        await restoreCampusOverview(matterportSdk, container);
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
              if (isCurrentConnection()) setStatus("intro");
            }, duration);
          }, remaining);
        }
      },
    ).catch((cause: unknown) => {
      clearTimeout(connectionTimeout);
      if (!isCurrentConnection()) {
        return;
      }

      const detail =
        cause instanceof Error ? ` ${cause.message}` : " Please try again.";
      setErrorMessage(`The GCU Matterport scan could not be loaded.${detail}`);
      setStatus("error");
    });

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
    setIntroNeedsPlay(false);
    setConnectionAttempt((attempt) => attempt + 1);
  };

  useEffect(() => {
    if (!sdk) {
      return;
    }
    const modeSubscription = sdk.Mode.current.subscribe(setCurrentMode);

    return () => {
      modeSubscription.cancel();
    };
  }, [sdk]);

  useEffect(() => {
    if (!sdk) return;
    // Native tag cards live inside the iframe, so a parent z-index cannot put
    // individual annotations behind them. Suppress those annotations while
    // a tag preview, selected card, or expanded dock is open.
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = sdk.Tag.openTags.subscribe(({ hovered, selected, docked }) => {
      clearTimeout(closeTimer);
      if (hovered || docked || selected.size > 0) {
        setIsMatterportTagOpen(true);
        if (docked) setIsMatterportTagDocked(true);
      } else {
        // Keep annotations behind the card until its exit animation finishes.
        closeTimer = setTimeout(() => {
          setIsMatterportTagOpen(false);
          setIsMatterportTagDocked(false);
        }, 250);
      }
    });
    return () => { clearTimeout(closeTimer); subscription.cancel(); };
  }, [sdk]);

  const focusBuilding = async (building: Building) => {
    if (!sdk || focusInProgressRef.current || viewChangeInProgressRef.current) {
      return;
    }

    setFocusedBuildingId(null);
    setOpenBillboard(null);
    setNavigationError("");

    focusInProgressRef.current = true;
    setIsFocusingBuilding(true);
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
      await sdk.Mode.transition.waitUntil(
        ({ from, to }) => from === null && to === null,
      );
      const sourceMode = await sdk.Mode.current.waitUntil(
        (mode) => mode !== null && mode !== sdk.Mode.Mode.TRANSITIONING,
      );
      // Mount the dock and start the flight in the same task, rather than
      // painting a resized viewer and pausing before the camera starts.
      flushSync(() => setSelectedBuilding(building));
      const frame = containerRef.current?.getBoundingClientRect();
      const aspect = frame && frame.height > 0 ? frame.width / frame.height : 2.33;
      const framing = getFloorPlanFraming(building, aspect);
      await sdk.Mode.moveTo(sdk.Mode.Mode.FLOORPLAN, {
        position: framing.position,
        rotation: framing.rotation,
        zoom: framing.zoom,
        transition: sdk.Camera.TransitionType.FLY,
      });
      await sdk.Mode.current.waitUntil((mode) => mode === sdk.Mode.Mode.FLOORPLAN);
      await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
      if (sourceMode !== sdk.Mode.Mode.FLOORPLAN && framing.refine) {
        await sdk.Mode.moveTo(sdk.Mode.Mode.FLOORPLAN, {
          position: framing.position,
          rotation: framing.rotation,
          zoom: framing.zoom,
          transition: sdk.Camera.TransitionType.FLY,
        });
        await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
      }
      // Isolate the assigned floor only in orthographic mode: changing floors
      // in Dollhouse adjusts the camera's height before the zoom even begins.
      if (assignedFloor && assignedFloor.matterportSequence !== currentFloor.sequence) {
        await moveToFloorAndWait(sdk, assignedFloor.matterportSequence);
        await sdk.Floor.current.waitUntil((floor) => floor.sequence === assignedFloor.matterportSequence);
      }
      await waitForStableCamera(sdk);
      setFocusedBuildingId(building.id);

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
      setIsFocusingBuilding(false);
    }
  };

  const viewSelectedSpace = async () => {
    if (!sdk || !selectedBuilding || viewSpaceInProgressRef.current || viewChangeInProgressRef.current) {
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
      viewChangeInProgressRef.current ||
      viewSpaceInProgressRef.current
    ) {
      return;
    }

    const buildingToRestore = selectedBuilding;
    returnInProgressRef.current = true;
    setIsReturningToCampus(true);
    setOpenBillboard(null);
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
      const nativeTags = await sdk.Tag.openTags.waitUntil(() => true);
      const tagsToClose = new Set([
        ...nativeTags.selected,
        ...(nativeTags.hovered ? [nativeTags.hovered] : []),
        ...(nativeTags.docked ? [nativeTags.docked] : []),
      ]);
      await Promise.all([...tagsToClose].map((id) => sdk.Tag.close(id)));
      flushSync(() => setSelectedBuilding(null));
      await waitForStableCamera(sdk);
      if (!containerRef.current) throw new Error("Campus viewer is not available.");
      await zoomOutToCampus(sdk, containerRef.current);
      setFocusedBuildingId(null);
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

  const changeView = async (view: CampusView) => {
    if (!sdk || focusInProgressRef.current || returnInProgressRef.current ||
        viewSpaceInProgressRef.current || viewChangeInProgressRef.current) return;
    const target = view === "dollhouse" ? sdk.Mode.Mode.DOLLHOUSE
      : view === "floorplan" ? sdk.Mode.Mode.FLOORPLAN : sdk.Mode.Mode.INSIDE;
    if (currentMode === target || (view === "walkthrough" && currentMode === sdk.Mode.Mode.PANO360)) return;
    if (selectedBuilding && view === "floorplan") {
      await focusBuilding(selectedBuilding);
      return;
    }
    if (selectedBuilding && view === "walkthrough") {
      await viewSelectedSpace();
      return;
    }
    viewChangeInProgressRef.current = true;
    setIsChangingView(true);
    setNavigationError("");
    setOpenBillboard(null);
    try {
      await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
      if (view === "dollhouse" && !selectedBuilding && containerRef.current) {
        await zoomOutToCampus(sdk, containerRef.current);
      } else {
        await sdk.Mode.moveTo(target, { transition: sdk.Camera.TransitionType.FLY });
        await sdk.Mode.current.waitUntil((mode) => mode === target);
        await sdk.Mode.transition.waitUntil(({ from, to }) => from === null && to === null);
        await waitForStableCamera(sdk);
      }
    } catch (cause) {
      console.error(`Could not open the ${view} view.`, cause);
      setNavigationError("The view could not be changed. Please try again.");
    } finally {
      viewChangeInProgressRef.current = false;
      setIsChangingView(false);
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
      data-survey-authorized={surveyMode && surveyAuthorized ? "true" : undefined}
      aria-label="GCU Matterport tour"
      ref={setViewerElement}
    >
      <div className={styles.container} ref={containerRef} />
      <header className={styles.campusBranding} aria-label="Garden City University 3D Campus Experience">
        <Image src="/branding/gcu-mark.svg" width={46} height={46}
          alt="Garden City University logo" className={styles.headerLogo} />
        <div className={styles.brandingText}>
          <p className={styles.brandingTitle}>Garden City University</p>
          <p className={styles.brandingSubtitle}>3D Campus Experience</p>
        </div>
      </header>
      <WalkthroughPointer sdk={sdk} mode={currentMode} viewer={viewerElement} suppressed={isMatterportTagOpen} />
      <BillboardExperience sdk={sdk} viewer={viewerElement} admin={surveyMode && surveyAuthorized}
        revision={billboardRevision} onOpen={setOpenBillboard}
        selectedBuildingName={
          selectedBuilding && focusedBuildingId === selectedBuilding.id &&
          !isViewingSpace && !isReturningToCampus && !isMatterportTagOpen
            ? selectedBuilding.name : null
        } />
      {openBillboard && <BillboardCard billboard={openBillboard} onClose={() => setOpenBillboard(null)} />}
      {surveyMode && <SurveyWorkspace sdk={sdk} buildings={storage.buildings}
        storageReady={storage.ready} storageError={storage.error} onSaveBuildings={saveBuildings}
        onAuthorization={updateAuthorization} onBillboardsChanged={refreshBillboards} onPreview={setOpenBillboard} />}
      {sdk && viewerElement && (
        <>
          <ViewModeControls viewer={viewerElement} hideCredit={isMatterportTagDocked}
            activeView={currentMode === sdk.Mode.Mode.DOLLHOUSE ? "dollhouse"
              : currentMode === sdk.Mode.Mode.FLOORPLAN ? "floorplan"
              : currentMode === sdk.Mode.Mode.INSIDE || currentMode === sdk.Mode.Mode.PANO360 ? "walkthrough" : null}
            busy={isFocusingBuilding || isViewingSpace || isReturningToCampus || isChangingView || currentMode === sdk.Mode.Mode.TRANSITIONING}
            onChange={(view) => void changeView(view)} />
          <BuildingLabels
            sdk={sdk}
            viewer={viewerElement}
            buildings={storage.buildings}
            selectedBuildingId={selectedBuilding?.id ?? null}
            visible={
              !isViewingSpace && !isReturningToCampus && !isMatterportTagOpen &&
              (currentMode === sdk.Mode.Mode.INSIDE
                ? selectedBuilding !== null
                : surveyMode || currentMode === sdk.Mode.Mode.DOLLHOUSE ||
                  currentMode === sdk.Mode.Mode.FLOORPLAN)
            }
            onSelect={(building) => void focusBuilding(building)}
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
              isBusy={isViewingSpace || isReturningToCampus || isFocusingBuilding || isChangingView}
              busyLabel={isFocusingBuilding ? "Opening floor plan…" : isReturningToCampus ? "Returning to campus…" : isChangingView ? "Changing view…" : "Opening space…"}
              isWalkthrough={currentMode === sdk.Mode.Mode.INSIDE || currentMode === sdk.Mode.Mode.PANO360}
              onViewSpace={() => {
                if (currentMode === sdk.Mode.Mode.INSIDE || currentMode === sdk.Mode.Mode.PANO360) {
                  void focusBuilding(selectedBuilding);
                } else {
                  void viewSelectedSpace();
                }
              }}
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
      {(status === "loading" || status === "intro" || status === "intro-exiting") && (
        <div
          className={`${styles.introScreen} ${status === "intro-exiting" ? styles.introExit : ""}`}
          onAnimationEnd={() => setStatus("ready")}
        >
          <video
            ref={introVideoRef}
            src="/gcu-campus-intro.mp4"
            aria-label="Garden City University introduction"
            preload="auto"
            muted
            playsInline
            onPlaying={() => setIntroNeedsPlay(false)}
            onEnded={finishIntro}
            onError={status === "intro" ? finishIntro : undefined}
          />
          {status === "intro" && introNeedsPlay && (
            <button className={styles.introPlay} type="button" onClick={playIntro}>Play introduction</button>
          )}
        </div>
      )}
      {(status === "loading" || status === "error") && (
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
