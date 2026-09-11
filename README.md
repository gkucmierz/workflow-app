# ⚡ workflow-app // Multi-Project Task Deck & Asset Runner

[![Gitea](https://img.shields.io/badge/Gitea-Repository-blue?logo=gitea)](https://gitea.7u.pl/gkucmierz/workflow-app)
[![GitHub](https://img.shields.io/badge/GitHub-Mirror-black?logo=github)](https://github.com/gkucmierz/workflow-app)
[![Web UI](https://img.shields.io/badge/Web%20UI-workflow.7u.pl-38bdf8)](https://workflow.7u.pl)
[![Port](https://img.shields.io/badge/Port-45330-10b981)](http://localhost:45330)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff?logo=vite)](https://vitejs.dev/)
[![Nano UI](https://img.shields.io/badge/Nano--UI-1.5-f59e0b)](https://gitea.7u.pl/gkucmierz/nano-ui)
[![Docker](https://img.shields.io/badge/Docker-Production%20Ready-2496ed?logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-performance visual task board, screenshot dispatcher, and asset maintenance center across workspace repositories. Features in-browser SVG vector annotations, atomic JSON persistence, and a bidirectional AI agent resolution loop.

* **Primary Repository (Gitea)**: [https://gitea.7u.pl/gkucmierz/workflow-app](https://gitea.7u.pl/gkucmierz/workflow-app)
* **Mirror (GitHub)**: [https://github.com/gkucmierz/workflow-app](https://github.com/gkucmierz/workflow-app)
* **Production Web UI**: [https://workflow.7u.pl](https://workflow.7u.pl)

---

## 🎯 Key Features

1. **Direct Drag-and-Drop onto Project Cards**:
   * Drag screenshots directly from your desktop onto any project card.
   * Dropping images instantly opens the task creator preloaded with the target project and uploaded assets.

2. **Non-Destructive Vector Annotations**:
   * Original screenshot files are preserved 100% clean and uncompressed in `/data/<project>/assets/`.
   * All visual annotations (**Arrow**, **Rectangle**, **Brush**) are recorded as exact mathematical vector coordinates in task JSON files.
   * The UI renders responsive SVG overlays (`<svg :viewBox="...">`) directly on top of the image canvas.

3. **Bidirectional AI Agent Resolution Loop**:
   * Every task contains `"answer"` and `"done"` fields.
   * When an AI agent (e.g. Antigravity) resolves a task in the target repository, it inspects the vector coordinates and clean screenshots, implements the code changes, runs tests, and updates the task JSON with a concise summary in `"answer"` and marks `"done": true`.
   * The UI automatically updates task status with a green badge and displays the AI answer card.

4. **Embedded Scripts & Maintenance Runner (`/scripts`)**:
   * Full-screen maintenance console with real-time terminal output.
   * Interactive multi-project selector (`ProjectMultiSelect.vue`) with Select/Deselect All options.
   * Built-in security confirmations powered by `@gkucmierz/nano-ui` with fluid `v-ripple` buttons.
   * Runs orphaned asset detection and byte-level deduplication across multiple projects concurrently.

5. **Workspace Auto-Discovery**:
   * Scans the `/workspace` root directory for repositories and projects, detecting ecosystem tags (`Node / JS`, `Rust`, `Python`, `Go`) and enabling one-click project pinning to your deck.

---

## 📂 Architecture & Data Structure

Following the monorepo tree standard (`server/` + `ui/src/`):

```
workflow-app/
├── data/                    # Local tasks & screenshots (gitignored)
│   ├── lol-inspector/
│   │   ├── tasks/
│   │   │   └── task_1789090000000_a8f1.json
│   │   └── assets/
│   │       └── 1789090000000_screen1.png
│   └── ...
├── ui/                      # Vue 3 Frontend (Port 45330)
│   ├── index.html           # Vite HTML entrypoint
│   ├── vite.config.js       # Vite configuration
│   ├── package.json         # UI dependencies (@gkucmierz/nano-ui, Vue 3)
│   ├── public/              # Favicon & vector assets
│   └── src/                 # Frontend source code
│       ├── App.vue
│       ├── main.js
│       ├── styles/main.css
│       ├── views/           # BoardView, ScriptsView, TaskEditorView
│       ├── router/          # Vue Router configuration
│       └── components/      # ProjectCard, TaskModal, ConfirmModal, etc.
├── server/                  # Node.js Express Backend & Tests
│   ├── package.json
│   ├── src/index.js         # Production static bundle & API server
│   ├── src/api.js           # Core workflow API & discovery engine
│   └── tests/api.test.mjs   # Automated API test suite
├── scripts/                 # Standalone maintenance utilities
│   ├── check-orphaned-assets.js
│   ├── dedupe-assets.js
│   └── sync-gitea-github-mirrors.mjs
├── schemas/                 # JSON schema contracts
├── Dockerfile               # Multi-stage production container build
├── docker-compose.yml       # Docker Compose V2 configuration
└── package.json             # Root orchestrator scripts
```

### Task JSON Schema

```json
{
  "id": "task_1789090000000_a8f1",
  "project": "lol-inspector",
  "timestamp": 1789090000000,
  "task": "Wykres zegara ma mieć płynniejszą animację i wyśrodkowany pill",
  "assets": [
    {
      "filename": "1789090000000_screen1.png",
      "annotations": [
        {
          "type": "arrow",
          "from": { "x": 150, "y": 300 },
          "to": { "x": 400, "y": 300 },
          "color": "#ef4444",
          "strokeWidth": 4
        },
        {
          "type": "rect",
          "x": 100,
          "y": 200,
          "width": 250,
          "height": 80,
          "color": "#38bdf8",
          "strokeWidth": 2
        }
      ]
    }
  ],
  "answer": "Zaimplementowano Catmull-Rom Bezier spline oraz ease-in-out w TimeSyncModal.vue.",
  "done": false
}
```

---

## 🚀 Getting Started (Local Development)

### 1. Install Dependencies

Install dependencies across both root, UI, and backend:

```bash
npm run install:all
```

### 2. Run Tests

```bash
npm test
```

### 3. Development Mode (Vite + API Middleware)

Starts Vite on port **`45330`**, serving both the Vue frontend and the internal backend API directly:

```bash
npm run dev
```

The app is immediately accessible at:
* Local: `http://localhost:45330`
* Tunnel: `https://workflow-app.skyhook.7u.pl`

---

## 🐳 Docker & Production Deployment

### 1. Production Architecture
* **Container**: `workflow-app` on port `80` (Node.js LTS runtime serving compiled `ui/dist` and Express API).
* **Reverse Proxy**: Routed via **Nginx Proxy Manager** (`workflow.7u.pl` ➔ `http://workflow-app:80`) on the external `npm_public` Docker bridge network.
* **Volume Isolation & Workspace Discovery**:
  * Persistent Task Data: `./data:/app/data` (read-write volume for all tasks, screenshots, and metadata).
  * Host Workspace: `${HOST_WORKSPACE_PATH:-..}:/workspace:ro` (read-only mount allowing the app to scan repositories while guaranteeing zero write access to sibling projects).

### 2. Local Docker Verification

```bash
docker compose build
docker compose up -d --remove-orphans
```

### 3. Gitea Actions CI/CD (`.gitea/workflows/build.yaml`)

Every push to `main` on Gitea triggers a seamless zero-downtime deployment on the self-hosted Polish runner (`self-hosted-pl`):

```yaml
name: Build & Deploy to Production

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: self-hosted-pl
    steps:
      - name: Check out repository code
        uses: actions/checkout@v4

      - name: Zero-Downtime Docker Build and Deploy
        run: |
          docker compose build
          docker compose up -d --remove-orphans
```

---

## 🧹 Maintenance & Asset Scripts

Run directly from terminal or trigger via the in-app `/scripts` view:

```bash
# Check orphaned assets across all projects (dry-run)
npm run check:orphans

# Safely prune unreferenced screenshots
npm run prune:orphans

# Find duplicate images using SHA-256 hash matching
npm run dedupe:dry

# Deduplicate asset files and update task references
npm run dedupe:assets
```
