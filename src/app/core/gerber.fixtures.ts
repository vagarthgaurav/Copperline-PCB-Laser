import { ParsedLayer, ParsedProject } from './gerber.types';

const bounds = { minX: 0, minY: 0, maxX: 80, maxY: 55 };

export function layer(overrides: Partial<ParsedLayer> & Pick<ParsedLayer, 'id' | 'kind' | 'label'>): ParsedLayer {
  return { fileName: overrides.id, bounds, primitiveCount: 0, warnings: [], primitives: [], ...overrides };
}

/** A small parsed project for specs: four layers, one skipped file, an 80 x 55 mm outline board. */
export function parsedProject(overrides: Partial<ParsedProject> = {}): ParsedProject {
  return {
    name: 'board_v3',
    layers: [
      layer({ id: 'board_v3-F_Cu.gbr', kind: 'topCopper', label: 'Top copper' }),
      layer({ id: 'board_v3-B_Cu.gbr', kind: 'bottomCopper', label: 'Bottom copper' }),
      layer({ id: 'board_v3-Edge_Cuts.gbr', kind: 'outline', label: 'Outline' }),
      layer({ id: 'board_v3.drl', kind: 'drill', label: 'Drill' }),
    ],
    skipped: [{ fileName: 'board_v3-F_Mask.gbr', reason: 'Solder mask is not used for engraving' }],
    board: { bounds, source: 'outline', width: 80, height: 55 },
    blank: null,
    pegHoles: [],
    ...overrides,
  };
}
