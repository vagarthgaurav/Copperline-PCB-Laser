import { isGerberFile, parentWithin } from './usb.service';

describe('isGerberFile', () => {
  it('accepts Gerber, drill and zip files in any case', () => {
    for (const name of ['board.gbr', 'BOARD.GTL', 'a.b.GKO', 'holes.drl', 'export.zip', 'notes.txt']) {
      expect(isGerberFile(name)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const name of ['photo.jpg', 'gbr', '.gbr', 'readme.md', 'noext']) {
      expect(isGerberFile(name)).toBe(false);
    }
  });
});

describe('parentWithin', () => {
  it('goes up one folder and stops at the drive root', () => {
    expect(parentWithin('/media/pi/STICK', '/media/pi/STICK/jobs/a')).toBe('/media/pi/STICK/jobs');
    expect(parentWithin('/media/pi/STICK', '/media/pi/STICK/jobs')).toBe('/media/pi/STICK');
    expect(parentWithin('/media/pi/STICK', '/media/pi/STICK')).toBeNull();
  });

  it('never leaves the drive', () => {
    expect(parentWithin('/media/pi/STICK', '/media/pi')).toBeNull();
    expect(parentWithin('/media/pi/STICK', '/elsewhere')).toBeNull();
  });
});
