// F80 kolunun 3B modeli. Hiyerarşi model/kinematics.ts içindeki forward() ile birebir aynı zinciri kurar.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { Arm, DeskSpec } from "../model/types";
import { PLATE_OFFSET, SLAB_DEPTH, monitorDims } from "../model/kinematics";
import { DEG } from "../model/vec";
import { screenTexture } from "./textures";
import { at, box, cyl, disposeTree, mesh, rbox, std, tagPick } from "./parts";

const ACCENT = new THREE.Color("#ff6b35");
const DANGER = new THREE.Color("#ff3b3b");

function label(cls = ""): CSS2DObject {
  const el = document.createElement("div");
  el.className = `joint-label ${cls}`;
  const o = new CSS2DObject(el);
  o.center.set(0.5, 1);
  return o;
}

export class ArmView {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly key: string;
  readonly pickables: THREE.Mesh[] = [];

  private readonly shoulder = new THREE.Group();
  private readonly elbow = new THREE.Group();
  private readonly lift = new THREE.Group();
  private readonly wrist = new THREE.Group();
  private readonly swivel = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private readonly roll = new THREE.Group();

  private readonly armMat = std("#1b1c1f", 0.42, 0.55);
  private readonly bezelMat = std("#111214", 0.5, 0.1);
  private readonly labels: Record<"shoulder" | "elbow" | "lift" | "swivel" | "tilt", CSS2DObject>;

  static keyOf(arm: Arm, desk: DeskSpec): string {
    return JSON.stringify([arm.geometry, arm.monitor, desk.depth, desk.thickness, Math.round(arm.base.z)]);
  }

