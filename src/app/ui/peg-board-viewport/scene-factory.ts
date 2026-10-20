import { InjectionToken } from '@angular/core';
import { PegBoardScene } from './peg-board-scene';
import { PegBoardSceneApi } from './scene.types';

/** Creates the scene for a canvas; throws when WebGL is unavailable. */
export type SceneFactory = (canvas: HTMLCanvasElement) => PegBoardSceneApi;

/** Seam for specs: provide a fake factory so no WebGL is needed. */
export const PEG_BOARD_SCENE_FACTORY = new InjectionToken<SceneFactory>('PEG_BOARD_SCENE_FACTORY', {
  providedIn: 'root',
  factory: () => (canvas) => new PegBoardScene(canvas),
});
