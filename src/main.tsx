import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { registerServiceWorker } from "./pwa/register";
import "./styles/index.css";

registerServiceWorker();

// The router's basename comes from Vite's own BASE_URL, which the config
// builds from the one copy of the path in `basePath.ts` — this file used to
// hold a second hardcoded copy. BASE_URL carries a trailing slash
// ('/acquire-startups-m1/'); the router wants none.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={basename}>
    <App />
  </BrowserRouter>
);
