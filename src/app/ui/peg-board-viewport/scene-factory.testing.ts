import { Provider } from '@angular/core';
import { PEG_BOARD_SCENE_FACTORY } from './scene-factory';

/** Spec provider: the scene cannot be created, as without WebGL (jsdom). */
export const NO_WEBGL: Provider = {
  provide: PEG_BOARD_SCENE_FACTORY,
  useValue: () => {
    throw new Error('WebGL is not available in specs');
  },
};
