// Sahnedeki boyut tutamakları: bir yüz sürüklenir, karşı yüz yerinde kalır.
import type { DeskItem, Vec3 } from "./types";
import { itemBoundsHeight } from "./meta";
import { DEG, dot, rotY, sub, vec } from "./vec";

export type HandleId = "x+" | "x-" | "z+" | "z-" | "y+";
export const HANDLES: HandleId[] = ["x+", "x-", "z+", "z-", "y+"];
export const MIN_SIZE = 5;

export type ItemSize = Pick<DeskItem, "x" | "z" | "w" | "d" | "h">;

/** Tutamağın nesneye göre yerel konumu (nesne tabanı merkezine göre, dönmeden önce). */
export function handleLocal(it: Pick<DeskItem, "kind" | "w" | "h" | "d">, handle: HandleId): Vec3 {
  const hb = itemBoundsHeight(it.kind, it.h, it.d);
  if (handle === "y+") return vec(0, hb, 0);
  const s = handle[1] === "+" ? 1 : -1;
  return handle[0] === "x" ? vec((s * it.w) / 2, hb / 2, 0) : vec(0, hb / 2, (s * it.d) / 2);
}

/**
 * `start`: sürükleme başındaki nesne, `p`: tutamağın yeni dünya konumu.
 * Yan tutamaklar genişlik/derinliği değiştirir ve merkezi kaydırır; üst tutamak yüksekliği değiştirir.
 */
export function resizeItem(start: DeskItem, handle: HandleId, p: Vec3, snap: (v: number) => number = (v) => v): ItemSize {
  const out: ItemSize = { x: start.x, z: start.z, w: start.w, d: start.d, h: start.h };
  if (handle === "y+") {
    const extra = itemBoundsHeight(start.kind, start.h, start.d) - start.h;
    out.h = Math.max(MIN_SIZE, snap(p.y - start.elevation - extra));
    return out;
  }
  const a = start.rotY * DEG;
  const isX = handle[0] === "x";
  const sign = handle[1] === "+" ? 1 : -1;
  const axis = isX ? rotY(vec(1, 0, 0), a) : rotY(vec(0, 0, 1), a);
  const size0 = isX ? start.w : start.d;
  // Merkezden tutamak yönünde uzaklık + karşı yarı = yeni ölçü.
  const reach = dot(sub(p, vec(start.x, p.y, start.z)), axis) * sign;
  const size = Math.max(MIN_SIZE, snap(reach + size0 / 2));
  const shift = ((size - size0) / 2) * sign;
  out.x = start.x + axis.x * shift;
  out.z = start.z + axis.z * shift;
  if (isX) out.w = size;
  else out.d = size;
  return out;
}
