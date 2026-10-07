// Düzenin saf analizi: kol kareleri, ergonomi, çarpışmalar. Sunum katmanını bilmez.
import type { Arm, Layout, OBB, Vec3 } from "./types";
import type { ArmFrame, MonitorFrame } from "./kinematics";
import { forward, monitorFrame } from "./kinematics";
import { itemBoundsHeight } from "./meta";
import { obbCorners, obbIntersects } from "./obb";
import { DEG, clamp, cross, dot, length, mul, normalize, rotY, sub, vec, yawDir } from "./vec";

export type Level = "ok" | "warn" | "bad";

export interface Ergo {
  distance: number;
  /** Göz → ekran merkezi dikey açı; − aşağı bakış. */
  vAngle: number;
  /** + sağa. */
  hAngle: number;
  /** Bakış doğrultusu ile ekran normali arası. */
  offAxis: number;
  topAboveEye: number;
  bottomAboveDesk: number;
  topAboveDesk: number;
  levels: { distance: Level; vAngle: Level; offAxis: Level };
}

export interface ArmAnalysis {
  arm: Arm;
  frame: ArmFrame;
  monitor: MonitorFrame | null;
  ergo: Ergo | null;
  /** Kol ve monitörün duvara en yakın noktasının boşluğu (− = duvarın içinde). */
  wallClearance: number;
  segments: OBB[];
}

export interface Hit {
  a: string;
  b: string;
  arms: string[];
  items: string[];
}

export interface Analysis {
  arms: Map<string, ArmAnalysis>;
  collisions: Hit[];
  collidingArms: Set<string>;
  collidingItems: Set<string>;
}

export const wallZ = (layout: Layout): number => -layout.desk.depth / 2 - layout.desk.wallGap;

const band = (v: number, ok: [number, number], warn: [number, number]): Level =>
  v >= ok[0] && v <= ok[1] ? "ok" : v >= warn[0] && v <= warn[1] ? "warn" : "bad";

export function ergonomics(f: ArmFrame, mf: MonitorFrame, eye: Vec3): Ergo {
  const to = sub(mf.screen, eye);
  const distance = length(to);
  const vAngle = Math.atan2(to.y, Math.hypot(to.x, to.z)) / DEG;
  const hAngle = Math.atan2(to.x, -to.z) / DEG;
  const offAxis = Math.acos(clamp(dot(f.normal, normalize(mul(to, -1))), -1, 1)) / DEG;
  const outer = obbCorners(mf.boxes[0]).map((p) => p.y);
  const topScreen = Math.max(...mf.corners.map((p) => p.y));
  return {
    distance,
    vAngle,
    hAngle,
    offAxis,
    topAboveEye: topScreen - eye.y,
    bottomAboveDesk: Math.min(...outer),
    topAboveDesk: Math.max(...outer),
    levels: {
      // Genel ofis ergonomisi önerileri: 50–100 cm mesafe, merkez göz hizasının biraz altında.
      distance: band(distance, [500, 1000], [400, 1200]),
      vAngle: band(vAngle, [-35, 5], [-45, 15]),
      offAxis: band(offAxis, [0, 15], [0, 30]),
    },
  };
}

function segmentBox(a: Vec3, b: Vec3, side: Vec3, halfW: number, halfH: number, pad: number): OBB | null {
  const along = sub(b, a);
  const len = length(along);
  if (len < 1) return null;
  const u0 = mul(along, 1 / len);
  const u2 = normalize(side);
  const u1 = cross(u2, u0);
  return { c: mul(vecSum(a, b), 0.5), u: [u0, u1, u2], e: [len / 2 + pad, halfH, halfW] };
}
const vecSum = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);

/** Kolon, alt kol, ön kol ve başlık için kaba kutular. */
export function armSegments(arm: Arm, f: ArmFrame): OBB[] {
  const out: OBB[] = [];
  const h = arm.geometry.columnHeight;
  out.push({ c: vec(f.base.x, h / 2, f.base.z), u: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)], e: [26, h / 2, 26] });
  const lowerSide = yawDir(f.lowerYaw + 90);
  const lower = segmentBox(vec(f.shoulder.x, h - 15, f.shoulder.z), vec(f.elbow.x, h - 15, f.elbow.z), lowerSide, 23, 15, 23);
  if (lower) out.push(lower);
  const fore = segmentBox(f.liftPivot, f.wrist, yawDir(f.upperYaw + 90), 24, 22, 20);
  if (fore) out.push(fore);
  const head = segmentBox(f.wrist, f.plate, yawDir(f.facingYaw + 90), 16, 15, 14);
  if (head) out.push(head);
  return out;
}

