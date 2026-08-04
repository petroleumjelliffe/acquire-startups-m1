import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OnlineOnlyBanner } from './App';

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnlineOnlyBanner />
      <Routes>
        <Route path="*" element={<div>page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the reconnection banner', () => {
  it('stays off the offline routes, which have no server to be disconnected from', () => {
    for (const path of ['/', '/pass-and-play', '/catalog']) {
      const { unmount } = at(path);
      expect(screen.queryByText(/disconnected from server/i)).toBeNull();
      unmount();
    }
  });

  it('still reports connection state on the online routes', () => {
    at('/room/abc');
    expect(screen.getByText(/disconnected from server/i)).toBeInTheDocument();
  });
});
