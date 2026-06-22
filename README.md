# GrindSpace 🚀

An iOS-inspired premium focus companion featuring offline-resilient utilities, local multi-client SQLite storage, and secure integration with the Google Gemini API.

---

## Key Features

1. **Focus Arena (Timer)**
   * **Background Throttling Immunity:** Uses system epoch time delta calculations instead of basic `setInterval` counters, ensuring accuracy even when the browser tab is minimized or backgrounded.
   * **Web Audio API Chimes:** Employs real-time synthesizers to play a clear chime notification upon session completion—100% offline, with zero external audio assets required.
   * **Ambient Soundscapes:** Seamlessly streams rain, ocean waves, or white noise loops, complete with interactive UI equalizers and custom volume controls.
2. **AI Daily Planner**
   * **PII Guardrail:** Employs local regex filters to redact sensitive user data (emails, phone numbers, API keys) 100% on-device before sending prompts to the cloud.
   * **Structured Scheduling:** Utilizes the latest Gemini 2.5 Flash SDK structure schemas to construct a clean, parseable JSON timeline agenda directly from raw user schedules.
3. **AI Grind Coach**
   * A conversational time management coach, calibrated with custom behavioral instructions, designed to offer practical guidance on focus and goal execution.
4. **Local Multi-Client Persistence**
   * Employs SQLite database architecture with client isolation headers, allowing multiple local profiles to manage independent tasks, statistics, and preferences on a shared machine.

---

## Repository Architecture

```text
├── public/
│   ├── assets/sounds/       # Downloaded audio assets (Rain, Ocean, Noise)
│   ├── modules/             # Modular ES6 frontend controllers
│   │   ├── state.js         # API synchronization & state management
│   │   ├── utils.js         # Toasts, escaping, client identifiers
│   │   ├── timer.js         # Pomodoro state, Web Audio synthesizers
│   │   ├── tasks.js         # Tasks DOM interaction and CRUD logic
│   │   ├── planner.js       # Daily AI planner timelines
│   │   ├── coach.js         # Conversational Coach sidebar logs
│   │   ├── analytics.js     # Chart.js data population
│   │   └── ambient.js       # Canvas particles & lighting spotlight glows
│   ├── app.js               # Entry orchestrator & bootstrapper
│   ├── index.html           # Main dashboard layout
│   └── style.css            # Material 3 custom styles
├── server.js                # Express API backend, routes, local PII filters
├── database.js              # Parameterized SQLite query engine
├── package.json             # App scripts and dependencies
├── Dockerfile               # Production multi-stage Docker build config
├── .dockerignore            # Excludes logs, db, and node_modules from container
└── .gitignore               # Excludes secrets, node_modules, and databases from Git
```

---

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v20 or higher)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Optional, for container runtimes)

### 1. Local Node Execution
1. Clone this repository to your local directory.
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory and add your Google Gemini API key:
   ```env
   PORT=3000
   GEMINI_API_KEY=your_actual_gemini_key_here
   ```
4. Boot the server:
   * **Production Mode:** `npm start`
   * **Developer Watch Mode:** `npm run dev`
5. Open your browser and navigate to `http://localhost:3000`.

### 2. Docker Container Execution
You can either pull the pre-compiled image directly from Docker Hub or build the image locally.

#### Option A: Pull from Docker Hub (Recommended)
1. Pull the public image:
   ```bash
   docker pull tony19027/grindspace:latest
   ```
2. Start the container:
   ```bash
   docker run -d -p 3000:3000 --env-file .env --name grindspace-app tony19027/grindspace:latest
   ```

#### Option B: Build Locally
1. Build the Docker image:
   ```bash
   docker build -t grindspace .
   ```
2. Start the container:
   ```bash
   docker run -d -p 3000:3000 --env-file .env --name grindspace-app grindspace
   ```

3. Visit `http://localhost:3000` to interact with the containerized application.

---

## Production Security & Deployment Checklist
* [x] **Secure Secrets:** Key variables stored exclusively in `.env` and blacklisted from Git commits.
* [x] **Lightweight Builds:** Implemented multi-stage Docker files to compile dependencies in builder stages and minimize running node runtimes.
* [x] **Local Data Safety:** Scrub user data on local nodes before transit to the Gemini LLM.
