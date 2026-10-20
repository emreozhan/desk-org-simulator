import type * as THREE from "three";
import type { Analysis } from "../model/analysis";
import type { Store } from "../app/store";
import type { World } from "./world";
import { ArmView } from "./armView";
import { ItemView } from "./itemView";
import { Overlays } from "./overlays";
import { buildRoom } from "./deskView";
import { disposeTree } from "./parts";
import { shortcutPoster, topoTexture, woodTexture } from "./textures";

/** Düzen → sahne eşlemesi. Yalnız anahtarı değişen parçalar yeniden kurulur. */
export class SceneController {
  readonly world: World;
  private readonly store: Store;
  private readonly aniso: number;
  private readonly topo: THREE.Texture;
  private readonly wood: THREE.Texture;
  private readonly poster: THREE.Texture;
  private room: THREE.Group | null = null;
  private roomKey = "";
  private readonly arms = new Map<string, ArmView>();
  private readonly items = new Map<string, ItemView>();
  private readonly overlays = new Overlays();
  private pickCache: THREE.Object3D[] | null = null;

  constructor(world: World, store: Store) {
    this.world = world;
    this.store = store;
    this.aniso = world.renderer.capabilities.getMaxAnisotropy();
    this.topo = topoTexture(this.aniso);
    this.wood = woodTexture(this.aniso);
    this.poster = shortcutPoster(this.aniso);
    world.scene.add(this.overlays.group);
  }

  sync(a: Analysis): void {
    const L = this.store.layout;
    const sel = this.store.selection;
    const opt = this.store.options;
    const scene = this.world.scene;

    const rk = JSON.stringify(L.desk);
    if (rk !== this.roomKey) {
      if (this.room) {
        scene.remove(this.room);
        disposeTree(this.room);
      }
      this.room = buildRoom(L.desk, this.wood, this.poster);
      scene.add(this.room);
      this.roomKey = rk;
      this.pickCache = null;
    }

    const armIds = new Set(L.arms.map((x) => x.id));
    for (const [id, v] of this.arms)
      if (!armIds.has(id)) {
        scene.remove(v.root);
        v.dispose();
        this.arms.delete(id);
        this.pickCache = null;
      }
    for (const arm of L.arms) {
      let v = this.arms.get(arm.id);
      if (!v || v.key !== ArmView.keyOf(arm, L.desk)) {
        if (v) {
          scene.remove(v.root);
          v.dispose();
        }
        v = new ArmView(arm, L.desk, this.aniso);
        scene.add(v.root);
        this.arms.set(arm.id, v);
        this.pickCache = null;
      }
      v.applyPose(arm);
      const selected = sel?.kind === "arm" && sel.id === arm.id;
      v.setState(selected, a.collidingArms.has(arm.id), opt.angleLabels);
    }

    const itemIds = new Set(L.items.map((x) => x.id));
    for (const [id, v] of this.items)
      if (!itemIds.has(id)) {
        scene.remove(v.root);
        v.dispose();
        this.items.delete(id);
        this.pickCache = null;
      }
    for (const it of L.items) {
      let v = this.items.get(it.id);
      if (!v || v.key !== ItemView.keyOf(it)) {
        if (v) {
          scene.remove(v.root);
          v.dispose();
        }
        v = new ItemView(it, this.topo);
        scene.add(v.root);
        this.items.set(it.id, v);
        this.pickCache = null;
      }
      v.apply(it);
      v.setState(sel?.kind === "item" && sel.id === it.id, a.collidingItems.has(it.id));
    }

    const outline = this.room?.getObjectByName("deskOutline");
    if (outline) outline.visible = sel?.kind === "desk";
    this.overlays.update(L, sel, opt, a);
  }

  /** Seçili nesnenin boyut tutamakları; diğer her şeyden önce denenir. */
  handlePickables(): THREE.Object3D[] {
    const sel = this.store.selection;
    return sel?.kind === "item" ? (this.items.get(sel.id)?.handles ?? []) : [];
  }

  pickables(): THREE.Object3D[] {
    if (!this.pickCache) {
      this.pickCache = [
        ...[...this.arms.values()].flatMap((v) => v.pickables),
        ...[...this.items.values()].flatMap((v) => v.pickables),
        ...(this.room ? [this.room.getObjectByName("deskTop")!] : []),
      ];
    }
    return this.pickCache;
  }
}
