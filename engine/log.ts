import type { Coord, GameState, LogEntry, LogToken, StartupId } from './gameTypes';

export const tok = {
  text:  (text: string): LogToken => ({ kind: 'text', text }),
  tile:  (coord: Coord): LogToken => ({ kind: 'tile', coord }),
  brand: (startupId: StartupId): LogToken => ({ kind: 'brand', startupId }),
  cash:  (amount: number, delta = false): LogToken => ({ kind: 'cash', amount, delta }),
  stack: (startupId: StartupId, count: number): LogToken => ({ kind: 'stack', startupId, count }),
};

export function pushLog(
  state: GameState,
  phase: string,
  detail: LogToken[],
  playerId?: string,
): LogEntry {
  const entry: LogEntry = { stepId: state.nextStepId, phase, detail };
  if (playerId !== undefined) entry.playerId = playerId;
  state.nextStepId += 1;
  state.log.push(entry);
  return entry;
}

function money(amount: number, delta?: boolean): string {
  const sign = delta ? (amount < 0 ? '-' : '+') : (amount < 0 ? '-' : '');
  return `${sign}$${Math.abs(amount).toLocaleString('en-US')}`;
}

export function renderLogText(entry: LogEntry): string {
  return entry.detail.map((t) => {
    switch (t.kind) {
      case 'text':  return t.text;
      case 'tile':  return t.coord;
      case 'brand': return t.startupId;
      case 'cash':  return money(t.amount, t.delta);
      case 'stack': return `${t.count}× ${t.startupId}`;
    }
  }).join('');
}
