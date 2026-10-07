import type { Layout } from "./types";

const KEY = "masa-atolyesi:layout";
const SLOTS = "masa-atolyesi:slots";
const OPTIONS = "masa-atolyesi:options";

interface Envelope {
  version: 1;
  layout: Layout;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Sürümlü zarf veya çıplak düzen kabul eder; şema uymazsa null. */
export function parseLayout(raw: unknown): Layout | null {
  const l = isObj(raw) && "layout" in raw ? raw.layout : raw;
  if (!isObj(l) || l.version !== 1 || !isObj(l.desk) || !isObj(l.viewer)) return null;
  if (!Array.isArray(l.arms) || !Array.isArray(l.items)) return null;
  const armsOk = l.arms.every((a) => isObj(a) && isObj(a.pose) && isObj(a.geometry) && isObj(a.limits) && isObj(a.base));
  return armsOk ? (l as unknown as Layout) : null;
}

export const envelope = (layout: Layout): Envelope => ({ version: 1, layout });

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Gizli pencere / kota: kayıt olmadan da çalışır.
  }
}

export const loadLayout = (): Layout | null => parseLayout(read(KEY));
export const saveLayout = (layout: Layout): void => write(KEY, envelope(layout));

export function loadSlots(): Record<string, Layout> {
  const raw = read(SLOTS);
  const out: Record<string, Layout> = {};
  if (isObj(raw))
    for (const [k, v] of Object.entries(raw)) {
      const l = parseLayout(v);
      if (l) out[k] = l;
    }
  return out;
}
export const saveSlots = (slots: Record<string, Layout>): void => write(SLOTS, slots);

export function loadOptions<T extends object>(fallback: T): T {
  const raw = read(OPTIONS);
  return isObj(raw) ? { ...fallback, ...(raw as Partial<T>) } : fallback;
}
export const saveOptions = (o: object): void => write(OPTIONS, o);
