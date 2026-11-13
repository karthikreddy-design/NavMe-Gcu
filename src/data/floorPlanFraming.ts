import type { Building } from "./buildings";

const presets: Record<string, { x: number; z: number; heading: number; zoom: number; aspect: number }> = {
  iipc: { x: -5.4, z: 2, heading: 0, zoom: 9.55, aspect: 2.3 },
  "cafeteria 2": { x: 1.6, z: -0.35, heading: 0, zoom: 17.25, aspect: 2.115 },
  "indoor sports": { x: -10, z: -5.8, heading: 0, zoom: 18.5, aspect: 2.115 },
  cafeteria: { x: -0.8, z: -9.7, heading: 0, zoom: 13.8, aspect: 2.3 },
  library: { x: -4.4, z: 6.6, heading: 90, zoom: 18.75, aspect: 2.33 },
  "front office": { x: -3.1, z: -3.8, heading: 90, zoom: 8.65, aspect: 2.3 },
  "indoor auditorium": { x: 2.4, z: -7.2, heading: 90, zoom: 12.8, aspect: 2.3 },
  "mac lab": { x: 0.68, z: -0.28, heading: 187, zoom: 4, aspect: 2.3 },
};

const aliases: Record<string, string> = {
  cafeteria2: "cafeteria 2",
  libruary: "library", frontoffice: "front office", maclab: "mac lab",
  "indore auditorium": "indoor auditorium",
};

export function getFloorPlanFraming(building: Building, aspect: number) {
  const name = building.name.trim().toLowerCase().replace(/\s+/g, " ");
  const preset = presets[aliases[name] ?? name];
  if (preset) {
    // Each reference frames the room rather than just its saved label anchor.
    // Reapply the complete native frame after entering orthographic mode;
    // Showcase can override framing during the initial mode transition.
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : preset.aspect;
    return {
      position: { x: building.position.x + preset.x, y: building.position.y, z: building.position.z + preset.z },
      rotation: { x: -90, y: preset.heading },
      zoom: preset.zoom * preset.aspect / Math.max(0.25, safeAspect),
      refine: true,
    };
  }
  return { position: { ...building.position }, rotation: { x: -90, y: 0 }, zoom: 18 };
}

export function getCampusOverviewFraming(aspect: number) {
  const referenceAspect = 1256 / 670;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : referenceAspect;
  const scale = referenceAspect / Math.max(0.25, safeAspect);
  const position = { x: 35.5, y: 0, z: -32.2 };
  return {
    position,
    rotation: { x: -90, y: 90 },
    zoom: 76.5 * scale,
    // Perspective endpoint of the same calibrated overview. A native FLY
    // transition can reach it directly without entering Floor Plan first.
    dollhousePosition: {
      x: position.x + 65.37719960929904 * scale,
      y: 15.846112770670317 + 67.36986026684546 * scale,
      z: position.z,
    },
    orbitRotation: { x: -45.86, y: 90 },
  };
}
