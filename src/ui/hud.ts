// Görüntü alanı üstündeki katman: kamera araç çubuğu, ergonomi kartı, durum çubuğu.
import * as THREE from "three";
import type { Analysis, Level } from "../model/analysis";
import type { ChangeReason, Store } from "../app/store";
import type { World } from "../scene/world";
import { forward } from "../model/kinematics";
import { fmt, h, signed } from "./dom";

type Preset = "persp" | "front" | "top" | "side" | "eye";
const PRESETS: [Preset, string, string][] = [
  ["persp", "Perspektif", "1"],
  ["front", "Ön", "2"],
  ["top", "Üst", "3"],
  ["side", "Yan", "4"],
  ["eye", "Göz", "5"],
];

const LEVEL_TEXT: Record<Level, string> = { ok: "uygun", warn: "dikkat", bad: "sorun" };

export class Hud {
  private readonly store: Store;
  private readonly world: World;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly ergo: HTMLElement;
  private readonly status: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly notice: HTMLElement;
  private analysis: Analysis | null = null;
  private noticeTimer = 0;
  private ergoKey = "";

  constructor(viewport: HTMLElement, store: Store, world: World) {
    this.store = store;
    this.world = world;
    const views = h("div", { class: "seg", role: "group", "aria-label": "Kamera" });
    for (const [id, label, key] of PRESETS)
      views.append(h("button", { type: "button", class: "seg__btn", text: label, title: `${label} görünüm (${key})`, onclick: () => this.view(id) }));
    this.undoBtn = h("button", { type: "button", class: "seg__btn", text: "↶ Geri", title: "Geri al (Ctrl+Z)", onclick: () => store.undo() });
    this.redoBtn = h("button", { type: "button", class: "seg__btn", text: "İleri ↷", title: "Yinele (Ctrl+Y)", onclick: () => store.redo() });
    viewport.append(
      h("div", { class: "toolbar" }, views, h("div", { class: "seg", role: "group", "aria-label": "Geçmiş" }, this.undoBtn, this.redoBtn)),
    );
    this.ergo = h("div", { class: "ergo", "aria-live": "polite" });
    viewport.append(this.ergo);
    this.hint = h("span", { class: "status__hint" });
    this.status = h("span", { class: "status__hits" });
    this.notice = h("span", { class: "status__notice" });
    viewport.append(h("div", { class: "status" }, this.hint, this.notice, this.status));

    window.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const p = PRESETS.find(([, , k]) => k === e.key);
      if (p) this.view(p[0]);
      if (e.code === "KeyF") this.focus();
    });
  }

  update(reason: ChangeReason, a: Analysis): void {
    this.analysis = a;
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
    this.renderErgo(a);
    this.renderStatus(a);
    if (reason === "notice" && this.store.notice) {
      this.notice.textContent = this.store.notice.text;
      this.notice.classList.add("is-on");
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = window.setTimeout(() => this.notice.classList.remove("is-on"), 3200);
    }
  }

  private renderErgo(a: Analysis): void {
    const rows = [...a.arms.values()].filter((x) => x.ergo);
    const key = rows.map((x) => x.arm.id + x.arm.name).join("|");
    if (key !== this.ergoKey) {
      this.ergoKey = key;
      this.ergo.replaceChildren(
        h("div", { class: "ergo__title" }, h("span", { text: "Ergonomi" }), h("span", { class: "ergo__sub", text: "göz noktasından" })),
        ...rows.map((x) =>
          h(
            "div",
            { class: "ergo__row", "data-id": x.arm.id },
            h("span", { class: "ergo__name" }),
            h("span", { class: "ergo__cell", "data-k": "distance" }),
            h("span", { class: "ergo__cell", "data-k": "vAngle" }),
            h("span", { class: "ergo__cell", "data-k": "offAxis" }),
          ),
        ),
      );
      this.ergo.hidden = rows.length === 0;
    }
    for (const x of rows) {
      const row = this.ergo.querySelector<HTMLElement>(`[data-id="${x.arm.id}"]`);
      if (!row) continue;
      const e = x.ergo!;
      row.querySelector(".ergo__name")!.textContent = x.arm.name;
      const set = (k: keyof typeof e.levels, text: string, title: string): void => {
        const c = row.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
        c.textContent = text;
        c.dataset.level = e.levels[k];
        c.title = `${title}: ${LEVEL_TEXT[e.levels[k]]}`;
      };
      set("distance", `${fmt(e.distance / 10)} cm`, "Göze mesafe");
      set("vAngle", `${signed(e.vAngle, 0, "°")} dikey`, "Ekran merkezine bakış açısı (− aşağı)");
      set("offAxis", `${fmt(e.offAxis)}° sapma`, "Bakış ile ekran normali arası");
    }
  }

  private renderStatus(a: Analysis): void {
    const sel = this.store.selection;
    this.hint.textContent =
      sel?.kind === "arm"
        ? "Monitörü sürükle · Shift: öne-arkaya · oklar/PgUp: 10 mm · tabanı sürükle: kelepçeyi taşı"
        : sel?.kind === "item"
          ? "Sürükle: taşı · Q/E: döndür · Del: sil"
          : "Bir monitöre ya da nesneye tıkla · sol tuş: döndür · sağ tuş: kaydır · tekerlek: yakınlaş";
    const n = a.collisions.length;
    this.status.dataset.level = n ? "bad" : "ok";
    if (!n) this.status.textContent = "Çakışma yok";
    else {
      const first = a.collisions.slice(0, 2).map((c) => `${c.a} ↔ ${c.b}`).join(" · ");
      this.status.textContent = `${n} çakışma: ${first}${n > 2 ? ` · +${n - 2}` : ""}`;
    }
  }

  private screensCenter(): THREE.Vector3 {
    const a = this.analysis;
    const sel = this.store.selection;
    const pts = a
      ? [...a.arms.values()].filter((x) => x.monitor && (!sel || sel.kind !== "arm" || sel.id === x.arm.id)).map((x) => x.monitor!.screen)
      : [];
    if (!pts.length) return new THREE.Vector3(0, 300, -150);
    const c = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y, z: s.z + p.z }), { x: 0, y: 0, z: 0 });
    return new THREE.Vector3(c.x / pts.length, c.y / pts.length, c.z / pts.length);
  }

  view(p: Preset): void {
    const c = this.screensCenter();
    const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
    const v = this.store.layout.viewer;
    const shots: Record<Preset, [THREE.Vector3, THREE.Vector3]> = {
      persp: [V(1150, 950, 1850), V(0, 300, -120)],
      front: [V(c.x, c.y, 2300), V(c.x, c.y, c.z)],
      top: [V(0, 2900, 120), V(0, 0, -60)],
      side: [V(2500, 420, -100), V(0, 420, -100)],
      eye: [V(v.x, v.y, v.z), c],
    };
    const [pos, target] = shots[p];
    // OrbitControls hedefle konum çakışmasın: göz görünümünde hedefe doğru çok az ilerle.
    if (p === "eye") pos.lerp(target, 0.001);
    this.world.flyTo(pos, target, p === "eye" ? 62 : 38);
  }

  focus(): void {
    const s = this.store;
    let t: THREE.Vector3 | null = null;
    const arm = s.selectedArm();
    const it = s.selectedItem();
    if (arm) {
      const p = this.analysis?.arms.get(arm.id)?.monitor?.screen ?? forward(arm).plate;
      t = new THREE.Vector3(p.x, p.y, p.z);
    } else if (it) t = new THREE.Vector3(it.x, it.elevation + it.h / 2, it.z);
    if (!t) return;
    const cam = this.world.camera.position;
    const dir = cam.clone().sub(this.world.controls.target).normalize();
    this.world.flyTo(t.clone().add(dir.multiplyScalar(1100)), t, this.world.camera.fov);
  }
}
