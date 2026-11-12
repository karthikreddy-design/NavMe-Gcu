import type { WorldPosition } from "./buildings";

export type BillboardMedia = { id: string; name: string; type: "image" | "video"; url: string };
export type Billboard = {
  id: string; title: string; description: string; position: WorldPosition;
  published: boolean; enabled: boolean; media: BillboardMedia[];
};

export function isBillboard(value: unknown): value is Billboard {
  if (!value || typeof value !== "object") return false;
  const b = value as Billboard;
  return typeof b.id === "string" && /^[\w-]{1,100}$/.test(b.id) &&
    typeof b.title === "string" && b.title.trim().length > 0 && b.title.length <= 150 &&
    typeof b.description === "string" && b.description.length <= 10000 &&
    !!b.position && [b.position.x, b.position.y, b.position.z].every(Number.isFinite) &&
    typeof b.published === "boolean" && typeof b.enabled === "boolean" &&
    Array.isArray(b.media) && b.media.length <= 20 && b.media.every((m) =>
      !!m && typeof m.id === "string" && /^[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm)$/.test(m.id) &&
      typeof m.name === "string" && m.name.length <= 255 &&
      ((m.type === "image" && /\.(png|jpg|webp|gif)$/.test(m.id)) || (m.type === "video" && /\.(mp4|webm)$/.test(m.id))) &&
      m.url === `/api/media/${m.id}`);
}
