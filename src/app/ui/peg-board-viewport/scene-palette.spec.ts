import { readPalette } from './scene-palette';

describe('readPalette', () => {
  it('reads every scene token as a trimmed string', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const tokens: Record<string, string> = {
      '--scene-bg': ' #14110e ',
      '--scene-floor': 'rgb(1, 2, 3)',
      '--scene-peg': 'red',
      '--scene-board': 'green',
      '--scene-copper': 'orange',
      '--scene-laser': 'tomato',
      '--scene-done': 'wheat',
      '--border-strong': 'gray',
      '--ink': 'black',
    };
    for (const [name, value] of Object.entries(tokens)) {
      el.style.setProperty(name, value);
    }
    expect(readPalette(el)).toEqual({
      bg: '#14110e',
      floor: 'rgb(1, 2, 3)',
      peg: 'red',
      board: 'green',
      copper: 'orange',
      laser: 'tomato',
      done: 'wheat',
      rim: 'gray',
      ink: 'black',
    });
    el.remove();
  });

  it('returns empty strings for tokens that are not defined', () => {
    const el = document.createElement('div');
    document.body.append(el);
    expect(readPalette(el).bg).toBe('');
    el.remove();
  });
});
