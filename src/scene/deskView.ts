import * as THREE from "three";
import type { DeskSpec } from "../model/types";
import { at, box, mesh, std } from "./parts";

/** Masa, ayaklar, zemin ve arka duvar. Orijin masa üstünün merkezi. */
export function buildRoom(desk: DeskSpec, wood: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const { width: W, depth: D, height: H, thickness: T } = desk;
  const wallZ = -D / 2 - desk.wallGap;

  const woodMat = std("#ffffff", 0.55, 0, { map: wood });
  const edgeMat = std("#1f1611", 0.6);
  const top = mesh(box(W, T, D), [edgeMat, edgeMat, woodMat, edgeMat, edgeMat, edgeMat]);
  top.position.y = -T / 2;
  g.add(top);

  const frame = std("#17181a", 0.45, 0.6);
  const legH = H - T;
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 70);
    for (const sz of [-1, 1]) g.add(at(mesh(box(50, legH, 50), frame), x, -T - legH / 2, sz * (D / 2 - 60)));
    g.add(at(mesh(box(60, 30, D - 80), frame), x, -T - legH + 15, 0));
    g.add(at(mesh(box(50, 40, D - 120), frame), x, -T - 20, 0));
  }
  g.add(at(mesh(box(W - 140, 60, 30), frame), 0, -T - 30, -D / 2 + 60));

  const floor = mesh(new THREE.PlaneGeometry(9000, 9000), std("#3a302a", 0.9), false);
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -H;
  g.add(floor);

  const wallH = H + 2000;
  const wall = mesh(new THREE.PlaneGeometry(9000, wallH), std("#d8d2c9", 0.95), false);
  wall.receiveShadow = true;
  wall.position.set(0, -H + wallH / 2, wallZ);
  g.add(wall);
  g.add(at(mesh(box(9000, 80, 14), std("#ece8e1", 0.7), false), 0, -H + 40, wallZ + 7));

  // Duvardaki priz (fotoğrafta sağ üstte)
  g.add(at(mesh(box(80, 80, 10), std("#f1efe9", 0.5)), W / 2 - 40, 980, wallZ + 5));
  return g;
}
