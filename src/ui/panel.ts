// Sağ panel: kol eklemleri, VESA hedefi, ölçüler, nesneler, ortam ve kayıtlı düzenler.
import type { Analysis, Level } from "../model/analysis";
import { wallZ } from "../model/analysis";
import type { ChangeReason, Store, ViewOptions } from "../app/store";
import type { Arm, DeskItem, ItemKind, JointName, MonitorSpec, ScreenStyle } from "../model/types";
import { ITEM_KINDS, JOINTS } from "../model/types";
import { ASPECTS, ITEM_META, JOINT_META } from "../model/meta";
import { aimAt, forward, reachInfo, solveIK } from "../model/kinematics";
import { monitor27 } from "../model/defaults";
import { clamp } from "../model/vec";
import { envelope, loadSlots, parseLayout, saveSlots } from "../model/storage";
import { fmt, h, s, signed } from "./dom";
import type { PulseDetail } from "../app/shortcuts";
import { JOINT_KEYS, SHORTCUTS } from "../app/shortcuts";

type Tab = "arms" | "items" | "env" | "layout";
const TABS: [Tab, string][] = [
  ["arms", "Kollar"],
  ["items", "Nesneler"],
  ["env", "Ortam"],
  ["layout", "Düzen"],
];

interface NumOpts {
  step?: number;
  digits?: number;
  /** false: değer yalnız Enter/odak kaybında uygulanır (ters kinematik alanları). */
  live?: boolean;
}

type Child = Node | string | null | undefined | false;


const SCREENS: [ScreenStyle, string][] = [
  ["code", "Kod editörü"],
  ["game", "Oyun"],
  ["blank", "Boş"],
];

/** Kadranda iğne ucu: üstten (yaw), yandan (kaldırma/eğim) veya önden (döndürme) bakış. */
function dialPoint(view: "top" | "side" | "front", deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  if (view === "top") return [Math.sin(a) * r, Math.cos(a) * r];
  if (view === "side") return [Math.cos(a) * r, -Math.sin(a) * r];
  return [-Math.sin(a) * r, -Math.cos(a) * r];
}

function arcPath(view: "top" | "side" | "front", lo: number, hi: number, r: number): string {
  const n = Math.max(2, Math.ceil((hi - lo) / 5));
  const pts = Array.from({ length: n + 1 }, (_, i) => dialPoint(view, lo + ((hi - lo) * i) / n, r));
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
}

export class Panel {
  private readonly store: Store;
  private readonly body: HTMLElement;
  private readonly tabBtns = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = "arms";
  private refreshers: Array<(a: Analysis) => void> = [];
  private key = "";
  private analysis: Analysis | null = null;
  private slotsVersion = 0;

  constructor(root: HTMLElement, store: Store) {
    this.store = store;
    const nav = h("nav", { class: "tabs", role: "tablist", "aria-label": "Panel" });
    for (const [id, label] of TABS) {
      const b = h("button", { class: "tab", role: "tab", type: "button", text: label, onclick: () => this.setTab(id) });
      this.tabBtns.set(id, b);
      nav.append(b);
    }
    this.body = h("div", { class: "panel__body" });
    window.addEventListener("sim:pulse", (e) => this.onPulse((e as CustomEvent<PulseDetail>).detail));
    root.append(
      h(
        "header",
        { class: "brand" },
        h("div", { class: "brand__mark", "aria-hidden": "true" }),
        h(
          "div",
          {},
          h("h1", { class: "brand__title", text: "Masa Atölyesi" }),
          h("p", { class: "brand__sub", text: "North Bayou F80 · kol ve masa simülatörü" }),
        ),
      ),
      nav,
      this.body,
    );
  }

  private setTab(t: Tab): void {
    this.tab = t;
    if (this.analysis) this.update("structure", this.analysis);
  }

  update(reason: ChangeReason, a: Analysis): void {
    this.analysis = a;
    if (reason === "selection") {
      const sel = this.store.selection;
      if (sel?.kind === "arm") this.tab = "arms";
      else if (sel?.kind === "item") this.tab = "items";
      else if (sel?.kind === "desk") this.tab = "env";
    }
    const key = this.structureKey();
    if (key !== this.key) {
      this.key = key;
      this.render();
    }
    for (const r of this.refreshers) r(a);
  }

  private structureKey(): string {
    const L = this.store.layout;
    const sel = this.store.selection;
    return JSON.stringify([
      this.tab,
      sel,
      L.arms.map((x) => [x.id, !!x.monitor]),
      L.items.map((x) => x.id),
      this.slotsVersion,
    ]);
  }

