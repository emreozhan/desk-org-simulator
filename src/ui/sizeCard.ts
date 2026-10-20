// Görüntü alanının sağ üstündeki boyut kartı: tıklanan nesnenin, monitörün/kolun veya masanın ölçüleri.
import type { Store } from "../app/store";
import type { Arm, DeskItem, DeskSpec, MonitorSpec } from "../model/types";
import { ASPECTS, ITEM_META } from "../model/meta";
import { monitorDims } from "../model/kinematics";
import { MIN_SIZE } from "../model/resize";
import { fmt, h } from "./dom";

interface NumField {
  label: string;
  unit: string;
  step: number;
  min: number;
  max?: number;
  digits?: number;
  get: () => number;
  set: (v: number) => void;
  hint?: string;
}

export class SizeCard {
  private readonly store: Store;
  private readonly root: HTMLElement;
  private refreshers: Array<() => void> = [];
  private key = "";
  /** Nesne ölçülerini birlikte ölçekle. */
  private lockRatio = false;

  constructor(viewport: HTMLElement, store: Store) {
    this.store = store;
    this.root = h("section", { class: "size-card", "aria-label": "Boyutlar", hidden: true });
    viewport.append(this.root);
  }

  update(): void {
    const sel = this.store.selection;
    const arm = this.store.selectedArm();
    const key = JSON.stringify([sel, arm ? !!arm.monitor : null]);
    if (key !== this.key) {
      this.key = key;
      this.render();
    }
    for (const r of this.refreshers) r();
  }

  private render(): void {
    this.refreshers = [];
    const sel = this.store.selection;
    this.root.replaceChildren();
    this.root.hidden = !sel;
    if (!sel) return;
    if (sel.kind === "item") this.renderItem(sel.id);
    else if (sel.kind === "arm") this.renderArm(sel.id);
    else this.renderDesk();
  }

  // ── yapı taşları ─────────────────────────────────────────────

  private head(title: () => string, sub: string): HTMLElement {
    const t = h("h2", { class: "size-card__title" });
    this.refreshers.push(() => {
      t.textContent = title();
    });
    return h("header", { class: "size-card__head" }, t, h("span", { class: "size-card__sub", text: sub }));
  }

  private group(title: string, ...rows: HTMLElement[]): HTMLElement {
    return h("div", { class: "size-card__group" }, h("h3", { class: "size-card__group-title", text: title }), ...rows);
  }

  /** −/+ düğmeli sayı alanı; tekerlek ile de adımlanır (Shift: ince adım). */
  private num(f: NumField): HTMLElement {
    const clampV = (v: number): number => Math.min(f.max ?? Infinity, Math.max(f.min, v));
    const input = h("input", { type: "number", class: "num size-card__num", step: String(f.step), inputmode: "decimal", "aria-label": f.label });
    const apply = (v: number, commit: boolean): void => {
      if (!Number.isFinite(v)) return;
      const c = clampV(v);
      if (commit) this.store.act(() => f.set(c));
      else this.store.mutate(() => f.set(c));
    };
    input.addEventListener("input", () => apply(parseFloat(input.value), false));
    input.addEventListener("change", () => {
      this.store.commit();
      input.value = fmt(f.get(), f.digits ?? 0);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
    const stepBy = (dir: number, fine: boolean): void => {
      const step = fine ? Math.max(f.step / 5, 0.1) : f.step;
      apply(Math.round((f.get() + dir * step) / step) * step, true);
    };
    const wrap = h("div", { class: "size-card__ctl" });
    wrap.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        stepBy(e.deltaY < 0 ? 1 : -1, e.shiftKey);
      },
      { passive: false },
    );
    wrap.append(
      h("button", { type: "button", class: "size-card__step", text: "−", "aria-label": `${f.label} azalt`, onclick: (e: MouseEvent) => stepBy(-1, e.shiftKey) }),
      input,
      h("button", { type: "button", class: "size-card__step", text: "+", "aria-label": `${f.label} artır`, onclick: (e: MouseEvent) => stepBy(1, e.shiftKey) }),
      h("span", { class: "field__unit", text: f.unit }),
    );
    this.refreshers.push(() => {
      if (document.activeElement !== input) input.value = fmt(f.get(), f.digits ?? 0);
    });
    return h("label", { class: "size-card__row", title: f.hint }, h("span", { class: "size-card__label", text: f.label }), wrap);
  }

  private note(text: string): HTMLElement {
    return h("p", { class: "size-card__note", text });
  }

  // ── nesne ────────────────────────────────────────────────────

