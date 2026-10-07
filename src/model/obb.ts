import type { OBB, Vec3 } from "./types";
import { add, cross, dot, mul, sub } from "./vec";

export function obbCorners(o: OBB): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        out.push(
          add(add(add(o.c, mul(o.u[0], sx * o.e[0])), mul(o.u[1], sy * o.e[1])), mul(o.u[2], sz * o.e[2])),
        );
      }
  return out;
}

/** Ayırma ekseni teoremi (15 eksen). Değme çakışma sayılır. */
export function obbIntersects(a: OBB, b: OBB): boolean {
  const t = sub(b.c, a.c);
  const axes: Vec3[] = [...a.u, ...b.u];
  for (const ua of a.u) for (const ub of b.u) axes.push(cross(ua, ub));
  for (const l of axes) {
    if (dot(l, l) < 1e-9) continue;
    const ra = a.e[0] * Math.abs(dot(a.u[0], l)) + a.e[1] * Math.abs(dot(a.u[1], l)) + a.e[2] * Math.abs(dot(a.u[2], l));
    const rb = b.e[0] * Math.abs(dot(b.u[0], l)) + b.e[1] * Math.abs(dot(b.u[1], l)) + b.e[2] * Math.abs(dot(b.u[2], l));
    if (Math.abs(dot(t, l)) > ra + rb) return false;
  }
  return true;
}