  private render(): void {
    this.refreshers = [];
    const scroll = this.body.scrollTop;
    this.body.replaceChildren();
    for (const [id, b] of this.tabBtns) {
      b.setAttribute("aria-selected", String(id === this.tab));
      b.classList.toggle("is-active", id === this.tab);
    }
    if (this.tab === "arms") this.renderArms();
    else if (this.tab === "items") this.renderItems();
    else if (this.tab === "env") this.renderEnv();
    else this.renderLayouts();
    this.body.scrollTop = scroll;
  }

  // ── yapı taşları ─────────────────────────────────────────────

  private num(get: () => number, set: (v: number) => void, o: NumOpts = {}): HTMLInputElement {
    const el = h("input", { type: "number", class: "num", step: String(o.step ?? 1), inputmode: "decimal" });
    const apply = (): void => {
      const v = parseFloat(el.value);
      if (Number.isFinite(v)) this.store.mutate(() => set(v));
    };
    if (o.live !== false) el.addEventListener("input", apply);
    el.addEventListener("change", () => {
      if (o.live === false) apply();
      this.store.commit();
      el.value = fmt(get(), o.digits ?? 0);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") el.blur();
    });
    this.refreshers.push(() => {
      if (document.activeElement !== el) el.value = fmt(get(), o.digits ?? 0);
    });
    return el;
  }

  private text(get: () => string, set: (v: string) => void): HTMLInputElement {
    const el = h("input", { type: "text", class: "txt", maxlength: "40" });
    el.addEventListener("input", () => this.store.mutate(() => set(el.value)));
    el.addEventListener("change", () => this.store.commit());
    this.refreshers.push(() => {
      if (document.activeElement !== el) el.value = get();
    });
    return el;
  }

  private select<T extends string>(options: [T, string][], get: () => T, set: (v: T) => void): HTMLSelectElement {
    const el = h("select", { class: "sel" }, ...options.map(([v, l]) => h("option", { value: v, text: l })));
    el.addEventListener("change", () => this.store.act(() => set(el.value as T)));
    this.refreshers.push(() => {
      el.value = get();
    });
    return el;
  }

  private field(label: string, input: HTMLElement, unit = "", hint?: string): HTMLElement {
    return h(
      "label",
      { class: "field", title: hint },
      h("span", { class: "field__label", text: label }),
      h("span", { class: "field__ctl" }, input, unit ? h("span", { class: "field__unit", text: unit }) : null),
    );
  }

  /** Klavye tuşu rozeti; basılınca `is-pressed` ile yanar. */
  private keycap(label: string, title?: string): HTMLElement {
    return h("kbd", { class: "key", "data-key": label, title, text: label });
  }

  /** Alanı bir kısayola bağlar: etiketin yanına tuş rozetleri, vurgulama için `data-pulse`. */
  private keyed(field: HTMLElement, target: string, keys: string[]): HTMLElement {
    field.dataset.pulse = target;
    const caps = h("span", { class: "keys-inline", "aria-hidden": "true" }, ...keys.map((k) => this.keycap(k)));
    field.querySelector(".field__label")?.append(caps);
    return field;
  }

