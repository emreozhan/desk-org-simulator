import "./style.css";
import { Store } from "./app/store";
import type { ChangeReason } from "./app/store";
import { analyze } from "./model/analysis";
import { defaultLayout } from "./model/defaults";
import { forward } from "./model/kinematics";
import { loadLayout } from "./model/storage";
import { SceneController } from "./scene/controller";
import { Interaction } from "./scene/interaction";
import { World } from "./scene/world";
import { Hud } from "./ui/hud";
import { Panel } from "./ui/panel";
import { SizeCard } from "./ui/sizeCard";

const viewport = document.getElementById("viewport")!;
const store = new Store(loadLayout() ?? defaultLayout());
const world = new World(viewport);
const scene = new SceneController(world, store);
const hud = new Hud(viewport, store, world);
const panel = new Panel(document.getElementById("panel")!, store);
const sizeCard = new SizeCard(viewport, store);
new Interaction(world, store, scene);

const sync = (reason: ChangeReason): void => {
  const a = analyze(store.layout);
  scene.sync(a);
  hud.update(reason, a);
  panel.update(reason, a);
  sizeCard.update();
};
store.on(sync);
sync("structure");
world.start();

if (import.meta.env.DEV) {
  // Doğrulama köprüsü: rAF durursa frame() ile tek kare çizilir.
  Object.assign(window, {
    __sim: {
      store,
      world,
      analyze: () => analyze(store.layout),
      fk: (id: string) => forward(store.arm(id)!),
      frame: () => world.frame(),
      view: (p: Parameters<Hud["view"]>[0]) => hud.view(p),
      screenshot: () => {
        world.frame();
        return world.renderer.domElement.toDataURL("image/png");
      },
    },
  });
}
