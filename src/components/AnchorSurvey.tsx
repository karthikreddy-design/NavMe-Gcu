"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MpSdk } from "@matterport/sdk";
import type {
  Building,
  BuildingFloor,
  WorldPosition,
} from "@/data/buildings";
import styles from "./AnchorSurvey.module.css";

type Props = {
  sdk: MpSdk;
  buildings: readonly Building[];
  storageReady: boolean;
  storageError: string;
  onSave: (buildings: Building[]) => boolean;
};

type PointerHit = {
  object: string;
  position: WorldPosition;
};

type CameraSnapshot = {
  position: WorldPosition;
  rotation: { x: number; y: number };
};

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function isSurveyEnabled() {
  return new URLSearchParams(window.location.search).get("survey") === "1";
}

export default function AnchorSurvey({
  sdk,
  buildings,
  storageReady,
  storageError,
  onSave,
}: Props) {
  const enabled = useSyncExternalStore(
    subscribeToLocation,
    isSurveyEnabled,
    () => false,
  );
  const captureArmedRef = useRef(false);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buildingId, setBuildingId] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [availableFloors, setAvailableFloors] = useState<
    MpSdk.Floor.FloorData[]
  >([]);
  const [buildingFloors, setBuildingFloors] = useState<BuildingFloor[]>([]);
  const [floorChoice, setFloorChoice] = useState("");
  const [isCaptureArmed, setIsCaptureArmed] = useState(false);
  const [capturedPosition, setCapturedPosition] =
    useState<WorldPosition | null>(null);
  const [pointerHit, setPointerHit] = useState<PointerHit | null>(null);
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot | null>(
    null,
  );
  const [zoomLevel, setZoomLevel] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const existingBuilding = buildings.find(
    (building) => building.id === editingId,
  );

  const clearCapture = () => {
    captureArmedRef.current = false;
    setIsCaptureArmed(false);
    setCapturedPosition(null);
    if (captureTimerRef.current !== null) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const floorSubscription = sdk.Floor.data.subscribe({
      onCollectionUpdated: (collection) => {
        setAvailableFloors(
          Object.values(collection).sort(
            (left, right) => left.sequence - right.sequence,
          ),
        );
      },
    });
    const pointerSubscription = sdk.Pointer.intersection.subscribe(
      (intersection) => {
        const position = {
          x: intersection.position.x,
          y: intersection.position.y,
          z: intersection.position.z,
        };
        setPointerHit({ object: intersection.object, position });

        if (
          captureArmedRef.current &&
          intersection.object === sdk.Pointer.Colliders.MODEL &&
          Number.isFinite(position.x) &&
          Number.isFinite(position.y) &&
          Number.isFinite(position.z)
        ) {
          setCapturedPosition(position);
          if (captureTimerRef.current !== null) {
            clearTimeout(captureTimerRef.current);
          }
          captureTimerRef.current = setTimeout(() => {
            setCapturedPosition(null);
            captureTimerRef.current = null;
          }, 15_000);
        }
      },
    );
    const poseSubscription = sdk.Camera.pose.subscribe((pose) => {
      setCameraSnapshot({
        position: pose.position,
        rotation: pose.rotation,
      });
    });
    const zoomSubscription = sdk.Camera.zoom.subscribe((zoom) => {
      setZoomLevel(zoom.level);
    });

    return () => {
      floorSubscription.cancel();
      pointerSubscription.cancel();
      poseSubscription.cancel();
      zoomSubscription.cancel();
      if (captureTimerRef.current !== null) {
        clearTimeout(captureTimerRef.current);
      }
    };
  }, [enabled, sdk]);

  if (!enabled) {
    return null;
  }

  const beginAdd = () => {
    clearCapture();
    setEditingId(null);
    setBuildingId("");
    setBuildingName("");
    setBuildingFloors([]);
    setFloorChoice("");
    setMessage("");
  };

  const beginEdit = (building: Building) => {
    clearCapture();
    setEditingId(building.id);
    setBuildingId(building.id);
    setBuildingName(building.name);
    setBuildingFloors(building.floors ?? []);
    setFloorChoice("");
    setMessage(`Editing ${building.name}. Its saved anchor is retained unless you recapture it.`);
  };

  const armCapture = () => {
    if (!buildingId.trim() || !buildingName.trim()) {
      setMessage("Enter a building ID and name before capturing its position.");
      return;
    }

    clearCapture();
    captureArmedRef.current = true;
    setIsCaptureArmed(true);
    setMessage("Capture armed. Aim at the intended point on the building in the scan.");
  };

  const saveBuilding = () => {
    const id = buildingId.trim();
    const name = buildingName.trim();
    if (!id || !name) {
      setMessage("Enter both a building ID and a building name.");
      return;
    }

    const duplicate = buildings.some(
      (building) =>
        building.id === id && building.id !== editingId,
    );
    if (duplicate) {
      setMessage("That building ID is already in use. Choose a unique ID.");
      return;
    }

    const position =
      capturedPosition ??
      existingBuilding?.position;
    if (!position) {
      setMessage("Capture an actual model point before adding this building.");
      return;
    }

    const updated = buildings.filter(
      (building) => building.id !== editingId,
    );
    updated.push({
      ...existingBuilding,
      id,
      name,
      position,
      floors: buildingFloors,
    });
    if (!onSave(updated)) {
      setMessage("The building was not saved. Check the browser storage error above.");
      return;
    }

    clearCapture();
    setEditingId(null);
    setBuildingId("");
    setBuildingName("");
    setBuildingFloors([]);
    setFloorChoice("");
    setMessage(`${name} saved. Its label is now visible in the viewer.`);
  };

  const addFloor = () => {
    const floor = availableFloors.find((item) => item.id === floorChoice);
    if (!floor) {
      setMessage("Choose a floor from the Matterport model first.");
      return;
    }
    if (
      buildingFloors.some(
        (item) => item.matterportFloorId === floor.id,
      )
    ) {
      setMessage("That Matterport floor is already assigned to this building.");
      return;
    }

    setBuildingFloors((current) => [
      ...current,
      {
        id: floor.id,
        name: floor.name,
        matterportFloorId: floor.id,
        matterportSequence: floor.sequence,
      },
    ]);
    setFloorChoice("");
    setMessage("");
  };

  const updateFloorName = (id: string, name: string) => {
    setBuildingFloors((current) =>
      current.map((floor) => (floor.id === id ? { ...floor, name } : floor)),
    );
  };

  const deleteBuilding = (building: Building) => {
    if (!window.confirm(`Delete the ${building.name} label?`)) {
      return;
    }

    const updated = buildings.filter((item) => item.id !== building.id);
    if (onSave(updated)) {
      if (editingId === building.id) {
        beginAdd();
      }
      setMessage(`${building.name} deleted.`);
    } else {
      setMessage("The building was not deleted. Check the browser storage error above.");
    }
  };

  return (
    <section className={styles.panel} aria-label="Building label editor">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>GCU NAVME / ADMIN</span>
          <h1>Building labels</h1>
        </div>
        <button className={styles.newButton} type="button" onClick={beginAdd}>
          New
        </button>
      </header>
      <p className={styles.instructions}>
        Add or edit a label, then capture its anchor from the actual model.
        Anchors are surface points; choose a clearly visible point on the
        intended building, not a scan viewpoint. The cyan pin tip marks the
        captured point; the name badge sits above it for readability.
      </p>

      <div className={styles.buildingList} aria-label="Saved buildings">
        {buildings.length === 0 ? (
          <p className={styles.empty}>No saved building labels yet.</p>
        ) : (
          buildings.map((building) => (
            <div className={styles.buildingRow} key={building.id}>
              <button
                type="button"
                className={styles.buildingName}
                onClick={() => beginEdit(building)}
              >
                <strong>{building.name}</strong>
                <span>{building.id}</span>
              </button>
              <button
                className={styles.deleteButton}
                type="button"
                aria-label={`Delete ${building.name}`}
                onClick={() => deleteBuilding(building)}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.form}>
        <h2>{editingId ? "Edit building" : "Add a building"}</h2>
        <label>
          Building ID
          <input
            value={buildingId}
            onChange={(event) => {
              clearCapture();
              setBuildingId(event.target.value);
              setMessage("");
            }}
            placeholder="A unique ID, e.g. west-block"
            disabled={!storageReady || Boolean(storageError)}
          />
        </label>
        <label>
          Building name
          <input
            value={buildingName}
            onChange={(event) => {
              clearCapture();
              setBuildingName(event.target.value);
              setMessage("");
            }}
            placeholder="Enter the confirmed building name"
            disabled={!storageReady || Boolean(storageError)}
          />
        </label>
        <div className={styles.floorEditor}>
          <h3>Building floors</h3>
          <p>
            Choose from floors reported by this Matterport model. The selected
            floor applies to the whole model, not just this building.
          </p>
          {buildingFloors.map((floor) => (
            <div className={styles.floorAssignment} key={floor.id}>
              <label>
                Display name
                <input
                  value={floor.name}
                  onChange={(event) =>
                    updateFloorName(floor.id, event.target.value)
                  }
                  placeholder="Floor name"
                  disabled={!storageReady || Boolean(storageError)}
                />
              </label>
              <span>
                Matterport: {floor.name} · floor {floor.matterportSequence + 1}
              </span>
              <button
                className={styles.deleteButton}
                type="button"
                onClick={() =>
                  setBuildingFloors((current) =>
                    current.filter((item) => item.id !== floor.id),
                  )
                }
              >
                Remove floor
              </button>
            </div>
          ))}
          <div className={styles.addFloor}>
            <label>
              Matterport floor
              <select
                value={floorChoice}
                onChange={(event) => setFloorChoice(event.target.value)}
                disabled={
                  !storageReady ||
                  Boolean(storageError) ||
                  availableFloors.length === 0
                }
              >
                <option value="">Select a model floor</option>
                {availableFloors
                  .filter(
                    (floor) =>
                      !buildingFloors.some(
                        (item) => item.matterportFloorId === floor.id,
                      ),
                  )
                  .map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {floor.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className={styles.newButton}
              type="button"
              onClick={addFloor}
              disabled={!floorChoice}
            >
              Assign floor
            </button>
            {availableFloors.length === 0 && (
              <p className={styles.position}>
                The Matterport model has not reported any floors.
              </p>
            )}
          </div>
        </div>
        {existingBuilding && !capturedPosition && (
          <p className={styles.position}>
            Existing verified anchor retained:{" "}
            {existingBuilding.position.x.toFixed(2)},{" "}
            {existingBuilding.position.y.toFixed(2)},{" "}
            {existingBuilding.position.z.toFixed(2)}
          </p>
        )}
        {capturedPosition && (
          <p className={styles.position}>
            Selected model point: {capturedPosition.x.toFixed(3)},{" "}
            {capturedPosition.y.toFixed(3)},{" "}
            {capturedPosition.z.toFixed(3)}
          </p>
        )}
        <button
          className={styles.capture}
          type="button"
          onClick={armCapture}
          disabled={
            !storageReady ||
            Boolean(storageError) ||
            !buildingId.trim() ||
            !buildingName.trim()
          }
        >
          {isCaptureArmed ? "Capture armed — aim at building" : "Select anchor in scan"}
        </button>
        <button
          className={styles.save}
          type="button"
          onClick={saveBuilding}
          disabled={
            !storageReady ||
            Boolean(storageError) ||
            !buildingId.trim() ||
            !buildingName.trim() ||
            (!capturedPosition && !existingBuilding)
          }
        >
          {editingId ? "Save Changes" : "Add Building"}
        </button>
        {editingId && (
          <button className={styles.cancel} type="button" onClick={beginAdd}>
            Cancel editing
          </button>
        )}
      </div>

      {pointerHit && (
        <p className={styles.position}>
          Matterport pointer hit: {pointerHit.object}
        </p>
      )}
      {cameraSnapshot && (
        <p className={styles.position}>
          Camera: {cameraSnapshot.position.x.toFixed(1)},{" "}
          {cameraSnapshot.position.y.toFixed(1)},{" "}
          {cameraSnapshot.position.z.toFixed(1)} · rotation{" "}
          {cameraSnapshot.rotation.x.toFixed(1)},{" "}
          {cameraSnapshot.rotation.y.toFixed(1)}
          {zoomLevel !== null ? ` · zoom ${zoomLevel.toFixed(2)}` : ""}
        </p>
      )}
      {!storageReady && (
        <p className={styles.message} role="status">
          Loading saved building labels…
        </p>
      )}
      {storageError && (
        <p className={styles.error} role="alert">
          {storageError}
        </p>
      )}
      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
