# Workflow App (`workflow-app`)

A visual task board and screenshot dispatcher across workspace repositories, with in-browser vector annotations, loose JSON persistence, and a bidirectional AI agent resolution loop.

---

## ⚡ Ports

* **Frontend (`workflow-app`)**: Deterministic Port **`45330`** (Vite + Vue 3)
* **Backend (`workflow-app-server`)**: Deterministic Port **`60508`** (Node.js Express)

---

## 🎯 Key Features

1. **Direct Drag-and-Drop onto Project Cards**:
   - Drag screenshots directly from your desktop onto any project card.
   - Dropping images instantly opens the task creator preloaded with the target project and assets.

2. **Non-Destructive Vector Annotations**:
   - Original screenshot files are preserved 100% clean and uncompressed in `/data/<project>/assets/`.
   - All visual annotations (**Arrow**, **Rectangle**, **Brush**) are recorded as exact mathematical vector coordinates in the task JSON.
   - The UI renders responsive SVG overlays (`<svg :viewBox="...">`) directly on top of the image.

3. **Bidirectional AI Agent Resolution Loop**:
   - Every task contains an `"answer"` and `"done"` field.
   - When an AI agent (e.g. Antigravity) resolves a task in the target repository, it inspects the exact vector coordinates and clean screenshots, implements the code changes, runs tests, and updates the task JSON with a concise summary in `"answer"` and marks `"done": true`.
   - The UI automatically shows a green completion status and displays the AI answer card.

4. **Workspace Auto-Discovery**:
   - Scans the `/workspace` root directory for repositories and projects, enabling one-click project pinning to your deck.

---

## 📂 Data Structure

Tasks and assets are stored in human-readable, atomic files:

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
│   ├── package.json         # UI dependencies
│   ├── public/              # Static icons & favicons
│   └── src/                 # Frontend source
│       ├── App.vue
│       ├── main.js
│       ├── styles/main.css
│       ├── views/
│       ├── router/
│       └── components/
├── server/                  # Node.js Express Backend & Tests
│   ├── package.json
│   ├── src/index.js
│   ├── src/api.js
│   └── tests/api.test.mjs
├── scripts/                 # Standalone maintenance utilities
├── schemas/                 # JSON schema contracts
└── package.json             # Root unified scripts
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

## 🚀 Getting Started

### 1. Install Dependencies

Single install at root for both frontend and backend:

```bash
npm install
```

### 2. Run Tests

```bash
npm test
```

### 3. Development Mode (Managed by Vite)

Starts Vite on port **`45330`**, serving both the Vue frontend and the internal backend API directly:

```bash
npm run dev
```

The app is immediately accessible at:
- Local: `http://localhost:45330`
- Tunnel: `https://workflow-app.skyhook.7u.pl`

### 4. Production Build & Start

```bash
npm run build
npm start
```

