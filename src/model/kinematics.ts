// North Bayou F80 tipi iki kademeli gazlı kol:
// kelepçe → kolon → [omuz: yatay dönüş] alt kol → [dirsek: yatay dönüş] gazlı ön kol
// → [kaldırma: dikey açı, paralelkenar sayesinde baş yatay kalır] → [baş dönüşü] → [eğim] → [döndürme] → VESA.
import type { Arm, ArmPose, MonitorSpec, OBB, Vec3 } from "./types";
import { JOINTS } from "./types";
import { DEG, add, clamp, dist, mul, rotX, rotY, rotZ, vec, wrapDeg, yawDir } from "./vec";

/** Eğim ekseninden monitör arka yüzüne (VESA plakası + başlık). */
export const PLATE_OFFSET = 20;
/** Monitör gövdesinin ince ön paneli; kalan derinlik arka çıkıntıdır. */
export const SLAB_DEPTH = 18;

type ArmLike = Pick<Arm, "base" | "geometry" | "pose">;

export interface ArmFrame {
  base: Vec3;
  shoulder: Vec3;
  elbow: Vec3;
  liftPivot: Vec3;
  wrist: Vec3;
  /** Eğim eklemi = VESA plakasının döndüğü nokta. */
  plate: Vec3;
  lowerYaw: number;
  upperYaw: number;
  facingYaw: number;
  right: Vec3;
  up: Vec3;
  normal: Vec3;
}

/** Monitör yönü: R = Ry(yaw) · Rx(-eğim) · Rz(döndürme). Pozitif eğim ekranı yukarı baktırır. */
export function orient(p: Vec3, yawDeg: number, tiltDeg: number, rollDeg: number): Vec3 {
  return rotY(rotX(rotZ(p, rollDeg * DEG), -tiltDeg * DEG), yawDeg * DEG);
}

export function forward(arm: ArmLike): ArmFrame {
  const g = arm.geometry;
  const p = arm.pose;
  const base = vec(arm.base.x, 0, arm.base.z);
  const shoulder = vec(arm.base.x, g.columnHeight, arm.base.z);
  const lowerYaw = p.shoulder;
  const upperYaw = p.shoulder + p.elbow;
  const facingYaw = upperYaw + p.swivel;
  const elbow = add(shoulder, mul(yawDir(lowerYaw), g.lowerLength));
  const liftPivot = add(elbow, vec(0, g.elbowRise, 0));
  const l = p.lift * DEG;
  const wrist = add(
    liftPivot,
    add(mul(yawDir(upperYaw), g.upperLength * Math.cos(l)), vec(0, g.upperLength * Math.sin(l), 0)),
  );
  const plate = add(wrist, add(mul(yawDir(facingYaw), g.headLength), vec(0, -g.headDrop, 0)));
  return {
    base,
    shoulder,
    elbow,
    liftPivot,
    wrist,
    plate,
    lowerYaw,
    upperYaw,
    facingYaw,
    right: orient(vec(1, 0, 0), facingYaw, p.tilt, p.roll),
    up: orient(vec(0, 1, 0), facingYaw, p.tilt, p.roll),
    normal: orient(vec(0, 0, 1), facingYaw, p.tilt, p.roll),
  };
}

export interface MonitorDims {
  panelW: number;
  panelH: number;
  outerW: number;
  outerH: number;
  /** Panel merkezinin gövde merkezine göre dikey kayması. */
  screenOffsetY: number;
}

export function monitorDims(m: MonitorSpec): MonitorDims {
  const k = (m.diagonalIn * 25.4) / Math.hypot(m.aspectW, m.aspectH);
  const panelW = k * m.aspectW;
  const panelH = k * m.aspectH;
  return {
    panelW,
    panelH,
    outerW: panelW + 2 * m.bezelSide,
    outerH: panelH + m.bezelTop + m.bezelBottom,
    screenOffsetY: (m.bezelBottom - m.bezelTop) / 2,
  };
}

