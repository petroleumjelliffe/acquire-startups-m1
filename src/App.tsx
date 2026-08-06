import React from "react";
import { Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { OnlineLobbyPage } from "./pages/OnlineLobbyPage";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { PassAndPlayPage } from "./pages/PassAndPlayPage";
import { RoomPage } from "./pages/RoomPage";

// Lazy on purpose: both pull in the golden games and replay them, and none of
// that belongs in the main chunk. `npm run check:bundle` is the guard.
const CatalogPage = React.lazy(() => import("./game/catalog/CatalogPage"));
const ScenarioPage = React.lazy(() => import("./game/catalog/ScenarioPage"));

export default function App() {
  return (
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

      {/* Any golden-game state, playable from that point. The catalog shows
          what a component looks like; this shows whether the game works from
          here — a merger is two clicks away instead of several minutes of
          play. */}
      <Route
        path="/scenarios"
        element={
          <React.Suspense fallback={null}>
            <ScenarioPage />
          </React.Suspense>
        }
      />
    </Routes>
  );
}
