import * as THREE from 'three';

import { PEG_BOARD, floorBounds } from '../../core/peg-board';
import {
  Affine2D,
  ViewCamera,
  ViewState,
  VERTICES_PER_STRIP,
  boardTransform,
  buildDashes,
  canvasToNdc,
  clipRange,
  countDone,
  defaultView,
  extractFeed,
  fitCamera,
  grabBounds,
  holeGrid,
  orbitView,
  panView,
  pointInBoard,
  rayPlaneZ,
  stripQuads,
  viewPosition,
  zoomViewAt,
} from './scene-math';
import {
  BoardGeometry,
  PathSegment,
  PegBoardSceneApi,
  SceneState,
  ScenePalette,
} from './scene.types';

/** Floor slab thickness below the peg-board top (z = 0). */
const FLOOR_THICKNESS = 6;
const BOARD_TOP = PEG_BOARD.boardThickness;

/** Camera lens; orientation, target and zoom are the view state, starting from `defaultView`. */
const CAMERA = { fovDeg: 30, margin: 0.04 };

/** Heights above the board top for each flat layer, so they never z-fight. */
const LAYER = { copper: 0.03, drill: 0.06, rim: 0.06, remaining: 0.09, done: 0.12 };

/** Engraved moves are drawn thicker than the remaining path (colour alone must not tell them apart). */
const DONE_WIDTH = 0.3;
const REMAINING_WIDTH = 0.1;
const DASH = 0.8;
const GAP = 0.8;
/** Beyond this many feed moves, or dashes, the remaining path is drawn solid so big programs stay fast. */
const MAX_DASHED_MOVES = 20000;
const MAX_DASHES = 60000;
const REMAINING_OPACITY = 0.55;

/** Laser head: cone tip height above the floor, and sizes. */
const LASER_TIP_Z = 12;
const LASER_CONE = { radius: 1.6, height: 4 };
/** Top of the laser head housing: the highest point of the scene, for the clip planes. */
const SCENE_TOP = LASER_TIP_Z + LASER_CONE.height * 2;

/** Share of the way from the floor colour to the peg colour used for the hole grid. */
const HOLE_BLEND = 0.5;

/**
 * Lit materials divide irradiance by pi, so ambient + key at the top face must
 * add up to pi for a flat-facing surface to show exactly its token colour.
 */
const LIGHT_DIR = new THREE.Vector3(-0.3, -0.5, 1).normalize();
const AMBIENT = 0.6 * Math.PI;
const KEY = (Math.PI - AMBIENT) / LIGHT_DIR.z;

/** What `updateDoneRanges` needs to split the path by line without rebuilding buffers. */
interface PathData {
  feedLines: Int32Array;
  /** Index of the first dash of each move (dashed mode), else null for solid strips. */
  firstDash: Uint32Array | null;
  /** Last applied split, -1 before the first. */
  doneCount: number;
}

/**
 * Plain Three.js scene for the peg board: floor, the placed board with its pegs,
 * its copper, the G-code path and the laser head. Renders on demand (no
 * animation loop). No Angular imports: `PegBoardViewport` owns the canvas.
 */
