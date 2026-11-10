export type WorldPosition = {
  x: number;
  y: number;
  z: number;
};

export type BuildingFloor = {
  id: string;
  name: string;
  matterportFloorId: string;
  matterportSequence: number;
};

export type BuildingRoom = {
  id: string;
  name: string;
  floorId: string;
};

export type Building = {
  id: string;
  name: string;
  position: WorldPosition;
  floors?: BuildingFloor[];
  rooms?: BuildingRoom[];
};

export const BUILDINGS_STORAGE_KEY = "gcu-navme-buildings-v1";

export function isBuildingList(value: unknown): value is Building[] {
  if (!Array.isArray(value)) {
    return false;
  }

  const ids = new Set<string>();
  return value.every((item: unknown) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const building = item as Partial<Building>;
    const position = building.position;
    if (
      typeof building.id !== "string" ||
      !building.id.trim() ||
      ids.has(building.id) ||
      typeof building.name !== "string" ||
      !building.name.trim() ||
      typeof position !== "object" ||
      position === null ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z) ||
      (building.floors !== undefined &&
        (!Array.isArray(building.floors) ||
          !building.floors.every(
            (floor) =>
              typeof floor === "object" &&
              floor !== null &&
              typeof floor.id === "string" &&
              typeof floor.name === "string" &&
              typeof floor.matterportFloorId === "string" &&
              Number.isInteger(floor.matterportSequence) &&
              floor.matterportSequence >= 0,
          ))) ||
      (building.rooms !== undefined &&
        (!Array.isArray(building.rooms) ||
          !building.rooms.every(
            (room) =>
              typeof room === "object" &&
              room !== null &&
              typeof room.id === "string" &&
              typeof room.name === "string" &&
              typeof room.floorId === "string",
          )))
    ) {
      return false;
    }

    ids.add(building.id);
    return true;
  });
}
