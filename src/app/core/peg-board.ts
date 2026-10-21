/**
 * Fixed geometry of the peg-board floor, in millimetres. The floor is a
 * 500 x 300 mm grid of 2 mm holes at a 10 mm pitch with the origin on a hole;
 * the board's pegs (2 mm) stand in those holes. Width, height and margin are placeholders
 * until the machine's real bed is configurable: change them here only.
 *
 * Machine coordinates: origin at the origin hole, +X to the right, +Y away from
 * the viewer (the same orientation as the Gerber, +Y up). A board placed with
 * offset (x, y) has its lower-left bounds corner at (x, y).
 */
export const PEG_BOARD = {
  /** Floor extent: spans X from -margin to width-margin, same for Y. */
  width: 500,
  height: 300,
  /** Floor distance left of and below the origin hole. */
  margin: 20,
  /** Spacing of the hole grid; the origin sits on a hole. */
  holePitch: 10,
  holeDiameter: 2,
  /** Pegs stand in the floor holes, so they share the hole diameter. */
  pegDiameter: 2,
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
