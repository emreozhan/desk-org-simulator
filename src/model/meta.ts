import type { ItemKind, JointName } from "./types";

export const JOINT_META: Record<JointName, { label: string; hint: string; view: "top" | "side" | "front" }> = {
  shoulder: { label: "Omuz dönüşü", hint: "Alt kolun kolon etrafında yatay dönüşü", view: "top" },
  elbow: { label: "Dirsek dönüşü", hint: "Gazlı ön kolun alt kola göre yatay dönüşü", view: "top" },
  lift: { label: "Kaldırma", hint: "Gaz pistonlu ön kolun dikey açısı", view: "side" },
  swivel: { label: "Baş dönüşü", hint: "Monitör başlığının sağ-sol dönüşü", view: "top" },
  tilt: { label: "Eğim", hint: "+ ekran yukarı, − ekran aşağı bakar", view: "side" },
  roll: { label: "Döndürme", hint: "90° = dikey (portre)", view: "front" },
};

export const ITEM_META: Record<ItemKind, { label: string; w: number; h: number; d: number; color: string }> = {
  keyboard: { label: "Klavye", w: 325, h: 36, d: 122, color: "#2a2b2f" },
  mouse: { label: "Fare", w: 64, h: 40, d: 118, color: "#1d1e21" },
  laptop: { label: "Dizüstü", w: 312, h: 15, d: 221, color: "#a3acb6" },
  pcCase: { label: "Bilgisayar kasası", w: 230, h: 466, d: 453, color: "#e9e8e4" },
  router: { label: "Modem", w: 285, h: 50, d: 185, color: "#161616" },
  speaker: { label: "Hoparlör", w: 200, h: 66, d: 60, color: "#232427" },
  charger: { label: "Şarj standı", w: 90, h: 150, d: 90, color: "#efefec" },
  tablet: { label: "Tablet standı", w: 140, h: 200, d: 100, color: "#1a1a1a" },
  glass: { label: "Bardak", w: 80, h: 100, d: 80, color: "#dfe8ee" },
  deskMat: { label: "Masa pedi", w: 1150, h: 3, d: 440, color: "#eeece6" },
  box: { label: "Kutu", w: 200, h: 100, d: 200, color: "#8a8f98" },
};

/** Çarpışma ve seçim çerçevesi için gerçek yükseklik (açık kapak, anten vb.). */
export function itemBoundsHeight(kind: ItemKind, h: number, d: number): number {
  if (kind === "laptop") return h + d * Math.sin((75 * Math.PI) / 180);
  if (kind === "router") return h + 140;
  return h;
}
