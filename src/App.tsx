import React from "react";
import { Routes, Route } from "react-router-dom";
import { ReconnectionBanner } from "./components/ReconnectionBanner";
import { HomePage } from "./pages/HomePage";
import { OnlineLobbyPage } from "./pages/OnlineLobbyPage";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { PassAndPlayPage } from "./pages/PassAndPlayPage";
import { RoomPage } from "./pages/RoomPage";

export default function App() {
  return (
    <>
      <ReconnectionBanner />
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
      </Routes>
    </>
  );
}
