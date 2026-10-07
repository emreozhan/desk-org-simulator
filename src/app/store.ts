import type { Arm, DeskItem, ItemKind, Layout } from "../model/types";
import type { IkResult } from "../model/kinematics";
import { defaultLayout, newArm, newItem } from "../model/defaults";
import { loadOptions, saveLayout, saveOptions } from "../model/storage";

export type Selection = { kind: "arm"; id: string } | { kind: "item"; id: string } | null;

/** pose: değer değişti; structure: liste/geometri baştan kurulmalı; history: yalnız geri al durumu. */
export type ChangeReason = "pose" | "structure" | "selection" | "options" | "history" | "notice";

export interface ViewOptions {
  angleLabels: boolean;
  envelope: boolean;
  sightLines: boolean;
  /** Sürüklerken ekran göz noktasına döner. */
  faceEye: boolean;
  snap: boolean;
}

const DEFAULT_OPTIONS: ViewOptions = {
  angleLabels: true,
  envelope: true,
  sightLines: true,
  faceEye: false,
  snap: true,
};

type Listener = (reason: ChangeReason) => void;

export class Store {
  layout: Layout;
  selection: Selection = null;
  options: ViewOptions = loadOptions(DEFAULT_OPTIONS);
  /** Son ters kinematik sonucu (kaydedilmez). */
  readonly ik = new Map<string, IkResult>();
  notice: { text: string; at: number } | null = null;

  private committed: string;
  private past: string[] = [];
  private future: string[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(initial: Layout) {
    this.layout = initial;
    this.committed = JSON.stringify(initial);
    saveLayout(initial);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(reason: ChangeReason): void {
    for (const fn of this.listeners) fn(reason);
  }

  /** Canlı değişiklik; geçmişe `commit` ile yazılır. */
  mutate(fn: (l: Layout) => void, reason: ChangeReason = "pose"): void {
    fn(this.layout);
    this.emit(reason);
  }

  commit(): void {
    const s = JSON.stringify(this.layout);
    if (s === this.committed) return;
    this.past.push(this.committed);
    if (this.past.length > 200) this.past.shift();
    this.committed = s;
    this.future = [];
    saveLayout(this.layout);
    this.emit("history");
  }

  /** Tek adımlık eylem: değiştir + geçmişe yaz. */
  act(fn: (l: Layout) => void, reason: ChangeReason = "pose"): void {
    this.mutate(fn, reason);
    this.commit();
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): void {
    const prev = this.past.pop();
    if (prev === undefined) return;
    this.future.push(this.committed);
    this.restore(prev);
  }

  redo(): void {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(this.committed);
    this.restore(next);
  }

  private restore(json: string): void {
    this.committed = json;
    this.layout = JSON.parse(json) as Layout;
    this.ik.clear();
    if (this.selection && !this.exists(this.selection)) this.selection = null;
    saveLayout(this.layout);
    this.emit("structure");
  }

  replace(layout: Layout): void {
    this.layout = layout;
    this.selection = null;
    this.ik.clear();
    this.emit("structure");
    this.commit();
  }

  reset(): void {
    this.replace(defaultLayout());
  }

  private exists(sel: NonNullable<Selection>): boolean {
    return sel.kind === "arm" ? !!this.arm(sel.id) : !!this.item(sel.id);
  }

  select(sel: Selection): void {
    const same = sel?.kind === this.selection?.kind && sel?.id === this.selection?.id;
    if (same) return;
    this.selection = sel;
    this.emit("selection");
  }

  setOption<K extends keyof ViewOptions>(k: K, v: ViewOptions[K]): void {
    this.options = { ...this.options, [k]: v };
    saveOptions(this.options);
    this.emit("options");
  }

  say(text: string): void {
    this.notice = { text, at: performance.now() };
    this.emit("notice");
  }

  arm(id: string): Arm | undefined {
    return this.layout.arms.find((a) => a.id === id);
  }
  item(id: string): DeskItem | undefined {
    return this.layout.items.find((i) => i.id === id);
  }
  selectedArm(): Arm | undefined {
    return this.selection?.kind === "arm" ? this.arm(this.selection.id) : undefined;
  }
  selectedItem(): DeskItem | undefined {
    return this.selection?.kind === "item" ? this.item(this.selection.id) : undefined;
  }

  addArm(): void {
    const arm = newArm(this.layout);
    this.act((l) => l.arms.push(arm), "structure");
    this.select({ kind: "arm", id: arm.id });
  }

  removeArm(id: string): void {
    this.selection = null;
    this.act((l) => (l.arms = l.arms.filter((a) => a.id !== id)), "structure");
  }

  addItem(kind: ItemKind): void {
    const it = newItem(kind);
    this.act((l) => l.items.push(it), "structure");
    this.select({ kind: "item", id: it.id });
  }

  removeItem(id: string): void {
    this.selection = null;
    this.act((l) => (l.items = l.items.filter((i) => i.id !== id)), "structure");
  }
}