  constructor(arm: Arm, desk: DeskSpec, aniso: number) {
    this.id = arm.id;
    this.key = ArmView.keyOf(arm, desk);
    const g = arm.geometry;
    const m = this.armMat;
    const metal = std("#7b7f86", 0.28, 0.9);

    // Kelepçe veya delik montajı
    const base = new THREE.Group();
    const edgeZ = -desk.depth / 2 - arm.base.z;
    const t = desk.thickness;
    if (edgeZ > -150) {
      const front = 55;
      const len = front - (edgeZ - 12);
      base.add(at(mesh(rbox(84, 12, len, 4), m), 0, 6, (front + edgeZ - 12) / 2));
      base.add(at(mesh(rbox(84, t + 46, 14, 4), m), 0, 12 - (t + 46) / 2, edgeZ - 7));
      base.add(at(mesh(rbox(84, 14, 80, 4), m), 0, -(t + 27), edgeZ + 26));
      base.add(at(mesh(cyl(7, 22), metal), 0, -(t + 11), edgeZ + 40));
      base.add(at(mesh(cyl(22, 12), m), 0, -(t + 40), edgeZ + 40));
    } else {
      base.add(at(mesh(cyl(55, 10, 40), m), 0, 5, 0));
      base.add(at(mesh(cyl(8, t + 60), metal), 0, -(t + 60) / 2, 0));
    }
    const colLen = Math.max(10, g.columnHeight - 45 - 10);
    base.add(at(mesh(cyl(20, colLen), m), 0, 10 + colLen / 2, 0));
    base.add(at(mesh(cyl(27, 45), m), 0, g.columnHeight - 22.5, 0));
    this.root.add(base);
    this.pickables.push(...tagPick(base, { kind: "arm", id: arm.id, part: "base" }));

    // Omuz → alt kol
    this.shoulder.position.y = g.columnHeight;
    this.shoulder.add(at(mesh(rbox(46, 30, g.lowerLength + 46, 10), m), 0, -15, g.lowerLength / 2));
    this.root.add(this.shoulder);

    // Dirsek → gazlı ön kol
    this.elbow.position.z = g.lowerLength;
    this.elbow.add(at(mesh(cyl(25, g.elbowRise + 45), m), 0, (-30 + g.elbowRise + 15) / 2, 0));
    this.shoulder.add(this.elbow);

    this.lift.position.y = g.elbowRise;
    this.lift.add(at(mesh(rbox(48, 36, g.upperLength + 40, 12), m), 0, 6, g.upperLength / 2));
    const piston = mesh(cyl(8, g.upperLength * 0.62), metal);
    piston.rotation.x = Math.PI / 2;
    this.lift.add(at(piston, 0, -18, g.upperLength * 0.45));
    const cap = mesh(box(50, 3, g.upperLength * 0.35), std("#3a3c41", 0.35, 0.7));
    this.lift.add(at(cap, 0, 24.5, g.upperLength * 0.55));
    this.elbow.add(this.lift);

    // Bilek (paralelkenar: kaldırma açısını sıfırlar) → baş
    this.wrist.position.z = g.upperLength;
    this.wrist.add(mesh(cyl(20, 56), m));
    this.lift.add(this.wrist);
    this.wrist.add(this.swivel);
    this.swivel.add(at(mesh(rbox(30, 26, g.headLength + 14, 6), m), 0, 0, g.headLength / 2));
    if (g.headDrop > 0) this.swivel.add(at(mesh(box(26, g.headDrop, 26), m), 0, -g.headDrop / 2, g.headLength));
    this.tilt.position.set(0, -g.headDrop, g.headLength);
    const knuckle = mesh(cyl(14, 64), m);
    knuckle.rotation.z = Math.PI / 2;
    this.tilt.add(knuckle);
    this.swivel.add(this.tilt);
    this.tilt.add(this.roll);
    this.roll.add(at(mesh(box(118, 118, 8), m), 0, 0, PLATE_OFFSET - 4));

    const armParts = new THREE.Group();
    armParts.add(this.shoulder);
    this.root.add(armParts);
    this.pickables.push(...tagPick(armParts, { kind: "arm", id: arm.id, part: "arm" }));

    // Monitör
    if (arm.monitor) {
      const spec = arm.monitor;
      const d = monitorDims(spec);
      const mon = new THREE.Group();
      const slabD = Math.min(SLAB_DEPTH, spec.depth);
      const humpD = spec.depth - slabD;
      const y0 = -spec.vesaOffsetY;
      mon.add(at(mesh(rbox(d.outerW, d.outerH, slabD, 3), this.bezelMat), 0, y0, PLATE_OFFSET + spec.depth - slabD / 2));
      if (humpD > 1) {
        const hump = rbox(d.outerW * 0.62, d.outerH * 0.62, humpD + 2, 18);
        mon.add(at(mesh(hump, std("#18191c", 0.55, 0.05)), 0, y0, PLATE_OFFSET + humpD / 2));
      }
      const screenMat = new THREE.MeshBasicMaterial({
        map: screenTexture(spec.screen, aniso),
        color: new THREE.Color(0.86, 0.86, 0.86),
        toneMapped: false,
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(d.panelW, d.panelH), screenMat);
      screen.position.set(0, y0 + d.screenOffsetY, PLATE_OFFSET + spec.depth + 0.6);
      mon.add(screen);
      // Güç ışığı
      mon.add(at(mesh(box(6, 3, 2), new THREE.MeshBasicMaterial({ color: "#f5f5f5" }), false),
        d.outerW / 2 - 30, y0 - d.outerH / 2 + spec.bezelBottom / 2, PLATE_OFFSET + spec.depth + 0.5));
      this.roll.add(mon);
      this.pickables.push(...tagPick(mon, { kind: "arm", id: arm.id, part: "monitor" }));
    }

    this.labels = {
      shoulder: at(label(), 0, 55, 0),
      elbow: at(label(), 0, g.elbowRise + 60, 0),
      lift: at(label(), 0, 55, g.upperLength * 0.5),
      swivel: at(label(), 0, 60, 0),
      tilt: at(label("joint-label--head"), 0, 80, -10),
    };
    this.shoulder.add(this.labels.shoulder);
    this.elbow.add(this.labels.elbow);
    this.lift.add(this.labels.lift);
    this.wrist.add(this.labels.swivel);
    this.tilt.add(this.labels.tilt);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }

  applyPose(arm: Arm): void {
    const p = arm.pose;
    this.root.position.set(arm.base.x, 0, arm.base.z);
    this.shoulder.rotation.y = p.shoulder * DEG;
    this.elbow.rotation.y = p.elbow * DEG;
    this.lift.rotation.x = -p.lift * DEG;
    this.wrist.rotation.x = p.lift * DEG;
    this.swivel.rotation.y = p.swivel * DEG;
    this.tilt.rotation.x = -p.tilt * DEG;
    this.roll.rotation.z = p.roll * DEG;
    const f = (v: number): string => `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}°`;
    this.labels.shoulder.element.textContent = `omuz ${f(p.shoulder)}`;
    this.labels.elbow.element.textContent = `dirsek ${f(p.elbow)}`;
    this.labels.lift.element.textContent = `kaldırma ${f(p.lift)}`;
    this.labels.swivel.element.textContent = `baş ${f(p.swivel)}`;
    this.labels.tilt.element.textContent = `eğim ${f(p.tilt)} · dönüş ${f(p.roll)}`;
  }

  setState(selected: boolean, colliding: boolean, showLabels: boolean): void {
    this.armMat.emissive.copy(selected ? ACCENT : new THREE.Color(0));
    this.armMat.emissiveIntensity = selected ? 0.07 : 0;
    this.bezelMat.emissive.copy(colliding ? DANGER : new THREE.Color(0));
    this.bezelMat.emissiveIntensity = colliding ? 0.55 : 0;
    for (const l of Object.values(this.labels)) l.visible = selected && showLabels;
  }

  dispose(): void {
    for (const l of Object.values(this.labels)) l.element.remove();
    disposeTree(this.root);
  }
}
