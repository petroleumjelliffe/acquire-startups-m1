import React from "react";
import { Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { OnlineLobbyPage } from "./pages/OnlineLobbyPage";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { PassAndPlayPage } from "./pages/PassAndPlayPage";
import { RoomPage } from "./pages/RoomPage";

// Lazy on purpose: the catalog pulls in the golden games and replays them, and
// none of that belongs in the main chunk. `npm run check:bundle` is the guard.
const CatalogPage = React.lazy(() => import("./game/catalog/CatalogPage"));

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
      </Routes>
    );
  }

