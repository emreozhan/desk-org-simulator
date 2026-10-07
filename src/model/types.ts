// Birim: milimetre ve derece. Orijin masa üstünün merkezi; +X sağ, +Y yukarı, +Z kullanıcıya doğru.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Range = [min: number, max: number];

export const JOINTS = ["shoulder", "elbow", "lift", "swivel", "tilt", "roll"] as const;
export type JointName = (typeof JOINTS)[number];
export type ArmPose = Record<JointName, number>;
export type JointLimits = Record<JointName, Range>;

export interface ArmGeometry {
  /** Masa üstünden omuz eklemine (alt kolun üst yüzü). */
  columnHeight: number;
  /** Omuz ekseni → dirsek ekseni. */
  lowerLength: number;
  /** Gazlı ön kol: dirsek ekseni → bilek ekseni. */
  upperLength: number;
  /** Ön kolun alt kola göre yukarıda oturma payı. */
  elbowRise: number;
  /** Bilek ekseni → eğim eklemi (yatay). */
  headLength: number;
  /** Bilek → eğim eklemi düşüşü. */
  headDrop: number;
}

export type ScreenStyle = "code" | "game" | "blank";

export interface MonitorSpec {
  label: string;
  diagonalIn: number;
  aspectW: number;
  aspectH: number;
  bezelSide: number;
  bezelTop: number;
  bezelBottom: number;
  depth: number;
  /** VESA merkezinin gövde merkezine göre yüksekliği (+ = VESA merkezin üstünde). */
  vesaOffsetY: number;
  weightKg: number;
  screen: ScreenStyle;
}

export interface Arm {
  id: string;
  name: string;
  /** Kolonun masa üstündeki merkezi. */
  base: { x: number; z: number };
  geometry: ArmGeometry;
  limits: JointLimits;
  pose: ArmPose;
  monitor: MonitorSpec | null;
}

export const ITEM_KINDS = [
  "keyboard",
  "mouse",
  "laptop",
  "pcCase",
  "router",
  "speaker",
  "charger",
  "tablet",
  "glass",
  "deskMat",
  "box",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export interface DeskItem {
  id: string;
  kind: ItemKind;
  name: string;
  x: number;
  z: number;
  /** Tabanın masa üstünden yüksekliği (ör. kasa üstündeki modem). */
  elevation: number;
  rotY: number;
  w: number;
  h: number;
  d: number;
  color: string;
  visible: boolean;
}

export interface DeskSpec {
  width: number;
  depth: number;
  /** Yerden masa üstüne. */
  height: number;
  thickness: number;
  /** Masa arka kenarı ile duvar arası. */
  wallGap: number;
}

export interface Layout {
  version: 1;
  desk: DeskSpec;
  /** Oturan kullanıcının göz noktası (masa koordinatlarında). */
  viewer: Vec3;
  arms: Arm[];
  items: DeskItem[];
}

/** Yönlü sınır kutusu: merkez, birim eksenler, yarı uzunluklar. */
export interface OBB {
  c: Vec3;
  u: [Vec3, Vec3, Vec3];
  e: [number, number, number];
}
