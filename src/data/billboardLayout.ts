export type AnchoredCard = { id: string; x: number; y: number; width: number; height: number; distance?: number };
export type PlacedCard = AnchoredCard & { left: number; top: number; factor: number };

/** Walkthrough signs never move away from their anchor to make room. */
export function layoutFixedBillboards(cards: AnchoredCard[], width: number, height: number): PlacedCard[] {
  const placed: PlacedCard[] = [];
  const gap = 8;
  const sorted = [...cards].sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.id.localeCompare(b.id));
  for (const card of sorted) {
    const left = card.x - card.width / 2;
    const top = card.y - card.height;
    if (left < 8 || top < 8 || left + card.width > width - 8 || top + card.height > height - 8) continue;
    // Let the nearest sign occlude a more distant one instead of rearranging
    // both across the scene. It reappears when the camera separates them.
    if (placed.some((p) => left < p.left + p.width + gap && left + card.width + gap > p.left && top < p.top + p.height + gap && top + card.height + gap > p.top)) continue;
    placed.push({ ...card, left, top, factor: 1 });
  }
  return placed;
}

/** Keep anchors unchanged; move only the screen-space cards to free rectangles. */
export function layoutBillboards(cards: AnchoredCard[], width: number, height: number): PlacedCard[] {
  if (!cards.length || width <= 0 || height <= 0) return [];
  const margin = 8;
  const gap = 10;
  const sorted = [...cards].sort((a, b) => a.id.localeCompare(b.id));
  for (let attempt = 0; attempt < 12; attempt++) {
    const factor = 0.9 ** attempt;
    const placed: PlacedCard[] = [];
    for (const card of sorted) {
      const w = card.width * factor;
      const h = card.height * factor;
      const maxX = width - margin - w;
      const maxY = height - margin - h;
      if (maxX < margin || maxY < margin) break;
      const desiredX = Math.max(margin, Math.min(maxX, card.x - w / 2));
      const desiredY = Math.max(margin, Math.min(maxY, card.y - h));
      const xs = [desiredX, margin, maxX, ...placed.flatMap((p) => [p.left - gap - w, p.left + p.width + gap])];
      const ys = [desiredY, margin, maxY, ...placed.flatMap((p) => [p.top - gap - h, p.top + p.height + gap])];
      let best: { left: number; top: number; distance: number } | null = null;
      for (const left of xs) for (const top of ys) {
        if (left < margin || left > maxX || top < margin || top > maxY) continue;
        const distance = (left - desiredX) ** 2 + (top - desiredY) ** 2;
        if (best && distance >= best.distance) continue;
        if (placed.some((p) => left < p.left + p.width + gap && left + w + gap > p.left && top < p.top + p.height + gap && top + h + gap > p.top)) continue;
        best = { left, top, distance };
      }
      if (!best) break;
      placed.push({ ...card, width: w, height: h, left: best.left, top: best.top, factor });
    }
    if (placed.length === cards.length) return placed;
  }
  // A uniformly fitted grid guarantees separation even in very small viewports.
  const columns = Math.max(1, Math.ceil(Math.sqrt(cards.length * width / height)));
  const rows = Math.ceil(cards.length / columns);
  const cellW = width / columns;
  const cellH = height / rows;
  return sorted.map((card, index) => {
    const factor = Math.max(0.01, Math.min(1, (cellW - 8) / card.width, (cellH - 8) / card.height));
    const w = card.width * factor;
    const h = card.height * factor;
    return { ...card, width: w, height: h, factor, left: (index % columns) * cellW + (cellW - w) / 2, top: Math.floor(index / columns) * cellH + (cellH - h) / 2 };
  });
}
