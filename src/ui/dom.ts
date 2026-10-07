type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Küçük DOM yardımcısı: on* anahtarları dinleyici, class/text kısayol, gerisi özellik/öznitelik. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "text") el.textContent = String(v);
    else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const SVG = "http://www.w3.org/2000/svg";
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export const fmt = (v: number, digits = 0): string => {
  const r = v.toFixed(digits);
  return r === "-0" || /^-0\.0+$/.test(r) ? r.slice(1) : r;
};

/** Eksi işareti tipografik (−). */
export const signed = (v: number, digits = 0, unit = ""): string => {
  const r = fmt(Math.abs(v), digits);
  return `${v < 0 && r !== fmt(0, digits) ? "−" : ""}${r}${unit}`;
};