  private onPulse(d: PulseDetail): void {
    const el = this.body.querySelector<HTMLElement>(`[data-pulse="${d.target}"]`);
    if (!el) return;
    el.classList.remove("is-pulse");
    void el.offsetWidth; // animasyonu yeniden başlat
    el.classList.add("is-pulse");
    for (const k of el.querySelectorAll<HTMLElement>(".key")) k.classList.toggle("is-pressed", k.dataset.key === d.key);
    window.clearTimeout(Number(el.dataset.pulseTimer));
    el.dataset.pulseTimer = String(
      window.setTimeout(() => {
        el.classList.remove("is-pulse");
        for (const k of el.querySelectorAll(".key")) k.classList.remove("is-pressed");
      }, 700),
    );
    const box = el.getBoundingClientRect();
    const view = this.body.getBoundingClientRect();
    if (box.top < view.top || box.bottom > view.bottom) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  private section(title: string, ...children: Child[]): HTMLElement {
    return h("section", { class: "sec" }, h("h2", { class: "sec__title" }, h("span", { text: title })), ...children);
  }

  private fold(title: string, ...children: Child[]): HTMLElement {
    return h("details", { class: "sec sec--fold" }, h("summary", { class: "sec__title" }, h("span", { text: title })), ...children);
  }

  private readout(label: string, get: (a: Analysis) => string, level?: (a: Analysis) => Level | null): HTMLElement {
    const v = h("span", { class: "ro__val" });
    const badge = h("span", { class: "ro__badge" });
    const row = h("div", { class: "ro" }, h("span", { class: "ro__label", text: label }), v, badge);
    this.refreshers.push((a) => {
      v.textContent = get(a);
      const l = level?.(a) ?? null;
      row.dataset.level = l ?? "";
      badge.textContent = l === "ok" ? "uygun" : l === "warn" ? "dikkat" : l === "bad" ? "sorun" : "";
    });
    return row;
  }

  private toggle(label: string, get: () => boolean, set: (v: boolean) => void, hint?: string): HTMLElement {
    const el = h("input", { type: "checkbox", class: "switch__input" });
    el.addEventListener("change", () => set(el.checked));
    this.refreshers.push(() => {
      el.checked = get();
    });
    return h("label", { class: "switch", title: hint }, el, h("span", { class: "switch__track", "aria-hidden": "true" }), h("span", { text: label }));
  }

  private button(label: string, onClick: () => void, cls = "btn", hint?: string): HTMLButtonElement {
    return h("button", { type: "button", class: cls, text: label, title: hint, onclick: onClick });
  }

  private joint(id: string, j: JointName): HTMLElement {
    const meta = JOINT_META[j];
    const arm = (): Arm => this.store.arm(id)!;
    const range = h("input", { type: "range", class: "range", step: "0.5", "aria-label": meta.label });
    const num = h("input", { type: "number", class: "num num--deg", step: "0.5", "aria-label": `${meta.label} (derece)` });
    const lim = h("span", { class: "joint__lim" });
    const svg = s("svg", { viewBox: "-22 -22 44 44", class: "dial", "aria-hidden": "true" });
    const arc = s("path", { class: "dial__arc" });
    const needle = s("line", { x1: 0, y1: 0, class: "dial__needle" });
    svg.append(s("circle", { r: 17, class: "dial__ring" }), arc, needle, s("circle", { r: 2.6, class: "dial__hub" }));
    const set = (v: number): void =>
      this.store.mutate(() => {
        const a = arm();
        a.pose[j] = clamp(v, ...a.limits[j]);
      });
    range.addEventListener("input", () => set(parseFloat(range.value)));
    range.addEventListener("change", () => this.store.commit());
    num.addEventListener("input", () => {
      const v = parseFloat(num.value);
      if (Number.isFinite(v)) set(v);
    });
    num.addEventListener("change", () => this.store.commit());
    num.addEventListener("keydown", (e) => {
      if (e.key === "Enter") num.blur();
    });
    // Tuşlar kaydırıcının uçlarında: soldaki azaltır, sağdaki artırır.
    const jk = JOINT_KEYS[j];
    const decKey = jk ? this.keycap(jk.dec, `${jk.dec}: ${meta.label} azalt (Shift: 1°)`) : h("span");
    const incKey = jk ? this.keycap(jk.inc, `${jk.inc}: ${meta.label} artır (Shift: 1°)`) : this.keycap("R", "R: yatay ↔ dikey");
    const row = h(
      "div",
      { class: "joint", title: meta.hint, "data-pulse": `joint:${j}` },
      h("div", { class: "joint__head" }, h("span", { class: "joint__name", text: meta.label }), lim),
      h(
        "div",
        { class: "joint__ctl" },
        svg,
        decKey,
        range,
        incKey,
        h("span", { class: "num-wrap" }, num, h("span", { class: "field__unit", text: "°" })),
      ),
    );
    let arcKey = "";
    this.refreshers.push(() => {
      const a = arm();
      const [lo, hi] = a.limits[j];
      const v = a.pose[j];
      range.min = String(lo);
      range.max = String(hi);
      range.value = String(v);
      range.style.setProperty("--pct", `${((v - lo) / (hi - lo || 1)) * 100}%`);
      if (document.activeElement !== num) num.value = fmt(v, 1);
      lim.textContent = `${signed(lo)}° … ${signed(hi)}°`;
      const [x, y] = dialPoint(meta.view, v, 15);
      needle.setAttribute("x2", x.toFixed(2));
      needle.setAttribute("y2", y.toFixed(2));
      const k = `${lo},${hi}`;
      if (k !== arcKey) {
        arc.setAttribute("d", arcPath(meta.view, lo, hi, 17));
        arcKey = k;
      }
      row.classList.toggle("joint--limit", hi - lo < 359 && (v <= lo + 0.25 || v >= hi - 0.25));
    });
    return row;
  }

  // ── Kollar ───────────────────────────────────────────────────

  private aim(id: string): void {
    this.store.act((L) => {
      const a = this.store.arm(id)!;
      for (let i = 0; i < 3; i++) {
        const { yaw, tilt } = aimAt(a, L.viewer);
        a.pose.tilt = clamp(tilt, ...a.limits.tilt);
        const r = solveIK(a, forward(a).plate, yaw, { wallZ: wallZ(L) });
        a.pose = r.pose;
        this.store.ik.set(id, r);
      }
    });
  }

  private renderArms(): void {
    const L = this.store.layout;
    const root = this.body;
    const chips = h("div", { class: "chips" });
    for (const arm of L.arms) {
      const name = h("span", { class: "chip__name" });
      const chip = h(
        "button",
        { type: "button", class: "chip", onclick: () => this.store.select({ kind: "arm", id: arm.id }) },
        h("span", { class: "chip__dot", "aria-hidden": "true" }),
        name,
      );
      this.refreshers.push((a) => {
        name.textContent = this.store.arm(arm.id)?.name ?? "";
        const sel = this.store.selection;
        chip.classList.toggle("is-active", sel?.kind === "arm" && sel.id === arm.id);
        chip.classList.toggle("is-hit", a.collidingArms.has(arm.id));
        chip.title = a.collidingArms.has(arm.id) ? "Çakışma var" : "";
      });
      chips.append(chip);
    }
    chips.append(this.button("+ Kol ekle", () => this.store.addArm(), "chip chip--add"));
    root.append(chips);

    const sel = this.store.selectedArm();
    if (!sel) {
      root.append(
        h(
          "div",
          { class: "empty" },
          h("p", { text: "Sahnede bir monitöre ya da kola tıkla veya yukarıdan seç." }),
          h("p", { text: "Monitörü sürükle: kol açılarını simülatör bulur. Shift ile derinlik, ok tuşları ile 10 mm adım." }),
        ),
      );
      return;
    }
    const id = sel.id;
    const A = (): Arm => this.store.arm(id)!;
    const an = (a: Analysis) => a.arms.get(id)!;

    root.append(
      this.section(
        "Eklem açıları",
        ...JOINTS.map((j) => this.joint(id, j)),
        h(
          "div",
          { class: "btn-row" },
          this.button("Göze çevir", () => this.aim(id), "btn btn--accent", "Ekranı göz noktasına döndürür (yön + eğim)"),
          this.button("Yatay ↔ Dikey", () =>
            this.store.act(() => {
              const a = A();
              a.pose.roll = Math.abs(a.pose.roll) > 45 ? 0 : clamp(90, ...a.limits.roll);
            }),
          ),
          this.button("Eğimi sıfırla", () => this.store.act(() => (A().pose.tilt = 0))),
        ),
      ),
    );

    const ikNote = h("p", { class: "note" });
    this.refreshers.push(() => {
      const r = this.store.ik.get(id);
      ikNote.textContent = !r
        ? "Değer yaz (Enter) veya monitörü sürükle; açılar ters kinematikle bulunur."
        : !r.reachable
          ? `Erişim dışı: en yakın konum ${fmt(r.error)} mm uzakta.`
          : r.facingKept
            ? "Hedefe ulaşıldı."
            : "Hedefe ulaşıldı; baş dönüş sınırı yüzünden ekran yönü değişti.";
      ikNote.dataset.level = !r ? "" : r.reachable ? "ok" : "bad";
    });
    const target = (axis: "x" | "y" | "z", label: string, hint: string): HTMLElement =>
      this.field(
        label,
        this.num(
          () => forward(A()).plate[axis],
          (v) => {
            const a = A();
            const t = { ...forward(a).plate, [axis]: v };
            const r = solveIK(a, t, undefined, { wallZ: wallZ(this.store.layout) });
            this.store.ik.set(id, r);
            a.pose = r.pose;
          },
          { live: false },
        ),
        "mm",
        hint,
      );
    root.append(
      this.section(
        "VESA eklemi · hedef konum",
        h(
          "div",
          { class: "grid3" },
          this.keyed(target("x", "X", "Masa merkezinden sağa (+) / sola (−)"), "vesa:x", ["←", "→"]),
          this.keyed(target("y", "Y", "Masa üstünden yükseklik"), "vesa:y", ["PgDn", "PgUp"]),
          this.keyed(target("z", "Z", "Masa merkezinden kullanıcıya (+) / duvara (−)"), "vesa:z", ["↑", "↓"]),
        ),
        ikNote,
      ),
    );

    const hasMon = !!sel.monitor;
    const m = (a: Analysis) => an(a).ergo!;
    const L2 = (): typeof L => this.store.layout;
    root.append(
      this.section(
        "Ölçüler",
        hasMon && this.readout("Ekran alt kenarı · masadan", (a) => `${fmt(m(a).bottomAboveDesk)} mm`, (a) => (m(a).bottomAboveDesk < 0 ? "bad" : null)),
        hasMon && this.readout("Ekran üst kenarı · masadan", (a) => `${fmt(m(a).topAboveDesk)} mm`),
        hasMon && this.readout("Panel üstü · göz hizasına göre", (a) => `${signed(m(a).topAboveEye, 0, " mm")}`),
        hasMon && this.readout("Ekran yüzü → masa ön kenarı", (a) => `${fmt(L2().desk.depth / 2 - an(a).monitor!.screen.z)} mm`),
        hasMon && this.readout("Göze mesafe", (a) => `${fmt(m(a).distance / 10, 1)} cm`, (a) => m(a).levels.distance),
        hasMon && this.readout("Bakış açısı · dikey", (a) => signed(m(a).vAngle, 1, "°"), (a) => m(a).levels.vAngle),
        hasMon && this.readout("Ekran sapması", (a) => `${fmt(m(a).offAxis, 1)}°`, (a) => m(a).levels.offAxis),
        this.readout("Duvar boşluğu", (a) => `${signed(an(a).wallClearance, 0, " mm")}`, (a) =>
          an(a).wallClearance < 0 ? "bad" : an(a).wallClearance < 15 ? "warn" : null,
        ),
        this.readout("Uzanım · kolondan VESA'ya", (a) => {
          const f = an(a).frame;
          return `${fmt(Math.hypot(f.plate.x - f.base.x, f.plate.z - f.base.z))} / ${fmt(reachInfo(A()).maxReach)} mm`;
        }),
        this.readout("VESA yükseklik aralığı", () => {
          const r = reachInfo(A());
          return `${fmt(r.minY)} – ${fmt(r.maxY)} mm`;
        }),
      ),
    );

    root.append(
      this.section(
        "Montaj",
        this.field("Ad", this.text(() => A().name, (v) => (A().name = v))),
        h(
          "div",
          { class: "grid3" },
          this.field("Kelepçe X", this.num(() => A().base.x, (v) => (A().base.x = v), { step: 5 }), "mm", "Kolonun masa merkezine göre yatay konumu"),
          this.field(
            "Arka kenardan",
            this.num(() => A().base.z + L2().desk.depth / 2, (v) => (A().base.z = Math.max(0, v) - L2().desk.depth / 2), { step: 5 }),
            "mm",
            "Kolon merkezinin masa arka kenarına uzaklığı",
          ),
          this.field("Kolon", this.num(() => A().geometry.columnHeight, (v) => (A().geometry.columnHeight = Math.max(40, v)), { step: 5 }), "mm", "Masa üstünden omuz eklemine"),
        ),
        h("p", { class: "note", text: "Kelepçeyi sahnede tabanından tutup da sürükleyebilirsin." }),
      ),
    );

    const geo = (key: keyof Arm["geometry"], label: string, hint: string, min = 0): HTMLElement =>
      this.field(label, this.num(() => A().geometry[key], (v) => (A().geometry[key] = Math.max(min, v)), { step: 5 }), "mm", hint);
    const limitRows = JOINTS.map((j) =>
      h(
        "div",
        { class: "limit-row" },
        h("span", { class: "limit-row__name", text: JOINT_META[j].label }),
        this.num(() => A().limits[j][0], (v) => (A().limits[j][0] = Math.min(v, A().limits[j][1])), { step: 1 }),
        h("span", { class: "limit-row__sep", text: "…" }),
        this.num(() => A().limits[j][1], (v) => (A().limits[j][1] = Math.max(v, A().limits[j][0])), { step: 1 }),
        h("span", { class: "field__unit", text: "°" }),
      ),
    );
    root.append(
      this.fold(
        "Kol ölçüleri ve eklem sınırları",
        h(
          "div",
          { class: "grid2" },
          geo("lowerLength", "Alt kol", "Omuz ekseni → dirsek ekseni", 20),
          geo("upperLength", "Gazlı ön kol", "Dirsek ekseni → bilek ekseni", 20),
          geo("elbowRise", "Ön kol yükseltisi", "Ön kolun alt kola göre yukarıda oturma payı"),
          geo("headLength", "Başlık uzunluğu", "Bilek → eğim eklemi"),
          geo("headDrop", "Başlık düşüşü", "Bilek → eğim eklemi dikey"),
        ),
        h("div", { class: "limits" }, ...limitRows),
        h("p", { class: "note", text: "Varsayılanlar F80 ürün bilgisinden: eğim −30°/+85°, baş ±90°, 360° döndürme, ~260 mm yükseklik, ~530 mm uzanım. Kendi kolunu ölçüp düzelt." }),
      ),
    );

    if (sel.monitor) root.append(this.monitorSection(id));
    else
      root.append(
        this.section(
          "Monitör",
          h("p", { class: "note", text: "Bu kolda monitör yok (boş VESA başlığı)." }),
          this.button("27\" monitör tak", () => this.store.act(() => (A().monitor = monitor27("27\" monitör", "blank")), "structure")),
        ),
      );

    root.append(
      h(
        "div",
        { class: "danger-row" },
        this.button(
          "Kolu sil",
          () => {
            if (window.confirm(`"${A().name}" silinsin mi? (Ctrl+Z ile geri alınabilir)`)) this.store.removeArm(id);
          },
          "btn btn--danger",
        ),
      ),
    );
  }

  private monitorSection(id: string): HTMLElement {
    const M = (): MonitorSpec => this.store.arm(id)!.monitor!;
    const n = (key: keyof MonitorSpec, label: string, unit: string, step = 1, digits = 0, min = 0): HTMLElement =>
      this.field(
        label,
        this.num(() => M()[key] as number, (v) => ((M()[key] as number) = Math.max(min, v)), { step, digits }),
        unit,
      );
    const aspect = this.select(
      ASPECTS.map(([k]) => [k, k] as [string, string]),
      () => {
        const m = M();
        return ASPECTS.find(([, w, hh]) => w === m.aspectW && hh === m.aspectH)?.[0] ?? "16:9";
      },
      (v) => {
        const a = ASPECTS.find(([k]) => k === v)!;
        M().aspectW = a[1];
        M().aspectH = a[2];
      },
    );
    return this.fold(
      "Monitör",
      this.field("Etiket", this.text(() => M().label, (v) => (M().label = v))),
      h(
        "div",
        { class: "grid2" },
        n("diagonalIn", "Köşegen", "inç", 0.5, 1, 10),
        this.field("En-boy", aspect),
        n("bezelSide", "Yan çerçeve", "mm"),
        n("bezelTop", "Üst çerçeve", "mm"),
        n("bezelBottom", "Alt çerçeve", "mm"),
        n("depth", "Derinlik", "mm", 1, 0, 5),
        this.field("VESA kayıklığı", this.num(() => M().vesaOffsetY, (v) => (M().vesaOffsetY = v)), "mm", "VESA deliklerinin merkezi gövde merkezinin ne kadar üstünde (+) / altında (−)"),
        n("weightKg", "Ağırlık", "kg", 0.1, 1),
      ),
      this.field("Ekran görüntüsü", this.select(SCREENS, () => M().screen, (v) => (M().screen = v))),
      this.readout("F80 taşıma aralığı (2–9 kg)", () => `${fmt(M().weightKg, 1)} kg`, () => (M().weightKg < 2 || M().weightKg > 9 ? "bad" : "ok")),
      h("div", { class: "btn-row" }, this.button("Monitörü çıkar", () => this.store.act(() => (this.store.arm(id)!.monitor = null), "structure"))),
    );
  }

  // ── Nesneler ─────────────────────────────────────────────────

  private renderItems(): void {
    const root = this.body;
    const L = this.store.layout;
    const list = h("ul", { class: "items" });
    for (const it of L.items) {
      const name = h("span", { class: "items__name" });
      const sw = h("span", { class: "items__swatch", "aria-hidden": "true" });
      const eye = h("button", {
        type: "button",
        class: "icon-btn",
        "aria-label": "Görünürlük",
        onclick: () => this.store.act(() => (this.store.item(it.id)!.visible = !this.store.item(it.id)!.visible)),
      });
      const row = h(
        "li",
        { class: "items__row" },
        h("button", { type: "button", class: "items__pick", onclick: () => this.store.select({ kind: "item", id: it.id }) }, sw, name),
        eye,
      );
      this.refreshers.push((a) => {
        const cur = this.store.item(it.id);
        if (!cur) return;
        name.textContent = cur.name;
        sw.style.background = cur.color;
        eye.textContent = cur.visible ? "görünür" : "gizli";
        row.classList.toggle("is-hidden", !cur.visible);
        const sel = this.store.selection;
        row.classList.toggle("is-active", sel?.kind === "item" && sel.id === it.id);
        row.classList.toggle("is-hit", a.collidingItems.has(it.id));
      });
      list.append(row);
    }
    let kind: ItemKind = "box";
    const kindSel = h("select", { class: "sel", onchange: (e: Event) => (kind = (e.target as HTMLSelectElement).value as ItemKind) },
      ...ITEM_KINDS.map((k) => h("option", { value: k, text: ITEM_META[k].label, selected: k === "box" })));
    root.append(
      this.section("Masadaki nesneler", list, h("div", { class: "add-row" }, kindSel, this.button("Ekle", () => this.store.addItem(kind), "btn btn--accent"))),
    );

    const sel = this.store.selectedItem();
    if (!sel) {
      root.append(h("div", { class: "empty" }, h("p", { text: "Bir nesneye tıkla ve sürükle. Q / E 15° döndürür (Shift ile 1°), R 90° çevirir, 0 yönü sıfırlar. Ok tuşları 10 mm taşır, PageUp/PageDown yükseltir." })));
      return;
    }
    const id = sel.id;
    const I = (): DeskItem => this.store.item(id)!;
    const n = (key: "x" | "z" | "elevation" | "rotY" | "w" | "h" | "d", label: string, unit: string, step = 5, min = -Infinity): HTMLElement =>
      this.field(label, this.num(() => I()[key], (v) => (I()[key] = Math.max(min, v)), { step }), unit);
    const color = h("input", { type: "color", class: "color" });
    color.addEventListener("input", () => this.store.mutate(() => (I().color = color.value)));
    color.addEventListener("change", () => this.store.commit());
    this.refreshers.push(() => {
      color.value = I().color;
    });
    root.append(
      this.section(
        "Seçili nesne",
        this.field("Ad", this.text(() => I().name, (v) => (I().name = v))),
        h(
          "div",
          { class: "grid3" },
          this.keyed(n("x", "X", "mm"), "item:x", ["←", "→"]),
          this.keyed(n("z", "Z", "mm"), "item:z", ["↑", "↓"]),
          this.keyed(n("rotY", "Dönüş", "°", 15), "item:rotY", ["Q", "E", "R"]),
        ),
        h("div", { class: "grid3" }, n("w", "Genişlik", "mm", 5, 1), n("d", "Derinlik", "mm", 5, 1), n("h", "Yükseklik", "mm", 5, 1)),
        h("div", { class: "grid2" }, this.keyed(n("elevation", "Taban yüksekliği", "mm", 5, 0), "item:elevation", ["PgDn", "PgUp"]), this.field("Renk", color)),
        h("div", { class: "danger-row" }, this.button("Nesneyi sil", () => this.store.removeItem(id), "btn btn--danger")),
      ),
    );
  }

  // ── Ortam ────────────────────────────────────────────────────

  private renderEnv(): void {
    const root = this.body;
    const D = () => this.store.layout.desk;
    const V = () => this.store.layout.viewer;
    const d = (key: keyof ReturnType<typeof D>, label: string, min: number, hint?: string): HTMLElement =>
      this.field(label, this.num(() => D()[key], (v) => (D()[key] = Math.max(min, v)), { step: 5 }), "mm", hint);
    root.append(
      this.section(
        "Masa",
        h(
          "div",
          { class: "grid2" },
          d("width", "Genişlik", 400),
          d("depth", "Derinlik", 300),
          d("height", "Yerden yükseklik", 400),
          d("thickness", "Kalınlık", 10),
          d("wallGap", "Duvar boşluğu", 0, "Masa arka kenarı ile duvar arası"),
        ),
      ),
    );
    root.append(
      this.section(
        "Göz noktası",
        h(
          "div",
          { class: "grid3" },
          this.field("X", this.num(() => V().x, (v) => (V().x = v), { step: 10 }), "mm"),
          this.field("Masadan", this.num(() => V().y, (v) => (V().y = v), { step: 10 }), "mm", "Göz yüksekliği, masa üstünden"),
          this.field("Ön kenardan", this.num(() => V().z - D().depth / 2, (v) => (V().z = D().depth / 2 + v), { step: 10 }), "mm", "Göz ile masa ön kenarı arası"),
        ),
        this.readout("Yerden göz yüksekliği", () => `${fmt((V().y + D().height) / 10, 1)} cm`),
        h("p", { class: "note", text: "Oturuşta göz yüksekliği genelde yerden 115–125 cm. Mavi çizgi duvardaki göz hizasıdır." }),
      ),
    );
    const opt = (k: keyof ViewOptions, label: string, hint?: string): HTMLElement =>
      this.toggle(label, () => this.store.options[k], (v) => this.store.setOption(k, v), hint);
    root.append(
      this.section(
        "Görünüm",
        h(
          "div",
          { class: "switches" },
          opt("angleLabels", "Eklem açı etiketleri ve yaylar"),
          opt("envelope", "Erişim alanı ve VESA yükseklik cetveli"),
          opt("sightLines", "Göz noktası ve görüş çizgileri"),
          opt("faceEye", "Sürüklerken ekranı göze çevir"),
          opt("snap", "5 mm adımla sürükle"),
        ),
        h("p", { class: "note", text: "Koordinatlar: orijin masa üstünün merkezi, +X sağ, +Y yukarı, +Z kullanıcıya doğru. Tüm ölçüler mm." }),
      ),
    );
  }

  // ── Düzenler ─────────────────────────────────────────────────

  private renderLayouts(): void {
    const root = this.body;
    const slots = loadSlots();
    const nameIn = h("input", { type: "text", class: "txt", placeholder: "ör. Dikey üst monitör", maxlength: "40" });
    const save = (): void => {
      const name = nameIn.value.trim() || `Düzen ${Object.keys(slots).length + 1}`;
      slots[name] = structuredClone(this.store.layout);
      saveSlots(slots);
      this.slotsVersion++;
      this.store.say(`"${name}" kaydedildi.`);
    };
    nameIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
    });
    const list = h("ul", { class: "slots" });
    for (const name of Object.keys(slots)) {
      list.append(
        h(
          "li",
          { class: "slots__row" },
          h("span", { class: "slots__name", text: name }),
          this.button("Yükle", () => {
            this.store.replace(structuredClone(slots[name]));
            this.store.say(`"${name}" yüklendi.`);
          }),
          this.button("Sil", () => {
            if (!window.confirm(`"${name}" kaydı silinsin mi?`)) return;
            delete slots[name];
            saveSlots(slots);
            this.slotsVersion++;
            this.store.say(`"${name}" silindi.`);
          }, "btn btn--ghost"),
        ),
      );
    }
    if (!Object.keys(slots).length) list.append(h("li", { class: "slots__empty", text: "Henüz kayıtlı düzen yok." }));

