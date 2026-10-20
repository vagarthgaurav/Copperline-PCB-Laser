/**
 * Fixed geometry of the peg-board floor, in millimetres. Placeholder values
 * until the machine's real bed is configurable: change them here only.
 *
 * Machine coordinates: origin at the origin peg, +X to the right, +Y away from
 * the viewer (the same orientation as the Gerber, +Y up). A board placed with
 * offset (x, y) has its lower-left bounds corner at (x, y).
 */
export const PEG_BOARD = {
  /** Floor extent: spans X from -margin to width-margin, same for Y. */
  width: 200,
  height: 150,
  /** Floor distance left of and below the origin peg. */
  margin: 20,
  /** Spacing of the hole grid; the origin peg sits on a hole. */
  holePitch: 10,
  holeDiameter: 3,
  pegDiameter: 5,
  pegHeight: 8,
  /** Peg positions in machine mm: the origin peg and the second peg along +X. */
  pegs: [
    { x: 0, y: 0, label: 'Origin peg' },
    { x: 60, y: 0, label: '' },
  ],
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
