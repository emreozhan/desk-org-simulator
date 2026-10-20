# Desk Organizer Simulator

A Three.js simulator for planning a desk setup with North Bayou F80 gas-spring monitor arms. Drag a monitor to where you want it and the simulator solves the arm's joint angles (shoulder, elbow, lift, head swivel, tilt, rotation) with inverse kinematics. It shows unreachable positions, collisions (wall, desk, other monitors, arms, desk items) and ergonomics from the seated eye point as you move things.

**Live demo:** https://emreozhan.github.io/desk-org-simulator/

The interface is in Turkish.

## Features

- F80 two-stage arm model with editable segment lengths and joint limits
- Drag-to-place monitors with inverse kinematics, plus numeric VESA target input
- Per-joint sliders, degree inputs and limit dials; keyboard shortcuts bound to each slider
- Joint angle arcs, reach envelope and VESA height range drawn in the scene
- Collision checks between monitors, arms, wall, desk and desk items
- Ergonomics readout per monitor: viewing distance, vertical gaze angle, off-axis angle
- Movable desk items (keyboard, mouse, laptop, PC case, router, speaker, tablet, desk mat …)
- Camera presets including a seated eye view
- Undo/redo, auto-save in the browser, named layouts, JSON import/export
- A shortcut poster on the wall behind the desk

## Requirements

- Node.js 22 (tested with 22.20) and npm 10
- A WebGL-capable browser

The UI uses the Windows system fonts Bahnschrift and Cascadia Mono and falls back to system fonts elsewhere. No external fonts or CDNs are loaded.

## Getting Started

```bash
git clone https://github.com/emreozhan/desk-org-simulator.git
cd desk-org-simulator
npm install
npm run dev
```

Then open http://127.0.0.1:5197.

## Development

```bash
npm run check     # tsc + eslint + vitest + vite build
npm run test      # unit tests only
npm run build     # production build into dist/
npm run preview   # serve the production build on http://127.0.0.1:4197
```

Every push to `master` runs type checks, lint and tests, then builds and deploys the site to GitHub Pages ([.github/workflows/pages.yml](.github/workflows/pages.yml)).

## Controls

| Input | Action |
| --- | --- |
| Drag a monitor | Move it left/right and up/down relative to the camera; joint angles are solved automatically |
| Shift + drag | Move the monitor forward/back |
| Drag an arm base | Move the clamp on the desk |
| Drag an item | Move it on the desk; items standing on it (router on the PC case) move along |
| Arrow keys, PageUp/PageDown | Move the selection 10 mm: VESA X/Z/Y for monitors, X/Z/base height for items |
| A / D | Shoulder rotation −/+ 5° |
| C / V | Elbow rotation −/+ 5° |
| S / W | Lift −/+ 5° |
| Q / E | Head swivel −/+ 5° on monitors; item rotation −/+ 15° |
| Z / X | Tilt −/+ 5° |
| R | Monitor landscape ↔ portrait; item +90° (Shift: −90°) |
| 0 | Monitor faces straight ahead with tilt and rotation 0; item rotation 0 |
| Shift + key | Fine step: 1° / 1 mm |
| 1–5 | Camera: perspective, front, top, side, eye |
| F | Focus the selection |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Esc | Clear the selection |
| Left / right mouse, wheel | Orbit / pan / zoom |

Each joint slider shows its shortcut keys at both ends: the left key decreases the value, the right key increases it. When you press a shortcut, the affected row and key cap light up. Shortcuts are defined once in [src/app/shortcuts.ts](src/app/shortcuts.ts) and drive the key handler, the panel list and the wall poster.

## Model

Units are millimetres and degrees. The origin is the centre of the desk top; +X is right, +Y is up, +Z points toward the user.

Arm chain: clamp → column → shoulder (horizontal) → lower arm → elbow (horizontal) → gas-spring forearm (lift angle; the parallelogram keeps the head level) → head swivel → tilt → rotation → VESA plate. The kinematics live in plain TypeScript in [src/model/kinematics.ts](src/model/kinematics.ts); the 3D hierarchy builds the same chain.

Default dimensions and limits (edit them in the panel under "Kol ölçüleri ve eklem sınırları" to match your arm):

| Value | Default | Source |
| --- | --- | --- |
| Lower arm / forearm / head | 225 / 255 / 55 mm | ~530 mm total reach (retailer listing) |
| Lift | −25° … +40° | derived from the ~260 mm height range |
| Head swivel | ±90° | manufacturer |
| Tilt | −30° … +85° | manufacturer |
| Rotation | ±180° | manufacturer (360°) |
| Load | 2–9 kg | manufacturer |

The starting layout reproduces a real desk: a 160 × 80 cm desk, two 27" monitors and two F80 arms. The upper monitor sits higher than a standard F80 column allows, so its column is assumed to be 500 mm; change "Montaj → Kolon" to match your mount.

Ergonomics thresholds follow general office guidance: 50–100 cm viewing distance, screen centre between 5° above and 35° below eye level, off-axis angle under 15°.

## Project Structure

- `src/model/` – pure kinematics, collision and ergonomics analysis, defaults, storage (unit-tested)
- `src/scene/` – Three.js world, arm/item/desk views, overlays, pointer and keyboard interaction
- `src/ui/` – side panel and on-screen HUD
- `src/app/` – state store with undo/redo, shortcut table

## Saving

The layout is saved to the browser automatically on every change. The "Düzen" tab stores named layouts and imports/exports JSON.