  private renderItem(id: string): void {
    const I = (): DeskItem => this.store.item(id)!;
    /** Oran kilitliyse diğer iki ölçü aynı katsayıyla değişir. */
    const setDim = (key: "w" | "d" | "h", v: number): void => {
      const it = I();
      if (this.lockRatio && it[key] > 0) {
        const k = v / it[key];
        for (const o of ["w", "d", "h"] as const) it[o] = Math.max(MIN_SIZE, it[o] * k);
      }
      it[key] = v;
    };
    const dim = (key: "w" | "d" | "h", label: string): HTMLElement =>
      this.num({ label, unit: "mm", step: 5, min: MIN_SIZE, max: 5000, get: () => I()[key], set: (v) => setDim(key, v) });
    const lock = h("input", { type: "checkbox", class: "switch__input" });
    lock.checked = this.lockRatio;
    lock.addEventListener("change", () => (this.lockRatio = lock.checked));
    this.root.append(
      this.head(() => I().name, ITEM_META[I().kind].label),
      dim("w", "Genişlik"),
      dim("d", "Derinlik"),
      dim("h", "Yükseklik"),
      h(
        "div",
        { class: "size-card__actions" },
        h("label", { class: "switch" }, lock, h("span", { class: "switch__track", "aria-hidden": "true" }), h("span", { text: "Oranı koru" })),
        h("button", {
          type: "button",
          class: "btn btn--ghost",
          text: "Varsayılan",
          title: "Bu nesne türünün varsayılan ölçülerine dön",
          onclick: () =>
            this.store.act(() => {
              const it = I();
              const m = ITEM_META[it.kind];
              Object.assign(it, { w: m.w, d: m.d, h: m.h });
            }),
        }),
      ),
      this.note("Sahnedeki turuncu tutamakları sürükleyerek de boyutlandırabilirsin; karşı yüz yerinde kalır."),
    );
  }

  // ── monitör ve kol ───────────────────────────────────────────

  private renderArm(id: string): void {
    const A = (): Arm => this.store.arm(id)!;
    const groups: HTMLElement[] = [];
    if (A().monitor) {
      const M = (): MonitorSpec => A().monitor!;
      const aspect = h("select", { class: "sel size-card__sel", "aria-label": "En-boy oranı" }, ...ASPECTS.map(([k]) => h("option", { value: k, text: k })));
      aspect.addEventListener("change", () =>
        this.store.act(() => {
          const a = ASPECTS.find(([k]) => k === aspect.value)!;
          M().aspectW = a[1];
          M().aspectH = a[2];
        }),
      );
      const outer = h("span", { class: "size-card__readout" });
      this.refreshers.push(() => {
        const m = M();
        aspect.value = ASPECTS.find(([, w, hh]) => w === m.aspectW && hh === m.aspectH)?.[0] ?? "16:9";
        const d = monitorDims(m);
        outer.textContent = `${fmt(d.outerW)} × ${fmt(d.outerH)} mm`;
      });
      groups.push(
        this.group(
          "Monitör",
          this.num({ label: "Köşegen", unit: "inç", step: 0.5, min: 10, max: 65, digits: 1, get: () => M().diagonalIn, set: (v) => (M().diagonalIn = v) }),
          h("label", { class: "size-card__row" }, h("span", { class: "size-card__label", text: "En-boy" }), h("div", { class: "size-card__ctl" }, aspect)),
          this.num({ label: "Derinlik", unit: "mm", step: 5, min: 5, max: 300, get: () => M().depth, set: (v) => (M().depth = v) }),
          this.num({ label: "Alt çerçeve", unit: "mm", step: 1, min: 0, max: 100, get: () => M().bezelBottom, set: (v) => (M().bezelBottom = v) }),
          h("div", { class: "size-card__row" }, h("span", { class: "size-card__label", text: "Dış ölçü" }), outer),
        ),
      );
    }
    const G = (): Arm["geometry"] => A().geometry;
    groups.push(
      this.group(
        "Kol",
        this.num({ label: "Kolon", unit: "mm", step: 10, min: 40, max: 1500, get: () => G().columnHeight, set: (v) => (G().columnHeight = v), hint: "Masa üstünden omuz eklemine" }),
        this.num({ label: "Alt kol", unit: "mm", step: 5, min: 20, max: 1000, get: () => G().lowerLength, set: (v) => (G().lowerLength = v) }),
        this.num({ label: "Gazlı ön kol", unit: "mm", step: 5, min: 20, max: 1000, get: () => G().upperLength, set: (v) => (G().upperLength = v) }),
      ),
    );
    this.root.append(this.head(() => A().name, A().monitor ? "monitör ve kol" : "kol"), ...groups);
  }

  // ── masa ─────────────────────────────────────────────────────

  private renderDesk(): void {
    const D = (): DeskSpec => this.store.layout.desk;
    const n = (key: keyof DeskSpec, label: string, min: number, step = 10): HTMLElement =>
      this.num({ label, unit: "mm", step, min, max: 4000, get: () => D()[key], set: (v) => (D()[key] = v) });
    this.root.append(
      this.head(() => "Masa", `${fmt(D().width / 10)} × ${fmt(D().depth / 10)} cm`),
      n("width", "Genişlik", 400),
      n("depth", "Derinlik", 300),
      n("height", "Yerden yükseklik", 400),
      n("thickness", "Kalınlık", 10, 1),
      n("wallGap", "Duvar boşluğu", 0, 5),
    );
  }
}
