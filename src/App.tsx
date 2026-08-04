import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { ReconnectionBanner } from "./components/ReconnectionBanner";
import { HomePage } from "./pages/HomePage";
import { OnlineLobbyPage } from "./pages/OnlineLobbyPage";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { PassAndPlayPage } from "./pages/PassAndPlayPage";
import { RoomPage } from "./pages/RoomPage";

// Lazy on purpose: the catalog pulls in the golden games and replays them, and
// none of that belongs in the main chunk. `npm run check:bundle` is the guard.
const CatalogPage = React.lazy(() => import("./game/catalog/CatalogPage"));

/** Routes that never talk to the server, so a connection state is meaningless. */
const OFFLINE_ROUTES = ["/", "/pass-and-play", "/catalog"];

/**
 * The reconnection banner, on the routes it actually means something.
 *
 * It used to render on every route. With no game server running it reported
 * "Disconnected from server" over pass-and-play and the catalog — a fixed bar
 * across the top of a game that has no server by design, overlapping the top
 * of the board and the step stack. Playing by hand is what made that obvious.
 */
export function OnlineOnlyBanner() {
  const { pathname } = useLocation();
  if (OFFLINE_ROUTES.includes(pathname)) return null;
  return <ReconnectionBanner />;
}

export default function App() {
  return (
    <>
      <OnlineOnlyBanner />
      <Routes>
        {/* Home - mode selection */}
        <Route path="/" element={<HomePage />} />

        {/* Online multiplayer flow */}
        <Route path="/online" element={<OnlineLobbyPage />} />
        <Route path="/online/create" element={<CreateRoomPage />} />
        <Route path="/online/join" element={<JoinRoomPage />} />

        {/* Pass and play */}
        <Route path="/pass-and-play" element={<PassAndPlayPage />} />

        {/* Room page - for both host and joining players */}
        <Route path="/room/:roomId" element={<RoomPage />} />

        {/* Component catalog - the Phase 1 acceptance surface */}
        <Route
          path="/catalog"
          element={
            <React.Suspense fallback={null}>
              <CatalogPage />
            </React.Suspense>
          }
        />
      </Routes>
    </>
  );
}
