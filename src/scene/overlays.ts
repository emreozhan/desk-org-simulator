// Ölçü katmanı: açı yayları, erişim alanı, yükseklik ölçüsü, göz noktası ve görüş çizgileri.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { Analysis } from "../model/analysis";
import { wallZ } from "../model/analysis";
import { reachInfo } from "../model/kinematics";
import type { Layout, Vec3 } from "../model/types";
import type { Selection, ViewOptions } from "../app/store";
import { DEG, add, mul, vec, yawDir } from "../model/vec";

const ACCENT = "#ff6b35";
const CYAN = "#5fd3e0";

function lines(color: string, opacity: number): THREE.LineSegments {
  const l = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  l.renderOrder = 20;
  l.frustumCulled = false;
  return l;
}

function setLines(l: THREE.LineSegments, pts: Vec3[]): void {
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => arr.set([p.x, p.y, p.z], i * 3));
  l.geometry.dispose();
  l.geometry = new THREE.BufferGeometry();
  l.geometry.setAttribute("position", new THREE.BufferAttribute(arr, 3));
}

function polyline(out: Vec3[], pts: Vec3[]): void {
  for (let i = 0; i < pts.length - 1; i++) out.push(pts[i], pts[i + 1]);
}

/** Yatay düzlemde yay (yaw açıları derece). */
function yawArc(c: Vec3, r: number, a0: number, a1: number): Vec3[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 4));
  return Array.from({ length: n + 1 }, (_, i) => add(c, mul(yawDir(a0 + ((a1 - a0) * i) / n), r)));
}

function tag(cls: string): CSS2DObject {
  const el = document.createElement("div");
  el.className = cls;
  const o = new CSS2DObject(el);
  o.center.set(0.5, 0.5);
  return o;
}

export class Overlays {
  readonly group = new THREE.Group();
  private readonly arcs = lines(ACCENT, 0.95);
  private readonly refs = lines("#ffffff", 0.32);
  private readonly sight = lines(CYAN, 0.55);
  private readonly dims = lines(CYAN, 0.9);
  private readonly ring: THREE.Mesh;
  private readonly eye: THREE.Mesh;
  private readonly eyeLevel = lines(CYAN, 0.45);
  private readonly bottomTag = tag("dim-label");
  private readonly reachTag = tag("dim-label dim-label--accent");
  private readonly eyeTag = tag("dim-label dim-label--eye");

