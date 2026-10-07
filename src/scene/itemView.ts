import * as THREE from "three";
import type { DeskItem } from "../model/types";
import { itemBoundsHeight } from "../model/meta";
import { DEG } from "../model/vec";
import { at, box, cyl, disposeTree, mesh, rbox, std, tagPick } from "./parts";

type Builder = (it: DeskItem, g: THREE.Group, ctx: { topo: THREE.Texture }) => void;

const ORANGE = "#e2562f";

const builders: Record<DeskItem["kind"], Builder> = {
  keyboard(it, g) {
    const baseH = it.h * 0.55;
    g.add(at(mesh(rbox(it.w, baseH, it.d, 6), std(it.color, 0.5, 0.2)), 0, baseH / 2, 0));
    const cols = 15;
    const rows = 5;
    const px = (it.w - 18) / cols;
    const pz = (it.d - 16) / rows;
    const keys = new THREE.InstancedMesh(rbox(px * 0.86, it.h * 0.32, pz * 0.84, 2, 2), std("#ffffff", 0.55), cols * rows);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        m.makeTranslation(-it.w / 2 + 9 + px * (k + 0.5), baseH + it.h * 0.16, -it.d / 2 + 8 + pz * (r + 0.5));
        keys.setMatrixAt(n, m);
        const accent = (r === 0 && k === 0) || (r === 2 && k === 14) || (r === 4 && k > 11);
        keys.setColorAt(n, c.set(accent ? ORANGE : "#3a3b40"));
        n++;
      }
    keys.castShadow = true;
    g.add(keys);
  },
  mouse(it, g) {
    const s = mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), std(it.color, 0.4, 0.1));
    s.scale.set(it.w / 2, it.h, it.d / 2);
    g.add(s);
  },
  laptop(it, g) {
    const mat = std(it.color, 0.35, 0.75);
    g.add(at(mesh(rbox(it.w, it.h, it.d, 4), mat), 0, it.h / 2, 0));
    g.add(at(mesh(box(it.w * 0.84, 0.6, it.d * 0.42), std("#15171b", 0.6)), 0, it.h + 0.3, -it.d * 0.12));
    g.add(at(mesh(box(it.w * 0.4, 0.4, it.d * 0.28), std("#8e959e", 0.4, 0.6)), 0, it.h + 0.2, it.d * 0.3));
    const hinge = at(new THREE.Group(), 0, it.h, -it.d / 2);
    hinge.rotation.x = -105 * DEG;
    hinge.add(at(mesh(rbox(it.w, 6, it.d, 3), mat), 0, 3, it.d / 2));
    const scr = new THREE.Mesh(
      new THREE.PlaneGeometry(it.w * 0.9, it.d * 0.86),
      new THREE.MeshBasicMaterial({ color: "#20283a", toneMapped: false }),
    );
    scr.rotation.x = Math.PI / 2;
    hinge.add(at(scr, 0, -0.2, it.d / 2));
    g.add(hinge);
  },
  pcCase(it, g) {
    const white = std(it.color, 0.55, 0.05);
    g.add(at(mesh(box(it.w, it.h, it.d), white), 0, it.h / 2, 0));
    g.add(at(mesh(box(it.w + 2, it.h - 30, 6), std("#f4f4f1", 0.75)), 0, it.h / 2, it.d / 2 + 3));
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(it.d - 40, it.h - 40),
      std("#0b0d12", 0.08, 0.2, { transparent: true, opacity: 0.55 }),
    );
    glass.rotation.y = -Math.PI / 2;
    g.add(at(glass, -it.w / 2 - 1, it.h / 2, 0));
    const glow = (c: string): THREE.MeshStandardMaterial => std("#111", 0.4, 0, { emissive: c, emissiveIntensity: 1.6 });
    g.add(at(mesh(box(4, 8, it.d * 0.7), glow("#ff3cb4"), false), -it.w / 2 + 12, 40, 0));
    g.add(at(mesh(box(it.w * 0.55, 40, it.d * 0.65), std("#1d1f24", 0.5, 0.4)), -10, it.h * 0.45, -10));
    g.add(at(mesh(box(3, 6, 30), glow("#3cff8a"), false), -it.w / 2 + 35, it.h * 0.45, it.d * 0.15));
    g.add(at(mesh(cyl(55, 6, 32), glow("#7a5cff"), false), -it.w / 2 + 40, it.h * 0.78, -it.d / 2 + 70));
  },
  router(it, g) {
    const mat = std(it.color, 0.5, 0.2);
    g.add(at(mesh(rbox(it.w, it.h, it.d, 8), mat), 0, it.h / 2, 0));
    for (let i = 0; i < 4; i++) {
      const a = mesh(rbox(12, 150, 20, 5), mat);
      a.position.set(-it.w / 2 + 30 + i * ((it.w - 60) / 3), it.h + 70, -it.d / 2 + 10);
      a.rotation.z = (i - 1.5) * 0.12;
      g.add(a);
    }
  },
  speaker(it, g) {
    g.add(at(mesh(rbox(it.w, it.h, it.d, 14), std(it.color, 0.7)), 0, it.h / 2, 0));
    g.add(at(mesh(box(it.w * 0.84, it.h * 0.7, 1), std("#2f3135", 0.9)), 0, it.h / 2, it.d / 2 + 0.5));
  },
  charger(it, g) {
    const mat = std(it.color, 0.4);
    g.add(at(mesh(rbox(it.w, 12, it.d, 5), mat), 0, 6, 0));
    const up = mesh(rbox(it.w * 0.7, it.h, 16, 6), mat);
    up.rotation.x = -10 * DEG;
    g.add(at(up, 0, it.h / 2, -it.d * 0.15));
    const pad = mesh(cyl(30, 4, 32), std("#cfd0cc", 0.35));
    pad.rotation.x = Math.PI / 2 - 10 * DEG;
    g.add(at(pad, 0, it.h * 0.72, -it.d * 0.15 + 12));
  },
  tablet(it, g) {
    g.add(at(mesh(rbox(it.w * 0.8, 10, it.d * 0.7, 4), std("#222326", 0.5, 0.3)), 0, 5, 0));
    const tab = new THREE.Group();
    tab.rotation.x = -15 * DEG;
    tab.position.set(0, 18, 0);
    tab.add(at(mesh(rbox(it.w, it.h, 7, 6), std(it.color, 0.4)), 0, it.h / 2, 0));
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(it.w * 0.88, it.h * 0.9),
      new THREE.MeshBasicMaterial({ color: "#0e1118", toneMapped: false }),
    );
    tab.add(at(s, 0, it.h / 2, 3.7));
    g.add(tab);
  },
  glass(it, g) {
    const r = it.w / 2;
    g.add(at(mesh(cyl(r, it.h, 40, r * 0.9), std(it.color, 0.05, 0, { transparent: true, opacity: 0.28 }), false), 0, it.h / 2, 0));
    g.add(at(mesh(cyl(r * 0.92, it.h * 0.35, 40, r * 0.86), std("#7a4a1c", 0.2, 0, { transparent: true, opacity: 0.75 }), false), 0, it.h * 0.18, 0));
  },
  deskMat(it, g, ctx) {
    const edge = std("#1d1d1d", 0.9);
    const top = std("#ffffff", 0.85, 0, { map: ctx.topo });
    const m = mesh(box(it.w, it.h, it.d), [edge, edge, top, edge, edge, edge]);
    m.castShadow = false;
    g.add(at(m, 0, it.h / 2, 0));
  },
  box(it, g) {
    g.add(at(mesh(rbox(it.w, it.h, it.d, 6), std(it.color, 0.6)), 0, it.h / 2, 0));
  },
};

