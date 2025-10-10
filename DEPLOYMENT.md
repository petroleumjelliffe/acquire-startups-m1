# Deployment Guide

## Quick Deploy (GitHub Pages + Render)

### 1. Deploy Frontend to GitHub Pages

The frontend is already configured for GitHub Pages:

```bash
npm run build
npm run deploy
```

Your game will be available at: `https://petroleumjelliffe.github.io/acquire-startups-m1`

### 2. Deploy Server to Render (Free)

**Step 1:** Push your code to GitHub if you haven't already:
```bash
git add .
git commit -m "Add multiplayer server"
git push origin liquidation-phase  # or your branch name
```

**Step 2:** Go to [render.com](https://render.com) and sign up with GitHub

**Step 3:** Click "New +" → "Web Service"

**Step 4:** Connect your GitHub repository `acquire-startups-m1`

**Step 5:** Configure the service:
- **Name:** `acquire-startups-server` (or any name you want)
- **Region:** Choose closest to your players
- **Branch:** `liquidation-phase` (or `main`)
- **Root Directory:** Leave blank
- **Environment:** `Node`
- **Build Command:** `npm install && npm run build:server`
- **Start Command:** `npm run start:server`
- **Instance Type:** `Free`

**Step 6:** Add Environment Variables (click "Advanced"):
- `NODE_ENV` = `production`
- `PORT` = `10000` (Render assigns this)

**Step 7:** Click "Create Web Service"

Render will give you a URL like: `https://acquire-startups-server.onrender.com`

**Step 8:** Update your client to use the production server URL:

Create a `.env.production` file:
```bash
VITE_SERVER_URL=https://acquire-startups-server.onrender.com
```

**Step 9:** Rebuild and redeploy frontend:
```bash
npm run build
npm run deploy
```

**Done!** Your game is now live at `https://petroleumjelliffe.github.io/acquire-startups-m1`

---

## Alternative: Deploy Everything on Render

If you want both frontend and backend on Render:

### Deploy Server (same as above)

### Deploy Frontend as Static Site

1. Go to Render dashboard → "New +" → "Static Site"
2. Connect your GitHub repo
3. Configure:
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`
4. Add Environment Variable:
   - `VITE_SERVER_URL` = `https://acquire-startups-server.onrender.com`
5. Click "Create Static Site"

---

## Alternative: Railway (Free tier)

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. "New Project" → "Deploy from GitHub repo"
4. Select your repo
5. Railway auto-detects Node.js and will run `npm start`
6. Add start script to package.json:
   ```json
   "start": "npm run build:server && npm run start:server"
   ```
7. Add environment variables in Railway dashboard:
   - `NODE_ENV=production`
8. Railway gives you a URL like: `https://acquire-startups-m1-production.up.railway.app`

---

## Alternative: Fly.io (Free tier)

1. Install Fly CLI: `brew install flyctl` (Mac) or see [fly.io/docs/hands-on/install-flyctl/](https://fly.io/docs/hands-on/install-flyctl/)
2. Sign up: `fly auth signup`
3. Create `fly.toml` in your project root (see below)
4. Deploy: `fly launch`
5. Your app will be at: `https://acquire-startups.fly.dev`

**fly.toml:**
```toml
app = "acquire-startups"

[build]
  [build.args]
    NODE_VERSION = "20"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[[services]]
  http_checks = []
  internal_port = 8080
  processes = ["app"]
  protocol = "tcp"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

---

## Testing Production Build Locally

Before deploying, test the production build:

```bash
# Build frontend
npm run build

# Build server
npm run build:server

# Start server
npm run start:server

# In another terminal, preview frontend
npm run preview
```

Visit `http://localhost:4173` to test.

---

## Important Notes

### CORS Configuration
The server currently allows all origins (`origin: "*"`). For production, you should restrict this:

In `server/index.ts`:
```typescript
const io = new Server(httpServer, {
  cors: {
    origin: "https://petroleumjelliffe.github.io", // Your GitHub Pages domain
    methods: ["GET", "POST"],
  },
});
```

### WebSocket Connection
Make sure your hosting provider supports WebSockets:
- ✅ Render: Supports WebSockets
- ✅ Railway: Supports WebSockets
- ✅ Fly.io: Supports WebSockets
- ⚠️ GitHub Pages: Static files only, can't host server

### Free Tier Limitations
- **Render Free:** Server sleeps after 15 mins of inactivity, takes ~30s to wake up
- **Railway Free:** 500 hours/month, $5 credit
- **Fly.io Free:** 3 shared-cpu VMs, 3GB persistent storage

### Persistent Storage
Your game state is stored in JSON files in `/data` directory. On free tiers:
- **Render:** Ephemeral filesystem (resets on deploy/restart)
- **Railway:** Add persistent volume in dashboard
- **Fly.io:** Add persistent volume: `fly volumes create data --size 1`

For production, consider using a database (PostgreSQL, MongoDB) instead of JSON files.

---

## Quick Start (Fastest Option)

**For testing/sharing with friends:**

1. Deploy server to Render (takes 5 minutes)
2. Update `.env.production` with server URL
3. Deploy frontend to GitHub Pages
4. Share the link!

**Server will sleep when not in use, but wakes up automatically when someone connects.**
