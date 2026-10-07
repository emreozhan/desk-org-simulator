import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const std = (color: string, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

/** Yuvarlatılmış kutu; yarıçap en kısa kenarın yarısını aşmaz. */
export function rbox(w: number, h: number, d: number, radius: number, segments = 3): THREE.BufferGeometry {
  const r = Math.max(0.1, Math.min(radius, Math.min(w, h, d) / 2 - 0.01));
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);

export function cyl(r: number, h: number, segs = 32, rBottom = r): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, rBottom, h, segs);
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Nesne ağacındaki tüm geometri ve malzemeleri serbest bırakır (paylaşılan dokular hariç). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

/** Seçim için mesh'leri etiketler. */
export function tagPick(root: THREE.Object3D, pick: PickTag): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.userData.pick = pick;
      out.push(o as THREE.Mesh);
    }
  });
  return out;
}

export interface PickTag {
  kind: "arm" | "item";
  id: string;
  part: "monitor" | "arm" | "base" | "item";
}