export class ItemView {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly key: string;
  readonly pickables: THREE.Mesh[];
  private readonly frame: THREE.LineSegments;
  private readonly frameMat = new THREE.LineBasicMaterial({ color: "#ff6b35", depthTest: false, transparent: true });

  static keyOf(it: DeskItem): string {
    return JSON.stringify([it.kind, it.w, it.h, it.d, it.color]);
  }

  constructor(it: DeskItem, topo: THREE.Texture) {
    this.id = it.id;
    this.key = ItemView.keyOf(it);
    const body = new THREE.Group();
    builders[it.kind](it, body, { topo });
    this.root.add(body);
    this.pickables = tagPick(body, { kind: "item", id: it.id, part: "item" });
    const bh = itemBoundsHeight(it.kind, it.h, it.d);
    this.frame = new THREE.LineSegments(new THREE.EdgesGeometry(box(it.w + 14, bh + 14, it.d + 14)), this.frameMat);
    this.frame.position.y = bh / 2;
    this.frame.renderOrder = 10;
    this.root.add(this.frame);
  }

  apply(it: DeskItem): void {
    this.root.position.set(it.x, it.elevation, it.z);
    this.root.rotation.y = it.rotY * DEG;
    this.root.visible = it.visible;
  }

  setState(selected: boolean, colliding: boolean): void {
    this.frame.visible = selected || colliding;
    this.frameMat.color.set(colliding ? "#ff3b3b" : "#ff6b35");
  }

  dispose(): void {
    disposeTree(this.root);
  }
}
