import type { WorldPosition } from "./buildings";

export function surfaceRing(position: WorldPosition, normal: WorldPosition, radius = 0.2) {
  const values = [position.x, position.y, position.z, normal.x, normal.y, normal.z, radius];
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (!values.every(Number.isFinite) || length < 0.0001 || radius <= 0) return [];
  const n = { x: normal.x / length, y: normal.y / length, z: normal.z / length };
  const reference = Math.abs(n.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const cross = (a: WorldPosition, b: WorldPosition) => ({
    x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
  });
  const tangent = cross(n, reference);
  const size = Math.hypot(tangent.x, tangent.y, tangent.z);
  const u = { x: tangent.x / size, y: tangent.y / size, z: tangent.z / size };
  const v = cross(n, u);
  return Array.from({ length: 48 }, (_, i) => {
    const angle = i * Math.PI * 2 / 48;
    const a = radius * Math.cos(angle), b = radius * Math.sin(angle);
    return { x: position.x + u.x * a + v.x * b,
      y: position.y + u.y * a + v.y * b, z: position.z + u.z * a + v.z * b };
  });
}
