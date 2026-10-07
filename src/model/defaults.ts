// Fotoğraftaki masa: 160×80 cm, iki adet 27" monitör, iki North Bayou F80 kol.
import type { Arm, ArmGeometry, ArmPose, DeskItem, ItemKind, JointLimits, Layout, MonitorSpec, Vec3 } from "./types";
import { solveIK } from "./kinematics";
import { ITEM_META } from "./meta";

/** F80 ölçüleri: ~530 mm uzanım, ~260 mm yükseklik aralığı. Ürün kutusundaki değerle düzeltilebilir. */
export const F80_GEOMETRY: ArmGeometry = {
  columnHeight: 140,
  lowerLength: 225,
  upperLength: 255,
  elbowRise: 30,
  headLength: 55,
  headDrop: 0,
};

/** Üretici: eğim −30°/+85°, baş dönüşü ±90°, döndürme 360°. Kaldırma, 260 mm aralıktan türetildi. */
export const F80_LIMITS: JointLimits = {
  shoulder: [-180, 180],
  elbow: [-175, 175],
  lift: [-25, 40],
  swivel: [-90, 90],
  tilt: [-30, 85],
  roll: [-180, 180],
};

export const ZERO_POSE: ArmPose = { shoulder: 0, elbow: 0, lift: 0, swivel: 0, tilt: 0, roll: 0 };

export const newId = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export function monitor27(label: string, screen: MonitorSpec["screen"]): MonitorSpec {
  return {
    label,
    diagonalIn: 27,
    aspectW: 16,
    aspectH: 9,
    bezelSide: 7,
    bezelTop: 7,
    bezelBottom: 19,
    depth: 50,
    vesaOffsetY: 0,
    weightKg: 4.5,
    screen,
  };
}

const DEFAULT_WALL_Z = -440;

function placedArm(arm: Omit<Arm, "pose">, target: Vec3, facing = 0): Arm {
  const a: Arm = { ...arm, pose: { ...ZERO_POSE } };
  a.pose = solveIK(a, target, facing, { wallZ: DEFAULT_WALL_Z }).pose;
  return a;
}

function item(kind: ItemKind, x: number, z: number, extra: Partial<DeskItem> = {}): DeskItem {
  const m = ITEM_META[kind];
  return {
    id: newId(kind),
    kind,
    name: m.label,
    x,
    z,
    elevation: 0,
    rotY: 0,
    w: m.w,
    h: m.h,
    d: m.d,
    color: m.color,
    visible: true,
    ...extra,
  };
}

export function defaultLayout(): Layout {
  return {
    version: 1,
    desk: { width: 1600, depth: 800, height: 740, thickness: 25, wallGap: 40 },
    viewer: { x: 0, y: 470, z: 650 },
    arms: [
      placedArm(
        {
          id: "kol-alt",
          name: "Alt monitör",
          base: { x: -230, z: -355 },
          geometry: { ...F80_GEOMETRY },
          limits: structuredClone(F80_LIMITS),
          monitor: monitor27("Dell 27\"", "code"),
        },
        { x: 0, y: 285, z: -100 },
      ),
      placedArm(
        {
          id: "kol-ust",
          name: "Üst monitör",
          base: { x: 230, z: -355 },
          // Fotoğraftaki yükseklik için uzatma direği varsayıldı; gerçek değerle değiştir.
          geometry: { ...F80_GEOMETRY, columnHeight: 500 },
          limits: structuredClone(F80_LIMITS),
          monitor: { ...monitor27("Üst 27\"", "game"), bezelBottom: 20, bezelTop: 8, bezelSide: 8, depth: 55 },
        },
        { x: 0, y: 672, z: -130 },
      ),
    ],
    items: [
      item("deskMat", -20, 175, { elevation: 0 }),
      item("keyboard", 0, 45, { elevation: 3 }),
      item("mouse", 290, 30, { elevation: 3 }),
      item("laptop", -470, 190, { elevation: 3, rotY: 18, name: "MacBook" }),
      item("pcCase", 668, -168),
      item("router", 660, -200, { elevation: 466 }),
      item("speaker", 0, -258, { name: "Soundcore" }),
      item("charger", -520, -220),
      item("tablet", 440, -200),
      item("glass", 735, 320),
    ],
  };
}

export function newArm(layout: Layout): Arm {
  const used = layout.arms.map((a) => a.base.x);
  let x = 0;
  for (const c of [0, -450, 450, -650, 650]) if (used.every((u) => Math.abs(u - c) > 150)) { x = c; break; }
  const z = -layout.desk.depth / 2 + 45;
  return placedArm(
    {
      id: newId("kol"),
      name: `Kol ${layout.arms.length + 1}`,
      base: { x, z },
      geometry: { ...F80_GEOMETRY },
      limits: structuredClone(F80_LIMITS),
      monitor: monitor27("27\" monitör", "blank"),
    },
    { x, y: 280, z: z + 160 },
  );
}

export function newItem(kind: ItemKind): DeskItem {
  return item(kind, 0, 150);
}
