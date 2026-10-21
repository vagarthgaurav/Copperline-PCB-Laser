import * as THREE from 'three';
import { PEG_BOARD } from '../../core/peg-board';
import { PegBoardScene } from './peg-board-scene';
import { BoardGeometry, ScenePalette, SceneState } from './scene.types';

/** jsdom has no WebGL: a stub renderer, so the scene graph can be inspected. */
function fakeRenderer(): THREE.WebGLRenderer {
  return {
    outputColorSpace: '',
    setClearColor: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
}

const PALETTE: ScenePalette = {
  bg: '#14110e',
  floor: '#2a241e',
  peg: '#8d7e6c',
  board: '#3f6b4e',
  copper: '#f0b87e',
  laser: '#ff8a5c',
  done: '#f6e8d0',
  rim: '#7d6f60',
  blank: '#9a7d56',
};

/** The user's template: a 46 x 46 blank, a 38 x 38 cut outline and four peg holes in between. */
const PEG_HOLES = [
  { x: 125, y: -75, diameter: 2.2 },
  { x: 125, y: -115, diameter: 2.2 },
  { x: 165, y: -75, diameter: 2.2 },
  { x: 165, y: -115, diameter: 2.2 },
];

function board(overrides: Partial<BoardGeometry> = {}): BoardGeometry {
  return {
    bounds: { minX: 126, minY: -114, maxX: 164, maxY: -76 },
    copper: new Float32Array(),
    outline: [],
    holes: PEG_HOLES,
    blank: { minX: 122, minY: -118, maxX: 168, maxY: -72 },
    pegHoles: PEG_HOLES,
    ...overrides,
  };
}

function state(b: BoardGeometry | null, overrides: Partial<SceneState> = {}): SceneState {
  return {
    board: b,
    offsetX: 0,
    offsetY: 0,
    quarterTurns: 0,
    mirrored: false,
    path: [],
    doneLine: 0,
    tool: null,
    ...overrides,
  };
}

function setup() {
  const scene = new PegBoardScene(document.createElement('canvas'), fakeRenderer());
  scene.setPalette(PALETTE);
  const { boardGroup: group, camera } = scene as unknown as {
    boardGroup: THREE.Group;
    camera: THREE.PerspectiveCamera;
  };
  /** The peg meshes: instanced cylinders (the drill discs are instanced circles). */
  const pegs = () =>
    group.children.filter(
      (c): c is THREE.InstancedMesh =>
        c instanceof THREE.InstancedMesh && c.geometry.type === 'CylinderGeometry',
    );
  return { scene, group, camera, pegs };
}

/** Machine position of instance `i` of a mesh in the board group, after the group's placement. */
function worldOf(group: THREE.Group, mesh: THREE.InstancedMesh, i: number): THREE.Vector3 {
  const local = new THREE.Matrix4();
  mesh.getMatrixAt(i, local);
  return new THREE.Vector3().setFromMatrixPosition(local).applyMatrix4(group.matrix);
}

describe('PegBoardScene pegs', () => {
  it('has no pegs on the floor before a board is set', () => {
    const { scene } = setup();
    const floor = (scene as unknown as { floorGroup: THREE.Group }).floorGroup;
    const tall = floor.children.filter(
      (c) =>
        c instanceof THREE.Mesh &&
        !(c instanceof THREE.InstancedMesh) &&
        c.geometry.type === 'CylinderGeometry',
    );
    expect(tall).toHaveLength(0);
    expect(floor.children.some((c) => c instanceof THREE.Sprite)).toBe(false);
    scene.dispose();
  });

  it('stands a peg in each peg hole, from the floor to above the board', () => {
    const { scene, pegs, group } = setup();
    scene.setState(state(board()));
    const [mesh] = pegs();
    expect(mesh.count).toBe(4);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 4; i++) {
      mesh.getMatrixAt(i, m);
      const at = new THREE.Vector3().setFromMatrixPosition(m);
      expect([at.x, at.y]).toEqual([PEG_HOLES[i].x, PEG_HOLES[i].y]);
      expect(at.z - PEG_BOARD.pegHeight / 2).toBeCloseTo(0);
    }
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    expect(box.max.z - box.min.z).toBeCloseTo(PEG_BOARD.pegHeight);
    expect(box.max.x - box.min.x).toBeCloseTo(PEG_BOARD.pegDiameter);
    // Floor surface is z = 0 for the group; the board slab is shorter than the peg.
    expect(group.matrix.elements[14]).toBe(0);
    expect(PEG_BOARD.pegHeight).toBeGreaterThan(PEG_BOARD.boardThickness);
    scene.dispose();
  });

  it('draws no pegs without peg holes, and still draws the blank slab', () => {
    const { scene, pegs, group } = setup();
    scene.setState(state(board({ pegHoles: [] })));
    expect(pegs()).toHaveLength(0);
    expect(group.children.length).toBeGreaterThan(0);
    scene.dispose();
  });

  it('draws the blank as a slab only when there is a blank', () => {
    const { scene, group } = setup();
    scene.setState(state(board()));
    const withBlank = group.children.length;
    scene.setState(state(board({ blank: null, pegHoles: [] })));
    expect(group.children.length).toBeLessThan(withBlank);
    scene.dispose();
  });

  it('moves the pegs with the board, turned and mirrored', () => {
    const { scene, pegs, group } = setup();
    const b = board();
    scene.setState(state(b, { offsetX: 10, offsetY: 20, quarterTurns: 1 }));
    const [mesh] = pegs();
    const turned = PEG_HOLES.map((_, i) => worldOf(group, mesh, i));
    // Each peg lands on the same spot as the drill disc of its hole.
    const drills = group.children.find(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c !== mesh,
    )!;
    turned.forEach((p, i) => {
      const d = worldOf(group, drills, i);
      expect([p.x, p.y]).toEqual([d.x, d.y]);
    });
    // Quarter turn clockwise: the pegs form the same 40 x 40 square, now placed at the offset.
    const xs = turned.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(40);

    scene.setState(state(b, { offsetX: 10, offsetY: 20, mirrored: true }));
    const [again] = pegs();
    const mirrored = PEG_HOLES.map((_, i) => worldOf(group, again, i));
    // Mirroring swaps left and right, so peg 0 (left) ends up where peg 2 (right) was unmirrored.
    scene.setState(state(b, { offsetX: 10, offsetY: 20 }));
    const flat = PEG_HOLES.map((_, i) => worldOf(group, pegs()[0], i));
    expect(mirrored[0].x).toBeCloseTo(flat[2].x);
    expect(mirrored[0].y).toBeCloseTo(flat[2].y);
    expect(mirrored[1].x).toBeCloseTo(flat[3].x);
    scene.dispose();
  });

  it('treats the blank margin as the board for hit tests, pegs or not', () => {
    const { scene, group, camera } = setup();
    scene.resize(800, 600, 1);
    scene.setState(state(board(), { offsetX: 60, offsetY: 40 }));
    camera.updateMatrixWorld();
    /** Canvas pixel of a board-space point resting on the board top. */
    const pixel = (x: number, y: number) => {
      const p = new THREE.Vector3(x, y, PEG_BOARD.boardThickness)
        .applyMatrix4(group.matrix)
        .project(camera);
      return { x: ((p.x + 1) / 2) * 800, y: ((1 - p.y) / 2) * 600 };
    };
    const inside = pixel(144, -95); // on the cut outline's bounds
    const margin = pixel(123, -95); // blank only, left of the cut line, near the peg holes
    const beyond = pixel(118, -95); // outside the blank
    expect(scene.hitBoard(inside.x, inside.y)).toBe(true);
    expect(scene.hitBoard(margin.x, margin.y)).toBe(true);
    expect(scene.hitBoard(beyond.x, beyond.y)).toBe(false);
    scene.dispose();
  });
});
