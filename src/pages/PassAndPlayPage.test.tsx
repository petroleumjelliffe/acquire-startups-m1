import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PassAndPlayPage } from './PassAndPlayPage';
import { PassAndPlayGamePage } from './PassAndPlayGamePage';
import { buildFixture } from '../../engine/golden/fixtures';
import { LOCAL_SAVE_VERSION, save, load } from '../game/local/localSave';

/**
 * Both routes, because the lobby's Start now navigates: the old single-page
 * flow tests kept passing only while the page held the game itself.
 */
function renderLobby() {
  return render(
    <MemoryRouter initialEntries={['/pass-and-play']}>
      <Routes>
        <Route path="/pass-and-play" element={<PassAndPlayPage />} />
        <Route path="/pass-and-play/game" element={<PassAndPlayGamePage />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { localStorage.clear(); });

describe('PassAndPlayPage', () => {
  it('opens on the new roster setup, not the comma-separated field', () => {
    renderLobby();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByPlaceholderText(/comma/i)).toBeNull();
  });

  it('starts a game and lands on the turn-order draw, not a modal', () => {
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.getByTestId('game-surface')).toBeInTheDocument();
    // The draw is a gate in front of the game: no curtain, because nobody's
    // hand is on screen yet for a curtain to protect.
    expect(screen.getByRole('button', { name: /draw for turn order/i })).toBeInTheDocument();
    expect(screen.queryByText(/pass to/i)).toBeNull();
  });

  it('reaches the first turn without wedging at the draw stage', () => {
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    fireEvent.click(screen.getByRole('button', { name: /draw for turn order/i }));

    // The draw always hands off, whoever won it: seat one pressed the button
    // for the table, so the winner's hand still has to be revealed to them.
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    expect(screen.getByText(/place a tile/i)).toBeInTheDocument();
  });

  it('saves the deal before the board mounts, so turn one survives a refresh', () => {
    renderLobby();
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    // Start-of-turn for the first turn is the deal itself; without this write
    // a refresh during turn one lands on a lobby with nothing to continue.
    const saved = load();
    expect(saved).not.toBeNull();
    expect(saved!.state.players).toHaveLength(2);
  });
});

describe('the lobby with a game in progress', () => {
  function seed() {
    save(buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['A1'] },
        { name: 'Sam', cash: 6000, hand: ['H8'] },
      ],
      bag: ['I11'],
    }));
  }

  it('offers the Continue card — fixed title, the players, and when', () => {
    seed();
    renderLobby();

    const card = screen.getByTestId('continue-card');
    // The literal string, by ruling: nothing is stored and no screen collects
    // a name.
    expect(card).toHaveTextContent('Game in progress');
    expect(card).toHaveTextContent(/Alex/);
    expect(card).toHaveTextContent(/Sam/);
    expect(card).toHaveTextContent(/last played/i);
  });

  it('continues into the saved game, curtain first', () => {
    seed();
    renderLobby();

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(screen.getByText(/pass to alex/i)).toBeInTheDocument();
  });

  it('offers nothing to continue when nothing is saved', () => {
    renderLobby();
    expect(screen.queryByTestId('continue-card')).toBeNull();
  });

  /**
   * The mockup's two states, held apart: with a save, the card is New Game
   * above Continue and the roster is not on screen; without one, the roster
   * is the whole card and no New Game button exists — which is what makes
   * "confirm only when a game exists" structural rather than conditional.
   */
  it('shows New Game and Continue instead of the roster', () => {
    seed();
    renderLobby();

    expect(screen.getByRole('button', { name: /new game/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start game/i })).toBeNull();
    expect(screen.queryByText(/add a player/i)).toBeNull();
  });

  it('has no New Game button at all when there is nothing to discard', () => {
    renderLobby();

    expect(screen.queryByRole('button', { name: /new game/i })).toBeNull();
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
  });

  it('confirms before discarding, and cancel leaves everything standing', () => {
    seed();
    renderLobby();

    fireEvent.click(screen.getByRole('button', { name: /new game/i }));

    // Inline on the card, not a modal — and nothing destroyed yet.
    expect(screen.getByText(/discard the saved game\?/i)).toBeInTheDocument();
    expect(load()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText(/discard the saved game\?/i)).toBeNull();
    expect(screen.getByTestId('continue-card')).toBeInTheDocument();
    expect(load()).not.toBeNull();
  });

  it('discards on confirm and opens the roster for a fresh game', () => {
    seed();
    renderLobby();

    fireEvent.click(screen.getByRole('button', { name: /new game/i }));
    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));

    // The one sanctioned discard: the save is gone and setup is the card now.
    expect(load()).toBeNull();
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
    expect(screen.queryByTestId('continue-card')).toBeNull();
  });
});

describe('the lobby over a save it cannot use', () => {
  it('says so instead of pretending nothing was ever there', () => {
    seedStale();
    renderLobby();

    expect(screen.getByTestId('stale-save'))
      .toHaveTextContent(/older version can(’|')t be continued/i);
    expect(screen.queryByTestId('continue-card')).toBeNull();
    // Setup is still on offer — the notice is information, not a dead end.
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
  });

  it('keeps the bytes until a new game overwrites them', () => {
    seedStale();
    renderLobby();

    expect(localStorage.getItem('acquire.local.game')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    // Overwritten by the new deal — the one sanctioned way a stale save dies.
    expect(load()!.version).toBe(LOCAL_SAVE_VERSION);
  });

  function seedStale() {
    localStorage.setItem(
      'acquire.local.game',
      JSON.stringify({ version: LOCAL_SAVE_VERSION + 1, savedAt: 1, state: {} }),
    );
  }
});
