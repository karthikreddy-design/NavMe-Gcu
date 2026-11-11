import type { WorldPosition } from "./buildings";

type WalkthroughDestination =
  | {
      kind: "sweep";
      /** 1-based position from the supplied Matterport `ss` URL parameter. */
      sweepIndex: number;
      yawPitchRadians: [number, number, number?];
    }
  | {
      kind: "position";
      position: WorldPosition;
      yawPitchRadians: [number, number, number?];
    };

const destinations: Record<string, WalkthroughDestination> = {
  "indoor sports": {
    kind: "sweep",
    sweepIndex: 809,
    yawPitchRadians: [-0.07, -0.25],
  },
  iipc: {
    kind: "sweep",
    sweepIndex: 791,
    yawPitchRadians: [-0.56, -0.88],
  },
  "front office": {
    kind: "sweep",
    sweepIndex: 168,
    yawPitchRadians: [-2.98, 0.38],
  },
  library: {
    kind: "sweep",
    sweepIndex: 861,
    yawPitchRadians: [-0.3, 0.06],
  },
  libruary: {
    kind: "sweep",
    sweepIndex: 861,
    yawPitchRadians: [-0.3, 0.06],
  },
  "indoor auditorium": {
    kind: "sweep",
    sweepIndex: 958,
    yawPitchRadians: [0.13, 0.08],
  },
  "indore auditorium": {
    kind: "sweep",
    sweepIndex: 958,
    yawPitchRadians: [0.13, 0.08],
  },
  cafeteria: {
    kind: "sweep",
    sweepIndex: 690,
    yawPitchRadians: [-0.09, -0.33],
  },
  "cafeteria 2": {
    kind: "sweep",
    sweepIndex: 710,
    yawPitchRadians: [-0.1, 0.19],
  },
  "mac lab": {
    kind: "sweep",
    sweepIndex: 802,
    yawPitchRadians: [-3.14, 0.55],
  },
};

function normalizeSpaceName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function getWalkthroughDestination(
  name: string,
): WalkthroughDestination | undefined {
  const normalizedName = normalizeSpaceName(name);
  if (normalizedName === "frontoffice") {
    return destinations["front office"];
  }
  return destinations[normalizedName === "maclab" ? "mac lab" : normalizedName];
}

export function toSdkRotation([
  yaw,
  pitch,
  roll,
]: [number, number, number?]) {
  const radiansToDegrees = (angle: number) => (angle * 180) / Math.PI;
  return {
    x: radiansToDegrees(pitch),
    y: radiansToDegrees(yaw),
    ...(roll === undefined ? {} : { z: radiansToDegrees(roll) }),
  };
}
