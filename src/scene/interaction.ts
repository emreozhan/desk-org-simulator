// Sahne içi etkileşim: seçme, monitörü sürükleyerek ters kinematik, kelepçe ve nesne taşıma, klavye.
import * as THREE from "three";
import type { Store } from "../app/store";
import { wallZ } from "../model/analysis";
import { forward, solveIK } from "../model/kinematics";
import type { DeskItem, Vec3 } from "../model/types";
import { resizeItem } from "../model/resize";
import { clamp, wrapDeg } from "../model/vec";
import { JOINT_META } from "../model/meta";
import { FINE_STEP, ITEM_ROT_STEP, JOINT_BY_CODE, JOINT_STEP, MOVE_STEP, pulse } from "../app/shortcuts";
import type { PickTag } from "./parts";
import type { SceneController } from "./controller";
import type { World } from "./world";

interface Drag {
  tag: PickTag;
  plane: THREE.Plane;
  /** Tutulan nokta ile hareket ettirilen referans arası fark. */
  offset: THREE.Vector3;
  vertical: boolean;
  facing: number;
  moved: boolean;
  start: { x: number; y: number };
  /** Boyut tutamağı sürüklemesi: başlangıçtaki nesne ve üstünde duranlar. */
  resize?: { start: DeskItem; riders: { item: DeskItem; elevation: number }[] };
}

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));

export class Interaction {
  private readonly world: World;
  private readonly store: Store;
  private readonly scene: SceneController;
  private drag: Drag | null = null;
  private down: { x: number; y: number } | null = null;
  private nudgeTimer = 0;

  constructor(world: World, store: Store, scene: SceneController) {
    this.world = world;
    this.store = store;
    this.scene = scene;
    // Yakalama aşamasında: OrbitControls'tan önce karar verip gerekirse onu devre dışı bırak.
    world.container.addEventListener("pointerdown", (e) => this.onDown(e), { capture: true });
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    window.addEventListener("keydown", (e) => this.onKey(e));
    world.renderer.domElement.addEventListener("pointermove", (e) => this.hover(e));
  }

  private hit(e: PointerEvent): { tag: PickTag; point: THREE.Vector3; object: THREE.Object3D } | null {
    const w = this.world;
    w.raycaster.setFromCamera(w.ndc(e), w.camera);
    // Tutamaklar derinlik testi olmadan çizilir; gövdenin arkasında kalsalar da önce onlar denenir.
    for (const list of [this.scene.handlePickables(), this.scene.pickables()]) {
      for (const h of w.raycaster.intersectObjects(list, false)) {
        if (!h.object.visible || !isVisible(h.object)) continue;
        return { tag: h.object.userData.pick as PickTag, point: h.point, object: h.object };
      }
    }
    return null;
  }