export class PegBoardScene implements PegBoardSceneApi {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, 1, 1, 1000);
  private readonly raycaster = new THREE.Raycaster();

  private readonly floorGroup = new THREE.Group();
  private readonly boardGroup = new THREE.Group();
  private readonly pathGroup = new THREE.Group();
  private readonly laserGroup = new THREE.Group();

  // Materials live as long as the scene; palette changes recolour them in place.
  private readonly floorMat = new THREE.MeshLambertMaterial();
  private readonly pegMat = new THREE.MeshLambertMaterial();
  private readonly holeMat = new THREE.MeshBasicMaterial();
  private readonly boardMat = new THREE.MeshLambertMaterial();
  private readonly blankMat = new THREE.MeshLambertMaterial();
  private readonly copperMat = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  private readonly drillMat = new THREE.MeshBasicMaterial({
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly rimMat = new THREE.LineBasicMaterial();
  private readonly doneMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private readonly remainingMat = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: REMAINING_OPACITY,
    depthWrite: false,
  });
  private readonly laserMat = new THREE.MeshBasicMaterial();
  private readonly beamMat = new THREE.LineBasicMaterial();

  private palette: ScenePalette | null = null;
  private state: SceneState | null = null;
  private transform: Affine2D | null = null;
  private pathData: PathData | null = null;
  private doneMesh: THREE.Mesh | null = null;
  private remainingMesh: THREE.Mesh | null = null;

  /** Orbit, pan and zoom; survives resizes and state changes. */
  private view: ViewState = defaultView(floorBounds());
  private width = 0;
  private height = 0;
  private frame = 0;
  private disposed = false;

  /** `renderer` is a seam for specs (jsdom has no WebGL); the app lets the scene create its own. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    renderer?: THREE.WebGLRenderer,
  ) {
    try {
      this.renderer =
        renderer ?? new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`WebGL is not available, cannot draw the peg board (${reason})`);
    }
    THREE.ColorManagement.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera.up.set(0, 0, 1);
    this.scene.add(
      new THREE.AmbientLight(0xffffff, AMBIENT),
      this.directionalLight(),
      this.floorGroup,
      this.boardGroup,
      this.pathGroup,
      this.laserGroup,
    );
    this.boardGroup.matrixAutoUpdate = false;
    this.laserGroup.visible = false;

    this.buildFloor();
    this.buildLaser();
  }

  setPalette(palette: ScenePalette): void {
    if (this.disposed) return;
    this.palette = palette;
    this.applyPalette();
    this.requestRender();
  }

  setState(state: SceneState): void {
    if (this.disposed) return;
    const prev = this.state;
    this.state = state;

    const placed =
      !prev ||
      prev.board !== state.board ||
      prev.offsetX !== state.offsetX ||
      prev.offsetY !== state.offsetY ||
      prev.quarterTurns !== state.quarterTurns ||
      prev.mirrored !== state.mirrored;
    if (!prev || prev.board !== state.board) this.buildBoard(state.board);
    if (placed) this.placeBoard(state);
    if (!prev || prev.path !== state.path) this.buildPath(state.path, state.doneLine);
    else if (prev.doneLine !== state.doneLine) this.updateDoneRanges(state.doneLine);
    this.placeLaser(state.tool);
    this.requestRender();
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(pixelRatio);
    // `false`: the component sizes the canvas with CSS; we only set the drawing buffer.
    this.renderer.setSize(width, height, false);
    this.applyView();
    // Resizing clears the buffer; draw in the same frame rather than flashing blank.
    this.renderNow();
  }

  floorPoint(canvasX: number, canvasY: number): { x: number; y: number } | null {
    // Not clamped to the floor, so a drag keeps tracking past its edge.
    return this.pick(canvasX, canvasY, 0);
  }

  hitBoard(canvasX: number, canvasY: number): boolean {
    if (!this.state?.board || !this.transform) return false;
    const hit = this.pick(canvasX, canvasY, BOARD_TOP);
    // The blank counts as part of the board, so it can be grabbed by its peg-hole margin.
    const { bounds, blank } = this.state.board;
    return hit !== null && pointInBoard(hit.x, hit.y, grabBounds(bounds, blank), this.transform);
  }

  orbit(dAzimuthDeg: number, dElevationDeg: number): void {
    this.changeView(orbitView(this.view, dAzimuthDeg, dElevationDeg));
  }

  pan(fromX: number, fromY: number, toX: number, toY: number): void {
    if (!this.hasSize()) return;
    this.changeView(
      panView(
        this.view,
        this.viewCamera(),
        canvasToNdc(fromX, fromY, this.width, this.height),
        canvasToNdc(toX, toY, this.width, this.height),
        floorBounds(),
      ),
    );
  }

  panScreen(dxFrac: number, dyFrac: number): void {
    // Drag the floor the opposite way: looking right means the floor slides left.
    const cx = this.width / 2;
    const cy = this.height / 2;
    this.pan(cx, cy, cx - dxFrac * this.width, cy + dyFrac * this.height);
  }

  zoom(factor: number, canvasX?: number, canvasY?: number): void {
    if (!this.hasSize()) return;
    const at =
      canvasX === undefined || canvasY === undefined
        ? null
        : canvasToNdc(canvasX, canvasY, this.width, this.height);
    this.changeView(zoomViewAt(this.view, this.viewCamera(), factor, at, floorBounds()));
  }

  resetView(): void {
    this.changeView(defaultView(floorBounds()));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;

    for (const group of [this.floorGroup, this.boardGroup, this.pathGroup, this.laserGroup]) {
      this.clearGroup(group);
    }
    for (const material of [
      this.floorMat,
      this.pegMat,
      this.holeMat,
      this.boardMat,
      this.copperMat,
      this.drillMat,
      this.rimMat,
      this.blankMat,
      this.doneMat,
      this.remainingMat,
      this.laserMat,
      this.beamMat,
    ]) {
      material.dispose();
    }
    this.renderer.dispose();
  }

  // --- building ---------------------------------------------------------

  private directionalLight(): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(0xffffff, KEY);
    light.position.copy(LIGHT_DIR);
    return light;
  }

  /** Slab and hole grid. Static, so built once. */
  private buildFloor(): void {
    const floor = floorBounds();
    const w = floor.maxX - floor.minX;
    const h = floor.maxY - floor.minY;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, FLOOR_THICKNESS), this.floorMat);
    slab.position.set(floor.minX + w / 2, floor.minY + h / 2, -FLOOR_THICKNESS / 2);
    this.floorGroup.add(slab);

    const holes = holeGrid(floor, PEG_BOARD.holePitch, PEG_BOARD.holeDiameter);
    const discs = new THREE.InstancedMesh(
      new THREE.CircleGeometry(PEG_BOARD.holeDiameter / 2, 16),
      this.holeMat,
      holes.length / 2,
    );
    const at = new THREE.Matrix4();
    for (let i = 0; i < holes.length / 2; i++) {
      discs.setMatrixAt(i, at.makeTranslation(holes[i * 2], holes[i * 2 + 1], 0.02));
    }
    discs.instanceMatrix.needsUpdate = true;
    this.floorGroup.add(discs);
  }

  /** Board geometry in board coordinates; `placeBoard` positions the group. */
  private buildBoard(board: BoardGeometry | null): void {
    this.clearGroup(this.boardGroup);
    if (!board) return;

    if (board.blank) {
      // The bare blank is the board: a box of the board thickness, so the peg holes sit in it.
      const { minX, minY, maxX, maxY } = board.blank;
      const box = new THREE.BoxGeometry(maxX - minX, maxY - minY, BOARD_TOP);
      box.translate((minX + maxX) / 2, (minY + maxY) / 2, BOARD_TOP / 2);
      this.boardGroup.add(new THREE.Mesh(box, this.blankMat));
    } else {
      this.boardGroup.add(new THREE.Mesh(this.slabGeometry(board), this.boardMat));
    }

    if (board.copper.length >= 9) {
      const copper = new THREE.BufferGeometry();
      copper.setAttribute(
        'position',
        new THREE.BufferAttribute(this.liftXY(board.copper, BOARD_TOP + LAYER.copper), 3),
      );
      this.boardGroup.add(new THREE.Mesh(copper, this.copperMat));
    }

    if (board.holes.length > 0) {
      const drills = new THREE.InstancedMesh(
        new THREE.CircleGeometry(0.5, 20),
        this.drillMat,
        board.holes.length,
      );
      const at = new THREE.Matrix4();
      board.holes.forEach((hole, i) => {
        at.makeScale(hole.diameter, hole.diameter, 1).setPosition(
          hole.x,
          hole.y,
          BOARD_TOP + LAYER.drill,
        );
        drills.setMatrixAt(i, at);
      });
      drills.instanceMatrix.needsUpdate = true;
      this.boardGroup.add(drills);
    }

    if (board.pegHoles.length > 0) {
      // Standing on the floor (the board group's z = 0 is the floor surface) and through the board.
      const pegs = new THREE.InstancedMesh(this.pegGeometry(), this.pegMat, board.pegHoles.length);
      const at = new THREE.Matrix4();
      board.pegHoles.forEach((hole, i) => {
        pegs.setMatrixAt(i, at.makeTranslation(hole.x, hole.y, PEG_BOARD.pegHeight / 2));
      });
      pegs.instanceMatrix.needsUpdate = true;
      this.boardGroup.add(pegs);
    }

    for (const ring of board.outline) {
      if (ring.length < 6) continue;
      const rim = new THREE.BufferGeometry();
      rim.setAttribute(
        'position',
        new THREE.BufferAttribute(this.liftXY(ring, BOARD_TOP + LAYER.rim), 3),
      );
      this.boardGroup.add(new THREE.LineLoop(rim, this.rimMat));
    }
  }

  /** One peg: a cylinder standing along Z, centred on its own origin. */
  private pegGeometry(): THREE.BufferGeometry {
    // Cylinders stand along Y by default; turn them to stand along Z.
    return new THREE.CylinderGeometry(
      PEG_BOARD.pegDiameter / 2,
      PEG_BOARD.pegDiameter / 2,
      PEG_BOARD.pegHeight,
      24,
    ).rotateX(Math.PI / 2);
  }

  /**
   * The board body. A single closed outline ring is extruded; with no outline,
   * several rings (no hole handling here) or a degenerate ring, a slab of the bounds.
   */
  private slabGeometry(board: BoardGeometry): THREE.BufferGeometry {
    const ring = board.outline.length === 1 ? board.outline[0] : null;
    if (ring && ring.length >= 6) {
      const points: THREE.Vector2[] = [];
      for (let i = 0; i < ring.length; i += 2) points.push(new THREE.Vector2(ring[i], ring[i + 1]));
      if (points.length > 3 && points[0].equals(points[points.length - 1])) points.pop();
      return new THREE.ExtrudeGeometry(new THREE.Shape(points), {
        depth: BOARD_TOP,
        bevelEnabled: false,
      });
    }
    const { minX, minY, maxX, maxY } = board.bounds;
    const box = new THREE.BoxGeometry(maxX - minX, maxY - minY, BOARD_TOP);
    return box.translate((minX + maxX) / 2, (minY + maxY) / 2, BOARD_TOP / 2);
  }

  private placeBoard(state: SceneState): void {
    if (!state.board) {
      this.transform = null;
      return;
    }
    const m = boardTransform(
      state.board.bounds,
      state.offsetX,
      state.offsetY,
      state.quarterTurns,
      state.mirrored,
    );
    this.transform = m;
    this.boardGroup.matrix.set(m.a, m.c, 0, m.e, m.b, m.d, 0, m.f, 0, 0, 1, 0, 0, 0, 0, 1);
    this.boardGroup.matrixWorldNeedsUpdate = true;
  }

  /**
   * Engraved moves as one thick strip buffer, the rest as dashes (or thin solid
   * strips for huge programs). Built once per `path`; `doneLine` then only
   * moves draw ranges.
   */
  private buildPath(path: readonly PathSegment[], doneLine: number): void {
    this.clearGroup(this.pathGroup);
    this.doneMesh = null;
    this.remainingMesh = null;
    this.pathData = null;
    if (path.length === 0) return;

    const feed = extractFeed(path);
    const moves = feed.lines.length;
    if (moves === 0) return;
    const z = BOARD_TOP;

    const done = new THREE.BufferGeometry();
    done.setAttribute(
      'position',
      new THREE.BufferAttribute(stripQuads(feed.coords, DONE_WIDTH, DONE_WIDTH / 2), 3),
    );
    this.doneMesh = new THREE.Mesh(done, this.doneMat);
    this.doneMesh.position.z = z + LAYER.done;
    this.doneMesh.frustumCulled = false;

    const dashes =
      moves <= MAX_DASHED_MOVES ? buildDashes(feed.coords, DASH, GAP, MAX_DASHES) : null;
    const remaining = new THREE.BufferGeometry();
    remaining.setAttribute(
      'position',
      new THREE.BufferAttribute(
        stripQuads(dashes ? dashes.coords : feed.coords, REMAINING_WIDTH),
        3,
      ),
    );
    this.remainingMesh = new THREE.Mesh(remaining, this.remainingMat);
    this.remainingMesh.position.z = z + LAYER.remaining;
    this.remainingMesh.frustumCulled = false;

    this.pathGroup.add(this.remainingMesh, this.doneMesh);
    this.pathData = {
      feedLines: feed.lines,
      firstDash: dashes ? dashes.firstDash : null,
      doneCount: -1,
    };
    this.updateDoneRanges(doneLine);
  }

  /** Moves are in line order, so the done/remaining split is one binary search. */
  private updateDoneRanges(doneLine: number): void {
    const data = this.pathData;
    if (!data || !this.doneMesh || !this.remainingMesh) return;
    const doneCount = countDone(data.feedLines, doneLine);
    if (doneCount === data.doneCount) return;
    data.doneCount = doneCount;

    this.doneMesh.geometry.setDrawRange(0, doneCount * VERTICES_PER_STRIP);
    // Dashes and moves are indexed differently: map the move split to the first dash after it.
    const firstRemaining = data.firstDash ? data.firstDash[doneCount] : doneCount;
    const total =
      (data.firstDash ? data.firstDash[data.feedLines.length] : data.feedLines.length) -
      firstRemaining;
    this.remainingMesh.geometry.setDrawRange(
      firstRemaining * VERTICES_PER_STRIP,
      total * VERTICES_PER_STRIP,
    );
  }

  /** Head (cone pointing down under a short housing) and a thin beam to the board top. */
  private buildLaser(): void {
    const cone = new THREE.ConeGeometry(LASER_CONE.radius, LASER_CONE.height, 20);
    cone.rotateX(-Math.PI / 2); // tip from +Y to -Z
    cone.translate(0, 0, LASER_TIP_Z + LASER_CONE.height / 2);
    const housing = new THREE.CylinderGeometry(
      LASER_CONE.radius,
      LASER_CONE.radius,
      LASER_CONE.height,
      20,
    );
    housing.rotateX(Math.PI / 2);
    housing.translate(0, 0, LASER_TIP_Z + LASER_CONE.height * 1.5);
    const beam = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, LASER_TIP_Z),
      new THREE.Vector3(0, 0, BOARD_TOP),
    ]);
    this.laserGroup.add(
      new THREE.Mesh(cone, this.laserMat),
      new THREE.Mesh(housing, this.laserMat),
      new THREE.Line(beam, this.beamMat),
    );
  }

  private placeLaser(tool: SceneState['tool']): void {
    this.laserGroup.visible = tool !== null;
    if (tool) this.laserGroup.position.set(tool.x, tool.y, 0);
  }

  // --- palette ----------------------------------------------------------

  /** Recolours every material and the clear colour. */
  private applyPalette(): void {
    const p = this.palette;
    if (!p) return;
    this.renderer.setClearColor(new THREE.Color(p.bg), 1);
    this.floorMat.color.set(p.floor);
    this.pegMat.color.set(p.peg);
    this.holeMat.color.set(p.floor).lerp(new THREE.Color(p.peg), HOLE_BLEND);
    this.boardMat.color.set(p.board);
    this.copperMat.color.set(p.copper);
    this.drillMat.color.set(p.bg);
    this.rimMat.color.set(p.rim);
    this.blankMat.color.set(p.blank);
    this.doneMat.color.set(p.done);
    this.remainingMat.color.set(p.copper);
    this.laserMat.color.set(p.laser);
    this.beamMat.color.set(p.laser);
  }

  // --- view -------------------------------------------------------------

  private hasSize(): boolean {
    return !this.disposed && this.width > 0 && this.height > 0;
  }

  private changeView(view: ViewState): void {
    if (this.disposed) return;
    this.view = view;
    if (!this.hasSize()) return;
    this.applyView();
    this.requestRender();
  }

  /**
   * Lens data for the current orientation: the distance that fits the whole
   * floor at zoom 1. It is measured about the floor centre, not the target, so
   * panning never changes the zoom.
   */
  private viewCamera(): ViewCamera {
    const floor = floorBounds();
    const points = [floor.minX, floor.maxX].flatMap((x) =>
      [floor.minY, floor.maxY].flatMap((y) => [-FLOOR_THICKNESS, 0].map((z) => ({ x, y, z }))),
    );
    const centre = defaultView(floor).target;
    const aspect = this.width / this.height;
    const { distance } = fitCamera({
      points,
      target: { ...centre, z: 0 },
      elevationDeg: this.view.elevationDeg,
      yawDeg: this.view.azimuthDeg,
      aspect,
      ...CAMERA,
    });
    return { fitDistance: distance, fovDeg: CAMERA.fovDeg, aspect };
  }

  /** Places the camera for the view state, brackets the scene with near/far, and aims at the target. */
  private applyView(): void {
    const floor = floorBounds();
    const camera = this.viewCamera();
    const { target } = this.view;
    const position = viewPosition(this.view, camera.fitDistance);
    const corners = [floor.minX, floor.maxX].flatMap((x) =>
      [floor.minY, floor.maxY].flatMap((y) =>
        [-FLOOR_THICKNESS, SCENE_TOP].map((z) => ({ x, y, z })),
      ),
    );
    const { near, far } = clipRange(this.view, camera, corners);

    this.camera.aspect = camera.aspect;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.lookAt(target.x, target.y, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** Machine-mm point under a canvas pixel on the horizontal plane at `z`. */
  private pick(canvasX: number, canvasY: number, z: number): { x: number; y: number } | null {
    if (this.width === 0 || this.height === 0) return null;
    const ndc = new THREE.Vector2((canvasX / this.width) * 2 - 1, -(canvasY / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    return rayPlaneZ(origin, direction, z);
  }

  // --- rendering --------------------------------------------------------

  /** Coalesces any number of changes in a frame into one draw. */
  private requestRender(): void {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderNow();
    });
  }

  private renderNow(): void {
    if (this.disposed || this.width === 0) return;
    this.renderer.render(this.scene, this.camera);
  }

  // --- helpers ----------------------------------------------------------

  /** Flat x,y pairs to x,y,z triples at a constant height. */
  private liftXY(xy: Float32Array, z: number): Float32Array {
    const out = new Float32Array((xy.length / 2) * 3);
    for (let i = 0; i < xy.length / 2; i++) {
      out[i * 3] = xy[i * 2];
      out[i * 3 + 1] = xy[i * 2 + 1];
      out[i * 3 + 2] = z;
    }
    return out;
  }

  /** Removes and frees the geometries under a group; shared materials are kept. */
  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose();
    }
  }
}