export interface MonitorFrame {
  dims: MonitorDims;
  body: Vec3;
  /** Panel yüzeyinin merkezi. */
  screen: Vec3;
  /** Panel köşeleri: sol üst, sağ üst, sağ alt, sol alt. */
  corners: [Vec3, Vec3, Vec3, Vec3];
  /** [ön panel, arka çıkıntı] */
  boxes: OBB[];
}

export function monitorFrame(spec: MonitorSpec, f: ArmFrame): MonitorFrame {
  const d = monitorDims(spec);
  const at = (o: Vec3, n: number, u: number, r = 0): Vec3 =>
    add(add(add(o, mul(f.normal, n)), mul(f.up, u)), mul(f.right, r));
  const slabD = Math.min(SLAB_DEPTH, spec.depth);
  const humpD = spec.depth - slabD;
  const screen = at(f.plate, PLATE_OFFSET + spec.depth + 0.6, -spec.vesaOffsetY + d.screenOffsetY);
  const hw = d.panelW / 2;
  const hh = d.panelH / 2;
  const axes: [Vec3, Vec3, Vec3] = [f.right, f.up, f.normal];
  const boxes: OBB[] = [
    {
      c: at(f.plate, PLATE_OFFSET + spec.depth - slabD / 2, -spec.vesaOffsetY),
      u: axes,
      e: [d.outerW / 2, d.outerH / 2, slabD / 2],
    },
  ];
  if (humpD > 1) {
    boxes.push({
      c: at(f.plate, PLATE_OFFSET + humpD / 2, -spec.vesaOffsetY),
      u: axes,
      e: [d.outerW * 0.31, d.outerH * 0.31, humpD / 2],
    });
  }
  return {
    dims: d,
    body: at(f.plate, PLATE_OFFSET + spec.depth / 2, -spec.vesaOffsetY),
    screen,
    corners: [at(screen, 0, hh, -hw), at(screen, 0, hh, hw), at(screen, 0, -hh, hw), at(screen, 0, -hh, -hw)],
    boxes,
  };
}

export function clampPose(arm: Pick<Arm, "limits">, pose: ArmPose): ArmPose {
  const out = { ...pose };
  for (const j of JOINTS) {
    const [lo, hi] = arm.limits[j];
    out[j] = clamp(wrapDeg(out[j]), lo, hi);
  }
  return out;
}

export interface IkResult {
  pose: ArmPose;
  /** VESA noktasının hedeften sapması (mm). */
  error: number;
  reachable: boolean;
  /** İstenen bakış yönü baş dönüş sınırı içinde kaldı mı. */
  facingKept: boolean;
}

export interface IkOptions {
  /** Dirseğin bu Z değerinin gerisine (duvara doğru) katlandığı dal cezalandırılır. */
  wallZ?: number;
}

