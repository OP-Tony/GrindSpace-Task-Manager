# GrindSpace Deployment Guide 🌐

To deploy GrindSpace online so judges and other users can access, test, and use the project via a live link, follow these step-by-step instructions.

We recommend using **Render** or **Railway**, as both platforms support GitHub integration, load environment variables securely, and allow **persistent volume mounts** to ensure your SQLite database (`vibespace.db`) does not wipe data on server restarts.

---

## Option 1: Deploying on Render (Recommended & Free Tier Friendly)

Render is the easiest platform to deploy a Node.js application with a persistent SQLite database.

### Step 1: Connect your GitHub Repo
1. Sign up/Log in at [Render](https://render.com/).
2. Click **New +** at the top right and select **Web Service**.
3. Connect your GitHub account and select your repository: `OP-Tony/GrindSpace-Task-Manager`.

### Step 2: Configure Web Service Settings
* **Name:** `grindspace` (or a name of your choice)
* **Region:** Choose the region closest to you (e.g., Oregon or Frankfurt).
* **Branch:** `main`
* **Runtime:** `Node` (Or `Docker` if you prefer containerized deployment)
* **Build Command:** `npm install`
* **Start Command:** `node server.js`
* **Instance Type:** `Free` (or Starter for persistent disks)

### Step 3: Add Environment Variables
Click on the **Advanced** section or the **Environment** tab, then add the following variables:
1. `PORT` = `3000`
2. `GEMINI_API_KEY` = `your_actual_gemini_api_key`
3. `NODE_ENV` = `production`

### Step 4: Configure Database Persistence (Crucial for SQLite)
If you deploy on Render's Free tier, the SQLite file will reset whenever the instance spins down. To persist user tasks and focus stats, you can upgrade to a **Starter Web Service** and mount a persistent disk:
1. Under **Disks**, click **Add Disk**.
2. **Name:** `sqlite-data`
3. **Mount Path:** `/usr/src/app/data` (or update your database connection path in code to point to `/var/data` and mount it there).
4. **Size:** `1 GB` (More than enough for thousands of SQLite rows).

*Note: For the free tier, if you do not mount a disk, the database will work perfectly during active sessions but will reset back to default seeded values when the server goes idle (Render spins down free servers after 15 minutes of inactivity).*

---

## Option 2: Deploying on Railway (Fastest Setup)

Railway is extremely fast and auto-detects your `Dockerfile` to launch the application.

### Step 1: Select the Repo
1. Log in at [Railway.app](https://railway.app/).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select `OP-Tony/GrindSpace-Task-Manager`.

### Step 2: Add Environment Variables
Before deploying, Railway will prompt you for variables:
1. Add `GEMINI_API_KEY` with your Google key.
2. Add `PORT` = `3000`.

### Step 3: Mount a Persistent Volume (SQLite)
1. Once the service is created, go to the **Settings** of your service.
2. Scroll to the **Volumes** section and click **Add Volume**.
3. **Mount Path:** Mount it to `/usr/src/app` (where `vibespace.db` is located) so the database file survives redeployments.
4. Redepoly the project.

### Step 4: Expose Public Domain
1. In the **Settings** tab of your Railway service, scroll to **Environment** -> **Domains**.
2. Click **Generate Domain**.
3. Railway will generate a public HTTPS URL (e.g., `https://grindspace-production.up.railway.app`).

---

## Option 3: Deploying on Fly.io (Command-Line Docker)

If you prefer deploying the exact Docker container you compiled locally:

1. Install the Fly CLI:
   ```bash
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```
2. Log in and launch:
   ```bash
   fly launch
   ```
3. Set your environment secret:
   ```bash
   fly secrets set GEMINI_API_KEY="your_key"
   ```
4. Create a volume for SQLite:
   ```bash
   fly volumes create grindspace_data --size 1
   ```
5. Deploy the application:
   ```bash
   fly deploy
   ```
6. Fly.io will host your container and output a live link (e.g., `https://grindspace.fly.dev`).