function itemBox(it: Layout["items"][number]): OBB {
  const hh = itemBoundsHeight(it.kind, it.h, it.d) / 2;
  const a = it.rotY * DEG;
  return {
    c: vec(it.x, it.elevation + hh, it.z),
    u: [rotY(vec(1, 0, 0), a), vec(0, 1, 0), rotY(vec(0, 0, 1), a)],
    e: [it.w / 2, hh, it.d / 2],
  };
}

const minZ = (boxes: OBB[]): number => Math.min(...boxes.flatMap((b) => obbCorners(b).map((p) => p.z)));
const anyHit = (as: OBB[], bs: OBB[]): boolean => as.some((a) => bs.some((b) => obbIntersects(a, b)));

export function analyze(layout: Layout): Analysis {
  const wz = wallZ(layout);
  const arms = new Map<string, ArmAnalysis>();
  for (const arm of layout.arms) {
    const frame = forward(arm);
    const monitor = arm.monitor ? monitorFrame(arm.monitor, frame) : null;
    const segments = armSegments(arm, frame);
    const all = monitor ? [...segments, ...monitor.boxes] : segments;
    arms.set(arm.id, {
      arm,
      frame,
      monitor,
      ergo: monitor ? ergonomics(frame, monitor, layout.viewer) : null,
      wallClearance: minZ(all) - wz,
      segments,
    });
  }

  const hits: Hit[] = [];
  const d = layout.desk;
  const deskBox: OBB = {
    c: vec(0, -d.thickness / 2, 0),
    u: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)],
    e: [d.width / 2, d.thickness / 2, d.depth / 2],
  };
  const items = layout.items.filter((i) => i.visible && i.kind !== "deskMat").map((i) => ({ i, box: itemBox(i) }));
  const list = [...arms.values()];
  const mon = (a: ArmAnalysis): string => a.arm.monitor?.label || a.arm.name;
  const kol = (a: ArmAnalysis): string => `${a.arm.name} kolu`;

  for (const a of list) {
    if (a.monitor) {
      if (anyHit(a.monitor.boxes, [deskBox])) hits.push({ a: mon(a), b: "masa", arms: [a.arm.id], items: [] });
      if (minZ(a.monitor.boxes) < wz) hits.push({ a: mon(a), b: "duvar", arms: [a.arm.id], items: [] });
      for (const { i, box } of items)
        if (anyHit(a.monitor.boxes, [box])) hits.push({ a: mon(a), b: i.name, arms: [a.arm.id], items: [i.id] });
      // Kendi kolonu ve alt kolu (ön kol ve başlık monitöre zaten bağlı).
      if (anyHit(a.monitor.boxes, a.segments.slice(0, 2)))
        hits.push({ a: mon(a), b: `kendi kolonu`, arms: [a.arm.id], items: [] });
    }
    if (minZ(a.segments) < wz) hits.push({ a: kol(a), b: "duvar", arms: [a.arm.id], items: [] });
    if (anyHit(a.segments.slice(2), [deskBox])) hits.push({ a: kol(a), b: "masa", arms: [a.arm.id], items: [] });
    for (const { i, box } of items)
      if (anyHit(a.segments, [box])) hits.push({ a: kol(a), b: i.name, arms: [a.arm.id], items: [i.id] });
  }
  for (let x = 0; x < list.length; x++)
    for (let y = x + 1; y < list.length; y++) {
      const a = list[x];
      const b = list[y];
      const ids = [a.arm.id, b.arm.id];
      if (a.monitor && b.monitor && anyHit(a.monitor.boxes, b.monitor.boxes))
        hits.push({ a: mon(a), b: mon(b), arms: ids, items: [] });
      if (a.monitor && anyHit(a.monitor.boxes, b.segments)) hits.push({ a: mon(a), b: kol(b), arms: ids, items: [] });
      if (b.monitor && anyHit(b.monitor.boxes, a.segments)) hits.push({ a: mon(b), b: kol(a), arms: ids, items: [] });
      if (anyHit(a.segments, b.segments)) hits.push({ a: kol(a), b: kol(b), arms: ids, items: [] });
    }

  return {
    arms,
    collisions: hits,
    collidingArms: new Set(hits.flatMap((h) => h.arms)),
    collidingItems: new Set(hits.flatMap((h) => h.items)),
  };
}