function solveOnce(arm: Arm, target: Vec3, facing: number, opts: IkOptions): { pose: ArmPose; error: number } {
  const g = arm.geometry;
  const fd = yawDir(facing);
  const wx = target.x - g.headLength * fd.x;
  const wz = target.z - g.headLength * fd.z;
  const wy = target.y + g.headDrop;
  const pivotY = g.columnHeight + g.elbowRise;
  const lift = clamp(Math.asin(clamp((wy - pivotY) / g.upperLength, -1, 1)) / DEG, ...arm.limits.lift);
  const r2 = Math.max(1e-6, g.upperLength * Math.cos(lift * DEG));
  const l1 = g.lowerLength;
  const dx = wx - arm.base.x;
  const dz = wz - arm.base.z;
  const d = Math.hypot(dx, dz);
  const e0 = Math.acos(clamp((d * d - l1 * l1 - r2 * r2) / (2 * l1 * r2), -1, 1));
  let best: { pose: ArmPose; error: number; score: number } | null = null;
  for (const e of [e0, -e0]) {
    const a1 = Math.atan2(dx, dz) - Math.atan2(r2 * Math.sin(e), l1 + r2 * Math.cos(e));
    const shoulder = a1 / DEG;
    const elbow = e / DEG;
    const pose = clampPose(arm, { ...arm.pose, lift, shoulder, elbow, swivel: facing - shoulder - elbow });
    const fk = forward({ ...arm, pose });
    const error = dist(fk.plate, target);
    // Gerçek kurulumda dirsek monitörün arkasına katlanır; duvara girmeyen ve öne taşmayan dal seçilir.
    const wallPenalty =
      opts.wallZ === undefined
        ? 0
        : Math.max(0, opts.wallZ + 40 - fk.elbow.z) * 5 + Math.max(0, fk.elbow.z - (target.z - 30)) * 0.5;
    // Eşit çözümlerde mevcut duruşa yakın dalı seç (sürüklerken kol "zıplamasın").
    const jump =
      Math.abs(wrapDeg(pose.shoulder - arm.pose.shoulder)) + Math.abs(wrapDeg(pose.elbow - arm.pose.elbow));
    const score = error + jump * 0.02 + wallPenalty;
    if (!best || score < best.score) best = { pose, error, score };
  }
  return best!;
}

/**
 * VESA eğim eklemini `target` noktasına götüren eklem açıları.
 * `facingYaw` verilmezse ekranın mevcut yatay bakış yönü korunur.
 * Baş dönüşü sınıra takılırsa ulaşılabilen bakış yönü kabul edilip konum yeniden çözülür.
 */
export function solveIK(arm: Arm, target: Vec3, facingYaw?: number, opts: IkOptions = {}): IkResult {
  const wanted = facingYaw ?? forward(arm).facingYaw;
  let facing = wanted;
  let res = solveOnce(arm, target, facing, opts);
  for (let i = 0; i < 4; i++) {
    const achieved = res.pose.shoulder + res.pose.elbow + res.pose.swivel;
    if (Math.abs(wrapDeg(achieved - facing)) < 0.01) break;
    facing = achieved;
    res = solveOnce(arm, target, facing, opts);
  }
  const achieved = res.pose.shoulder + res.pose.elbow + res.pose.swivel;
  return {
    pose: res.pose,
    error: res.error,
    reachable: res.error < 1,
    facingKept: Math.abs(wrapDeg(achieved - wanted)) < 0.05,
  };
}

/** Ekranın göz noktasına bakması için gereken bakış yönü ve eğim. */
export function aimAt(arm: Arm, eye: Vec3): { yaw: number; tilt: number } {
  const f = forward(arm);
  const c = arm.monitor ? monitorFrame(arm.monitor, f).screen : f.plate;
  return {
    yaw: Math.atan2(eye.x - c.x, eye.z - c.z) / DEG,
    tilt: Math.atan2(eye.y - c.y, Math.hypot(eye.x - c.x, eye.z - c.z)) / DEG,
  };
}

export interface ReachInfo {
  /** Mevcut kaldırma açısında VESA noktasının kolondan yatay uzaklık aralığı. */
  minReach: number;
  maxReach: number;
  /** Kaldırma sınırlarına göre VESA yükseklik aralığı (masa üstünden). */
  minY: number;
  maxY: number;
}

export function reachInfo(arm: Arm): ReachInfo {
  const g = arm.geometry;
  const r2 = g.upperLength * Math.cos(arm.pose.lift * DEG);
  const pivotY = g.columnHeight + g.elbowRise - g.headDrop;
  const [lo, hi] = arm.limits.lift;
  return {
    minReach: Math.max(0, Math.abs(g.lowerLength - r2) - g.headLength),
    maxReach: g.lowerLength + r2 + g.headLength,
    minY: pivotY + g.upperLength * Math.sin(lo * DEG),
    maxY: pivotY + g.upperLength * Math.sin(hi * DEG),
  };
}
