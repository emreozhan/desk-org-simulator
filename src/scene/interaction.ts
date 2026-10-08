// Sahne içi etkileşim: seçme, monitörü sürükleyerek ters kinematik, kelepçe ve nesne taşıma, klavye.
import * as THREE from "three";
import type { Store } from "../app/store";
import { wallZ } from "../model/analysis";
import { forward, solveIK } from "../model/kinematics";
import type { Vec3 } from "../model/types";
import { clamp, wrapDeg } from "../model/vec";
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

  private hit(e: PointerEvent): { tag: PickTag; point: THREE.Vector3 } | null {
    const w = this.world;
    w.raycaster.setFromCamera(w.ndc(e), w.camera);
    const hits = w.raycaster.intersectObjects(this.scene.pickables(), false);
    for (const h of hits) {
      if (!h.object.visible || !isVisible(h.object)) continue;
      return { tag: h.object.userData.pick as PickTag, point: h.point };
    }
    return null;
  }

  private hover(e: PointerEvent): void {
    if (this.drag) return;
    const h = this.hit(e);
    const c = this.world.renderer.domElement;
    c.style.cursor = !h ? "" : h.tag.part === "monitor" || h.tag.part === "item" || h.tag.part === "base" ? "grab" : "pointer";
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0 || e.target !== this.world.renderer.domElement) return;
    this.down = { x: e.clientX, y: e.clientY };
    const h = this.hit(e);
    if (!h) return;
    const { tag } = h;
    this.store.select({ kind: tag.kind, id: tag.id });
    if (tag.part === "arm") return; // kol gövdesi yalnız seçer
    this.world.controls.enabled = false;
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
      // Boşluğa tık (sürüklemeden) seçimi kaldırır.
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 4 && !this.hit(e)) this.store.select(null);
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
    const step = e.shiftKey ? 1 : 10;
    const dir: Record<string, [number, number, number]> = {
      ArrowLeft: [-step, 0, 0],
      ArrowRight: [step, 0, 0],
      ArrowUp: [0, 0, -step],
      ArrowDown: [0, 0, step],
      PageUp: [0, step, 0],
      PageDown: [0, -step, 0],
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
      this.commitSoon();
    } else if (v && it) {
      e.preventDefault();
      s.mutate(() => {
        it.x += v[0];
        it.z += v[2];
        it.elevation = Math.max(0, it.elevation + v[1]);
      });
      this.commitSoon();
    } else if (it && e.code === "Delete") {
      s.removeItem(it.id);
    } else if (it || arm) {
      if (this.orient(e)) e.preventDefault();
    }
  }

  /**
   * Yön kısayolları. Q/E: 15° (Shift 1°) sola/sağa, R: 90° (Shift ters), 0: sıfırla.
   * Monitörde Q/E ekranın bakış yönünü VESA noktası sabit kalarak çevirir; R yatay/dikey yapar; Z/X eğer.
   */
  private orient(e: KeyboardEvent): boolean {
    const s = this.store;
    const fine = e.shiftKey;
    const yawKey = e.code === "KeyQ" ? 1 : e.code === "KeyE" ? -1 : 0;
    const reset = e.code === "Digit0" || e.code === "Numpad0";
    const it = s.selectedItem();
    if (it) {
      let next: number | null = null;
      if (yawKey) next = it.rotY + yawKey * (fine ? 1 : 15);
      else if (e.code === "KeyR") next = it.rotY + (fine ? 90 : -90);
      else if (reset) next = 0;
      if (next === null) return false;
      const rot = wrapDeg(next);
      s.mutate(() => (it.rotY = rot));
      s.say(`${it.name}: dönüş ${fmtDeg(rot)}`);
      this.commitSoon();
      return true;
    }
    const arm = s.selectedArm();
    if (!arm) return false;
    const f = forward(arm);
    const id = { tag: { kind: "arm" as const, id: arm.id, part: "monitor" as const } };
    if (yawKey || reset) {
      this.moveMonitor({ ...id, facing: reset ? 0 : f.facingYaw + yawKey * (fine ? 1 : 15) }, f.plate);
      if (reset) s.mutate(() => (arm.pose.tilt = arm.pose.roll = 0));
      const r = s.ik.get(arm.id);
      s.say(
        r && !r.facingKept
          ? `${arm.name}: baş dönüş sınırına gelindi`
          : `${arm.name}: ekran yönü ${fmtDeg(wrapDeg(forward(arm).facingYaw))}`,
      );
    } else if (e.code === "KeyZ" || e.code === "KeyX") {
      const t = clamp(arm.pose.tilt + (e.code === "KeyX" ? 1 : -1) * (fine ? 1 : 5), ...arm.limits.tilt);
      s.mutate(() => (arm.pose.tilt = t));
      s.say(`${arm.name}: eğim ${fmtDeg(t)}`);
    } else if (e.code === "KeyR") {
      const roll = Math.abs(arm.pose.roll) > 45 ? 0 : clamp(fine ? -90 : 90, ...arm.limits.roll);
      s.mutate(() => (arm.pose.roll = roll));
      s.say(`${arm.name}: ${roll === 0 ? "yatay" : "dikey"}`);
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
