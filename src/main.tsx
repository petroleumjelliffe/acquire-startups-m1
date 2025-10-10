import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";
import { SocketProvider } from "./context/SocketContext";

// Use base path for GitHub Pages in production
const basename = import.meta.env.PROD ? '/acquire-startups-m1' : '/';

ReactDOM.createRoot(document.getElementById("root")!).render(
//   <React.StrictMode>
    <BrowserRouter basename={basename}>
      <SocketProvider>
        <App />
      </SocketProvider>
    </BrowserRouter>
//   </React.StrictMode>
);