  constructor() {
    this.ring = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.renderOrder = 5;
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 16), new THREE.MeshBasicMaterial({ color: CYAN }));
    this.eyeTag.element.textContent = "göz";
    this.group.add(this.arcs, this.refs, this.sight, this.dims, this.ring, this.eye, this.eyeLevel);
    this.group.add(this.bottomTag, this.reachTag, this.eyeTag);
  }

  update(layout: Layout, sel: Selection, opt: ViewOptions, a: Analysis): void {
    const v = layout.viewer;
    this.eye.position.set(v.x, v.y, v.z);
    this.eyeTag.position.set(v.x, v.y + 45, v.z);
    const wz = wallZ(layout) + 1;
    const hw = layout.desk.width / 2;
    setLines(this.eyeLevel, [vec(-hw, v.y, wz), vec(hw, v.y, wz)]);

    const sightPts: Vec3[] = [];
    if (opt.sightLines) for (const x of a.arms.values()) if (x.monitor) sightPts.push(v, x.monitor.screen);
    setLines(this.sight, sightPts);
    this.eye.visible = this.eyeTag.visible = this.eyeLevel.visible = opt.sightLines;

    const arm = sel?.kind === "arm" ? a.arms.get(sel.id) : undefined;
    const arcs: Vec3[] = [];
    const refs: Vec3[] = [];
    const dims: Vec3[] = [];
    this.ring.visible = false;
    this.bottomTag.visible = this.reachTag.visible = false;

    if (arm) {
      const f = arm.frame;
      if (opt.angleLabels) {
        // Omuz: masaya dik (0°) referansından alt kola
        const s = add(f.shoulder, vec(0, 4, 0));
        refs.push(s, add(s, mul(yawDir(0), 130)));
        polyline(arcs, yawArc(s, 95, 0, f.lowerYaw));
        // Dirsek: alt kol uzantısından ön kola
        const e = add(f.liftPivot, vec(0, 4, 0));
        refs.push(e, add(e, mul(yawDir(f.lowerYaw), 110)));
        polyline(arcs, yawArc(e, 75, f.lowerYaw, f.upperYaw));
        // Kaldırma: yatay düzlemden ön kola, dikey düzlemde
        const d = yawDir(f.upperYaw);
        refs.push(f.liftPivot, add(f.liftPivot, mul(d, 140)));
        const n = Math.max(2, Math.ceil(Math.abs(arm.arm.pose.lift) / 4));
        const lp: Vec3[] = [];
        for (let i = 0; i <= n; i++) {
          const t = (arm.arm.pose.lift * DEG * i) / n;
          lp.push(add(f.liftPivot, add(mul(d, 110 * Math.cos(t)), vec(0, 110 * Math.sin(t), 0))));
        }
        polyline(arcs, lp);
        // Baş: ön kol doğrultusundan ekran yönüne
        const w = add(f.wrist, vec(0, 34, 0));
        refs.push(w, add(w, mul(yawDir(f.upperYaw), 90)));
        polyline(arcs, yawArc(w, 60, f.upperYaw, f.facingYaw));
      }

      if (opt.envelope) {
        const r = reachInfo(arm.arm);
        const geo = new THREE.RingGeometry(Math.max(1, r.minReach), r.maxReach, 128, 1);
        geo.rotateX(-Math.PI / 2);
        this.ring.geometry.dispose();
        this.ring.geometry = geo;
        this.ring.position.set(f.base.x, f.plate.y, f.base.z);
        this.ring.visible = true;
        const c = vec(f.base.x, f.plate.y, f.base.z);
        polyline(refs, yawArc(c, r.maxReach, -180, 180));
        if (r.minReach > 1) polyline(refs, yawArc(c, r.minReach, -180, 180));
        // VESA yükseklik aralığı: kolonun yanında dikey cetvel
        const side = add(f.base, mul(yawDir(f.lowerYaw - 90), 70));
        dims.push(vec(side.x, r.minY, side.z), vec(side.x, r.maxY, side.z));
        for (const y of [r.minY, r.maxY]) dims.push(vec(side.x - 12, y, side.z), vec(side.x + 12, y, side.z));
        arcs.push(vec(side.x - 22, f.plate.y, side.z), vec(side.x + 22, f.plate.y, side.z));
        this.reachTag.position.set(side.x, r.maxY + 40, side.z);
        this.reachTag.element.textContent = `VESA ${r.minY.toFixed(0)}–${r.maxY.toFixed(0)} mm`;
        this.reachTag.visible = true;
      }

      // Ekran alt kenarı → masa ölçüsü
      if (arm.monitor && arm.ergo) {
        const mid = mul(add(arm.monitor.corners[2], arm.monitor.corners[3]), 0.5);
        const low = vec(mid.x, arm.ergo.bottomAboveDesk, mid.z);
        dims.push(vec(low.x, 0, low.z), low);
        dims.push(vec(low.x - 20, 0, low.z), vec(low.x + 20, 0, low.z));
        dims.push(vec(low.x - 20, low.y, low.z), vec(low.x + 20, low.y, low.z));
        this.bottomTag.position.set(low.x + 4, low.y / 2, low.z);
        this.bottomTag.element.textContent = `${arm.ergo.bottomAboveDesk.toFixed(0)} mm`;
        this.bottomTag.visible = arm.ergo.bottomAboveDesk > 0;
      }
    }
    setLines(this.arcs, arcs);
    setLines(this.refs, refs);
    setLines(this.dims, dims);
  }
}
