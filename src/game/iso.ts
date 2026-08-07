/** Isometric tile footprint (Forge of Empires–style diamond). */
export const ISO_W = 80;
export const ISO_H = 40;

/** Grid cell → isometric world (before camera). */
export function gridToIso(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (ISO_W / 2),
    y: (gx + gy) * (ISO_H / 2),
  };
}

/** Continuous grid coords → isometric world. */
export function gridFloatToIso(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (ISO_W / 2),
    y: (gx + gy) * (ISO_H / 2),
  };
}

/** Isometric world → approximate grid float. */
export function isoToGrid(ix: number, iy: number): { x: number; y: number } {
  const gx = iy / ISO_H + ix / ISO_W;
  const gy = iy / ISO_H - ix / ISO_W;
  return { x: gx, y: gy };
}

export function battleToGridFloat(bx: number, by: number, cell: number): { x: number; y: number } {
  return { x: bx / cell, y: by / cell };
}
