// Kısayolların tek kaynağı: klavye işleyicisi, panel rozetleri, kısayol listesi ve duvar posteri buradan okur.
import type { JointName } from "../model/types";

/** Sol tuş azaltır, sağ tuş artırır (panel kaydırıcısıyla aynı yön). Döndürme R ile yatay ↔ dikey. */
export const JOINT_KEYS: Record<JointName, { dec: string; inc: string } | null> = {
  shoulder: { dec: "A", inc: "D" },
  elbow: { dec: "C", inc: "V" },
  lift: { dec: "S", inc: "W" },
  swivel: { dec: "Q", inc: "E" },
  tilt: { dec: "Z", inc: "X" },
  roll: null,
};

export const JOINT_STEP = 5;
export const ITEM_ROT_STEP = 15;
export const FINE_STEP = 1;
export const MOVE_STEP = 10;

/** Tuş kodu → [eklem, yön]. */
export const JOINT_BY_CODE: Record<string, [JointName, 1 | -1]> = Object.fromEntries(
  (Object.entries(JOINT_KEYS) as [JointName, { dec: string; inc: string } | null][]).flatMap(([j, k]) =>
    k ? [[`Key${k.dec}`, [j, -1]], [`Key${k.inc}`, [j, 1]]] : [],
  ),
);

export interface ShortcutRow {
  keys: string;
  does: string;
}

export const SHORTCUTS: { group: string; rows: ShortcutRow[] }[] = [
  {
    group: "Monitör (kol seçili)",
    rows: [
      { keys: "A / D", does: "Omuz dönüşü ±5°" },
      { keys: "C / V", does: "Dirsek dönüşü ±5°" },
      { keys: "S / W", does: "Kaldırma ±5°" },
      { keys: "Q / E", does: "Baş dönüşü ±5°" },
      { keys: "Z / X", does: "Eğim ±5°" },
      { keys: "R", does: "Döndürme: yatay ↔ dikey" },
      { keys: "0", does: "Düz bak: karşıya, eğim 0" },
      { keys: "← → ↑ ↓", does: "VESA X / Z ±10 mm" },
      { keys: "PgUp / PgDn", does: "VESA Y ±10 mm" },
    ],
  },
  {
    group: "Nesne seçili",
    rows: [
      { keys: "← → ↑ ↓", does: "X / Z ±10 mm" },
      { keys: "PgUp / PgDn", does: "Taban yüksekliği ±10 mm" },
      { keys: "Q / E", does: "Dönüş ±15°" },
      { keys: "R", does: "Dönüş +90° (Shift: −90°)" },
      { keys: "0", does: "Dönüşü sıfırla" },
      { keys: "Del", does: "Sil" },
    ],
  },
  {
    group: "Genel",
    rows: [
      { keys: "Shift + tuş", does: "İnce adım: 1° / 1 mm" },
      { keys: "Shift + sürükle", does: "Monitörü öne-arkaya taşı" },
      { keys: "1 – 5", does: "Kamera: persp., ön, üst, yan, göz" },
      { keys: "F", does: "Seçime odaklan" },
      { keys: "Ctrl+Z / Ctrl+Y", does: "Geri al / yinele" },
      { keys: "Esc", does: "Seçimi kaldır" },
    ],
  },
];

export interface PulseDetail {
  /** Paneldeki `data-pulse` değeri, ör. "joint:swivel", "vesa:x", "item:rotY". */
  target: string;
  /** Basılan tuşun rozet etiketi, ör. "Q". */
  key: string;
}

/** Kısayolun değiştirdiği paneli kısa süre vurgular. */
export const pulse = (target: string, key: string): void => {
  window.dispatchEvent(new CustomEvent<PulseDetail>("sim:pulse", { detail: { target, key } }));
};
