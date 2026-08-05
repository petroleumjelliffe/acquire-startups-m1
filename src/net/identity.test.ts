import { describe, it, expect, beforeEach } from 'vitest';
import { loadIdentity, saveIdentity, rememberName, rememberedName } from './identity';

beforeEach(() => { localStorage.clear(); });

describe('a seat survives a refresh', () => {
  it('round-trips what a rejoin has to present', () => {
    saveIdentity('ABC123', { playerId: 'p2', token: 'tok', name: 'Sam' });
    expect(loadIdentity('ABC123')).toEqual({ playerId: 'p2', token: 'tok', name: 'Sam' });
  });

  it('keeps rooms apart', () => {
    saveIdentity('ABC123', { playerId: 'p2', token: 'tok', name: 'Sam' });
    expect(loadIdentity('XYZ789')).toBeNull();
  });

  it('survives a corrupted entry rather than throwing at startup', () => {
    localStorage.setItem('acquire.room.ABC123', 'not json');
    expect(loadIdentity('ABC123')).toBeNull();
  });

  it('ignores an entry missing the fields a rejoin needs', () => {
    localStorage.setItem('acquire.room.ABC123', JSON.stringify({ playerId: 'p2' }));
    expect(loadIdentity('ABC123')).toBeNull();
  });

  it('remembers a display name across rooms', () => {
    rememberName('Sam');
    expect(rememberedName()).toBe('Sam');
  });
});
