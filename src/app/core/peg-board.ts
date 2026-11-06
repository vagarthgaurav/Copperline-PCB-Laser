const HOLE_PITCH = 15;
const HOLES_X = 27;
const HOLES_Y = 21;
const MARGIN = 15;

/**
 * Fixed geometry of the peg-board floor, in millimetres. The floor is a grid of
 * 27 x 21 holes (X x Y), 3.5 mm in diameter at a 15 mm hole-to-hole pitch, with
 * the origin on the lower-left hole. The board's pegs (3.5 mm) stand in those holes.
 * The floor extends one `margin` beyond the outer holes on every side.
 *
 * Machine coordinates: origin at the origin hole, +X to the right, +Y away from
 * the viewer (the same orientation as the Gerber, +Y up). A board placed with
 * offset (x, y) has its lower-left bounds corner at (x, y).
 */
export const PEG_BOARD = {
  holesX: HOLES_X,
  holesY: HOLES_Y,
  /** Floor extent: spans X from -margin to width-margin, same for Y. */
  width: (HOLES_X - 1) * HOLE_PITCH + 2 * MARGIN,
  height: (HOLES_Y - 1) * HOLE_PITCH + 2 * MARGIN,
  /** Floor distance left of and below the origin hole. */
  margin: MARGIN,
  /** Spacing of the hole grid; the origin sits on a hole. */
  holePitch: HOLE_PITCH,
  holeDiameter: 3.5,
  /** Pegs stand in the floor holes, so they share the hole diameter. */
  pegDiameter: 3.5,
  pegHeight: 8,
  /** Rendered board thickness. */
  boardThickness: 1.6,
} as const;

/** The floor rectangle in machine mm. */
export function floorBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: -PEG_BOARD.margin,
    minY: -PEG_BOARD.margin,
    maxX: PEG_BOARD.width - PEG_BOARD.margin,
    maxY: PEG_BOARD.height - PEG_BOARD.margin,
  };
}
