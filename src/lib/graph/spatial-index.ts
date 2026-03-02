/**
 * Grid-based spatial index for O(1) point queries on graph node positions.
 * Divides world space into uniform cells — queries check the target cell
 * plus its 8 neighbors, giving constant-time hit detection regardless of
 * total node count.
 */

interface IndexEntry {
  id: string;
  x: number;
  y: number;
}

export class SpatialGrid {
  private cells = new Map<string, IndexEntry[]>();
  private cellSize: number;

  constructor(cellSize = 80) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private cell(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }

  rebuild(positions: { id: string; x: number; y: number }[]) {
    this.cells.clear();
    for (const p of positions) {
      const [cx, cy] = this.cell(p.x, p.y);
      const k = this.key(cx, cy);
      let bucket = this.cells.get(k);
      if (!bucket) {
        bucket = [];
        this.cells.set(k, bucket);
      }
      bucket.push({ id: p.id, x: p.x, y: p.y });
    }
  }

  /** Find the closest entry within `radius` of (x, y). */
  queryNearest(x: number, y: number, radius: number): IndexEntry | null {
    const [cx, cy] = this.cell(x, y);
    let best: IndexEntry | null = null;
    let bestDist = radius * radius;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(this.key(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const entry of bucket) {
          const ddx = entry.x - x;
          const ddy = entry.y - y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < bestDist) {
            bestDist = d2;
            best = entry;
          }
        }
      }
    }
    return best;
  }
}