    const file = h("input", { type: "file", accept: "application/json,.json", class: "visually-hidden" });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const l = parseLayout(JSON.parse(await f.text()));
        if (!l) throw new Error("şema");
        this.store.replace(l);
        this.store.say(`${f.name} içe aktarıldı.`);
      } catch {
        this.store.say("Dosya okunamadı: geçerli bir Masa Atölyesi JSON'u değil.");
      }
      file.value = "";
    });

    root.append(
      this.section("Kayıtlı düzenler", h("div", { class: "add-row" }, nameIn, this.button("Kaydet", save, "btn btn--accent")), list),
      this.section(
        "Dosya",
        h(
          "div",
          { class: "btn-row" },
          this.button("JSON dışa aktar", () => {
            const blob = new Blob([JSON.stringify(envelope(this.store.layout), null, 2)], { type: "application/json" });
            const a = h("a", { href: URL.createObjectURL(blob), download: "masa-duzeni.json" });
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }),
          this.button("JSON içe aktar", () => file.click()),
          file,
        ),
        h("div", { class: "btn-row" }, this.button("Fotoğraftaki düzene dön", () => {
          if (window.confirm("Mevcut düzen fotoğraftaki başlangıç düzeniyle değiştirilsin mi? (Ctrl+Z ile geri alınabilir)")) this.store.reset();
        }, "btn btn--ghost")),
      ),
      this.section(
        "Kısayollar",
        ...SHORTCUTS.map((g) =>
          h(
            "div",
            { class: "keys-group" },
            h("h3", { class: "keys-group__title", text: g.group }),
            h("dl", { class: "keys" }, ...g.rows.flatMap((r) => [h("dt", {}, h("kbd", { text: r.keys })), h("dd", { text: r.does })])),
          ),
        ),
        h("p", { class: "note", text: "Aynı tablo sahnede, monitörlerin solundaki duvar posterinde de var." }),
      ),
    );
  }
}
