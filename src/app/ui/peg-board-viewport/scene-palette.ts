import { ScenePalette } from './scene.types';

/** Custom property behind each palette entry. */
const PALETTE_TOKENS: Record<keyof ScenePalette, string> = {
  bg: '--scene-bg',
  floor: '--scene-floor',
  peg: '--scene-peg',
  board: '--scene-board',
  copper: '--scene-copper',
  laser: '--scene-laser',
  done: '--scene-done',
  rim: '--border-strong',
  blank: '--scene-blank',
};

/**
 * Reads the scene colours from the design tokens as resolved on `element`
 * (they follow `<html data-theme>`). Values are returned as the CSS colour
 * strings the stylesheet declares, trimmed; an unset token is an empty string.
 */
export function readPalette(element: Element): ScenePalette {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const read = (token: string) => style?.getPropertyValue(token).trim() ?? '';
  const palette = {} as ScenePalette;
  for (const key of Object.keys(PALETTE_TOKENS) as (keyof ScenePalette)[]) {
    palette[key] = read(PALETTE_TOKENS[key]);
  }
  return palette;
}