  private hover(e: PointerEvent): void {
    if (this.drag) return;
    const h = this.hit(e);
    const c = this.world.renderer.domElement;
    c.style.cursor = !h
      ? ""
      : h.tag.part === "handle"
        ? h.tag.handle === "y+"
          ? "ns-resize"
          : "ew-resize"
        : h.tag.part === "monitor" || h.tag.part === "item" || h.tag.part === "base"
          ? "grab"
          : h.tag.part === "desk"
            ? ""
            : "pointer";
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0 || e.target !== this.world.renderer.domElement) return;
    this.down = { x: e.clientX, y: e.clientY };
    const h = this.hit(e);
    if (!h) return;
    const { tag } = h;
    if (tag.kind === "desk") return; // masa tıklama bitince seçilir; basılı sürükleme kamerayı döndürür
    this.store.select({ kind: tag.kind, id: tag.id });
    if (tag.part === "arm") return; // kol gövdesi yalnız seçer
    this.world.controls.enabled = false;
    if (tag.part === "handle" && tag.handle) {
      this.startResize(e, tag, h.object);
      return;
    }
    const ref = this.refPoint(tag);
    if (!ref) return;
    const vertical = tag.part === "monitor" && !e.shiftKey;
    const plane = this.makePlane(vertical, ref);
    const hitPt = new THREE.Vector3();
    this.world.raycaster.ray.intersectPlane(plane, hitPt);
    const arm = tag.kind === "arm" ? this.store.arm(tag.id) : undefined;
    this.drag = {
      tag,
      plane,
      offset: hitPt.sub(ref),
      vertical,
      facing: arm ? forward(arm).facingYaw : 0,
      moved: false,
      start: { x: e.clientX, y: e.clientY },
    };
    this.world.renderer.domElement.style.cursor = "grabbing";
  }

  private startResize(e: PointerEvent, tag: PickTag, handle: THREE.Object3D): void {
    const it = this.store.item(tag.id);
    if (!it) return;
    const ref = handle.getWorldPosition(new THREE.Vector3());
    const plane = this.makePlane(tag.handle === "y+", ref);
    const hitPt = new THREE.Vector3();
    this.world.raycaster.ray.intersectPlane(plane, hitPt);
    const top = it.elevation + it.h;
    const riders = this.store.layout.items
      .filter((o) => o !== it && Math.abs(o.elevation - top) < 6 && Math.abs(o.x - it.x) < it.w / 2 + 20 && Math.abs(o.z - it.z) < it.d / 2 + 20)
      .map((o) => ({ item: o, elevation: o.elevation }));
    this.drag = {
      tag,
      plane,
      offset: hitPt.sub(ref),
      vertical: tag.handle === "y+",
      facing: 0,
      moved: false,
      start: { x: e.clientX, y: e.clientY },
      resize: { start: structuredClone(it), riders },
    };
  }

  private resize(d: Drag, p: THREE.Vector3): void {
    const it = this.store.item(d.tag.id);
    if (!it || !d.resize || !d.tag.handle) return;
    const snap = this.store.options.snap ? (v: number): number => Math.round(v / 5) * 5 : (v: number): number => v;
    const r = resizeItem(d.resize.start, d.tag.handle, { x: p.x, y: p.y, z: p.z }, snap);
    const dh = r.h - d.resize.start.h;
    this.store.mutate(() => {
      Object.assign(it, r);
      // Üstte duran nesneler yükseklikle birlikte kalkar.
      for (const rd of d.resize!.riders) rd.item.elevation = rd.elevation + dh;
    });
    this.store.say(`${it.name}: ${Math.round(it.w)} × ${Math.round(it.d)} × ${Math.round(it.h)} mm`);
  }

  /** Sürüklenen şeyin referans noktası: VESA eklemi, kolon tabanı ya da nesne tabanı. */
  private refPoint(tag: PickTag): THREE.Vector3 | null {
    if (tag.kind === "arm") {
      const arm = this.store.arm(tag.id);
      if (!arm) return null;
      if (tag.part === "base") return new THREE.Vector3(arm.base.x, 0, arm.base.z);
      const p = forward(arm).plate;
      return new THREE.Vector3(p.x, p.y, p.z);
    }
    const it = this.store.item(tag.id);
    return it ? new THREE.Vector3(it.x, it.elevation, it.z) : null;
  }

  /** Dikey düzlem kameraya bakar (sağ-sol/yukarı-aşağı); yatay düzlem derinlik içindir. */
  private makePlane(vertical: boolean, through: THREE.Vector3): THREE.Plane {
    if (!vertical) return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), through);
    const n = new THREE.Vector3();
    this.world.camera.getWorldDirection(n);
    n.y = 0;
    if (n.lengthSq() < 1e-6) n.set(0, 0, -1);
    n.normalize();
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n, through);
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < 3) return;
    d.moved = true;
    const w = this.world;
    // Shift sürükleme sırasında da değiştirilebilir: düzlemi mevcut noktadan yeniden kur.
    if (d.tag.part === "monitor" && d.vertical === e.shiftKey) {
      const ref = this.refPoint(d.tag)!;
      d.vertical = !e.shiftKey;
      d.plane = this.makePlane(d.vertical, ref);
      w.raycaster.setFromCamera(w.ndc(e), w.camera);
      const p = new THREE.Vector3();
      if (w.raycaster.ray.intersectPlane(d.plane, p)) d.offset = p.sub(ref);
      return;
    }
    w.raycaster.setFromCamera(w.ndc(e), w.camera);
    const p = new THREE.Vector3();
    if (!w.raycaster.ray.intersectPlane(d.plane, p)) return;
    p.sub(d.offset);
    if (d.resize) {
      this.resize(d, p);
      return;
    }
    const snap = this.store.options.snap ? (v: number): number => Math.round(v / 5) * 5 : (v: number): number => v;
    if (d.tag.kind === "arm" && d.tag.part === "monitor") this.moveMonitor(d, { x: snap(p.x), y: snap(p.y), z: snap(p.z) });
    else if (d.tag.kind === "arm") this.moveBase(d.tag.id, snap(p.x), snap(p.z));
    else this.moveItem(d.tag.id, snap(p.x), snap(p.z));
  }

  moveMonitor(d: Pick<Drag, "tag" | "facing">, target: Vec3): void {
    const arm = this.store.arm(d.tag.id);
    if (!arm) return;
    const L = this.store.layout;
    let facing = d.facing;
    if (this.store.options.faceEye) facing = Math.atan2(L.viewer.x - target.x, L.viewer.z - target.z) * (180 / Math.PI);
    const r = solveIK(arm, target, facing, { wallZ: wallZ(L) });
    this.store.ik.set(arm.id, r);
    this.store.mutate(() => (arm.pose = r.pose));
  }

  private moveBase(id: string, x: number, z: number): void {
    const arm = this.store.arm(id);
    if (!arm) return;
    const { width, depth } = this.store.layout.desk;
    this.store.mutate(() => {
      arm.base.x = clamp(x, -width / 2 + 45, width / 2 - 45);
      arm.base.z = clamp(z, -depth / 2 + 35, depth / 2 - 45);
    });
  }

  private moveItem(id: string, x: number, z: number): void {
    const it = this.store.item(id);
    if (!it) return;
    // Üstünde duran nesneler (ör. kasa üstündeki modem) birlikte taşınır.
    const top = it.elevation + it.h;
    const riders = this.store.layout.items.filter(
      (o) => o !== it && Math.abs(o.elevation - top) < 6 && Math.abs(o.x - it.x) < it.w / 2 + 20 && Math.abs(o.z - it.z) < it.d / 2 + 20,
    );
    const dx = x - it.x;
    const dz = z - it.z;
    this.store.mutate(() => {
      for (const o of [it, ...riders]) {
        o.x += dx;
        o.z += dz;
      }
    });
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    this.world.controls.enabled = true;
    if (d) {
      this.world.renderer.domElement.style.cursor = "";
      if (d.moved) {
        this.store.commit();
        const r = d.tag.kind === "arm" ? this.store.ik.get(d.tag.id) : undefined;
        if (d.tag.part === "monitor" && r && !r.reachable)
          this.store.say(`Kol bu noktaya ulaşamıyor: en yakın konum ${r.error.toFixed(0)} mm uzakta.`);
      }
    } else if (this.down && e.target === this.world.renderer.domElement) {
      // Sürüklemeden tık: masaya ise masayı seçer, boşluğa ise seçimi kaldırır.
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 4) {
        const h = this.hit(e);
        if (!h) this.store.select(null);
        else if (h.tag.kind === "desk") this.store.select({ kind: "desk", id: "desk" });
      }
    }
    this.down = null;
  }

  private onKey(e: KeyboardEvent): void {
    if (isTyping(e.target)) return;
    const s = this.store;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) s.redo();
      else s.undo();
      return;
    }
    if (mod && e.code === "KeyY") {
      e.preventDefault();
      s.redo();
      return;
    }
    if (e.code === "Escape") {
      s.select(null);
      return;
    }
    const step = e.shiftKey ? FINE_STEP : MOVE_STEP;
    // [x, y, z adımı, eksen, rozet]
    const dir: Record<string, [number, number, number, "x" | "y" | "z", string]> = {
      ArrowLeft: [-step, 0, 0, "x", "←"],
      ArrowRight: [step, 0, 0, "x", "→"],
      ArrowUp: [0, 0, -step, "z", "↑"],
      ArrowDown: [0, 0, step, "z", "↓"],
      PageUp: [0, step, 0, "y", "PgUp"],
      PageDown: [0, -step, 0, "y", "PgDn"],
    };
    const v = dir[e.code];
    const arm = s.selectedArm();
    const it = s.selectedItem();
    if (v && arm) {
      e.preventDefault();
      const f = forward(arm);
      this.moveMonitor({ tag: { kind: "arm", id: arm.id, part: "monitor" }, facing: f.facingYaw }, {
        x: f.plate.x + v[0],
        y: f.plate.y + v[1],
        z: f.plate.z + v[2],
      });
      pulse(`vesa:${v[3]}`, v[4]);
      this.commitSoon();
    } else if (v && it) {
      e.preventDefault();
      s.mutate(() => {
        it.x += v[0];
        it.z += v[2];
        it.elevation = Math.max(0, it.elevation + v[1]);
      });
      pulse(`item:${v[3] === "y" ? "elevation" : v[3]}`, v[4]);
      this.commitSoon();
    } else if (it && e.code === "Delete") {
      s.removeItem(it.id);
    } else if (it || arm) {
      if (this.orient(e)) e.preventDefault();
    }
  }

  /**
   * Yön kısayolları; tuşlar app/shortcuts.ts içindeki tabloyla panel kaydırıcılarına birebir bağlıdır.
   * Monitörde her tuş çifti tek bir eklemi değiştirir (sol tuş azaltır, sağ tuş artırır).
   */
  private orient(e: KeyboardEvent): boolean {
    const s = this.store;
    const fine = e.shiftKey;
    const reset = e.code === "Digit0" || e.code === "Numpad0";
    const it = s.selectedItem();
    if (it) {
      let next: number | null = null;
      let key = "";
      if (e.code === "KeyQ" || e.code === "KeyE") {
        key = e.code.slice(3);
        next = it.rotY + (e.code === "KeyQ" ? -1 : 1) * (fine ? FINE_STEP : ITEM_ROT_STEP);
      } else if (e.code === "KeyR") {
        key = "R";
        next = it.rotY + (fine ? -90 : 90);
      } else if (reset) {
        key = "0";
        next = 0;
      }
      if (next === null) return false;
      const rot = wrapDeg(next);
      s.mutate(() => (it.rotY = rot));
      s.say(`${it.name}: dönüş ${fmtDeg(rot)}`);
      pulse("item:rotY", key);
      this.commitSoon();
      return true;
    }
    const arm = s.selectedArm();
    if (!arm) return false;
    const joint = JOINT_BY_CODE[e.code];
    if (joint) {
      const [j, sign] = joint;
      const [lo, hi] = arm.limits[j];
      const v = clamp(arm.pose[j] + sign * (fine ? FINE_STEP : JOINT_STEP), lo, hi);
      s.mutate(() => (arm.pose[j] = v));
      const atLimit = v <= lo || v >= hi;
      s.say(`${arm.name}: ${JOINT_META[j].label} ${fmtDeg(v)}${atLimit ? " · sınırda" : ""}`);
      pulse(`joint:${j}`, e.code.slice(3));
    } else if (e.code === "KeyR") {
      const roll = Math.abs(arm.pose.roll) > 45 ? 0 : clamp(fine ? -90 : 90, ...arm.limits.roll);
      s.mutate(() => (arm.pose.roll = roll));
      s.say(`${arm.name}: ${roll === 0 ? "yatay" : "dikey"}`);
      pulse("joint:roll", "R");
    } else if (reset) {
      s.mutate(() => {
        // Ekran tam karşıya (+Z) bakacak baş açısı; yalnız baş, eğim ve döndürme kaydırıcıları değişir.
        arm.pose.swivel = clamp(wrapDeg(-arm.pose.shoulder - arm.pose.elbow), ...arm.limits.swivel);
        arm.pose.tilt = 0;
        arm.pose.roll = 0;
      });
      s.say(`${arm.name}: düz bakış`);
      for (const j of ["swivel", "tilt", "roll"]) pulse(`joint:${j}`, "0");
    } else return false;
    this.commitSoon();
    return true;
  }

  /** Ardışık ok tuşu adımları tek geri-al adımı olur. */
  private commitSoon(): void {
    window.clearTimeout(this.nudgeTimer);
    this.nudgeTimer = window.setTimeout(() => this.store.commit(), 450);
  }
}

const fmtDeg = (v: number): string => `${v < 0 ? "−" : ""}${Math.abs(Math.round(v * 10) / 10)}°`;

function isVisible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
