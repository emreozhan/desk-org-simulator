import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

interface Tween {
  from: Shot & { fov: number };
  to: Shot & { fov: number };
  t0: number;
  ms: number;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Renderer, kamera, ışık ve döngü. Birim: mm. */
export class World {
  readonly container: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly labels: CSS2DRenderer;
  readonly raycaster = new THREE.Raycaster();
  private tween: Tween | null = null;
  private raf = 0;
  private readonly reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(container: HTMLElement) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.className = "viewport__canvas";
    container.appendChild(r.domElement);
    this.renderer = r;

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "viewport__labels";
    container.appendChild(this.labels.domElement);

    this.scene.background = new THREE.Color("#0f1012");
    this.camera = new THREE.PerspectiveCamera(38, 1, 5, 40000);
    this.camera.position.set(1150, 950, 1850);

    const c = new OrbitControls(this.camera, r.domElement);
    c.target.set(0, 300, -120);
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.minDistance = 150;
    c.maxDistance = 9000;
    c.maxPolarAngle = Math.PI * 0.53;
    c.screenSpacePanning = true;
    this.controls = c;

    this.addLights();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight("#f4ede2", "#2a221d", 1.25));
    const key = new THREE.DirectionalLight("#fff0dc", 2.3);
    key.position.set(-900, 2400, 1500);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const s = key.shadow.camera;
    s.left = -1400;
    s.right = 1400;
    s.top = 1400;
    s.bottom = -1400;
    s.near = 200;
    s.far = 6000;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 1.5;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#9fb6ff", 0.35);
    fill.position.set(1600, 600, -400);
    this.scene.add(fill);
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** fov: göz görünümünde insan bakışına yakın geniş açı, diğerlerinde dar açı. */
  flyTo(pos: THREE.Vector3, target: THREE.Vector3, fov = 38, ms = 700): void {
    const from = { pos: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov };
    if (this.reduceMotion) ms = 1;
    this.tween = { from, to: { pos: pos.clone(), target: target.clone(), fov }, t0: performance.now(), ms };
  }

  /** İstemci koordinatından normalize cihaz koordinatına. */
  ndc(e: { clientX: number; clientY: number }): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  frame(): void {
    if (this.tween) {
      const tw = this.tween;
      const t = Math.min(1, (performance.now() - tw.t0) / tw.ms);
      const k = ease(t);
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, k);
      this.controls.target.lerpVectors(tw.from.target, tw.to.target, k);
      this.camera.fov = tw.from.fov + (tw.to.fov - tw.from.fov) * k;
      this.camera.updateProjectionMatrix();
      if (t >= 1) this.tween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  start(): void {
    const tick = (): void => {
      this.raf = requestAnimationFrame(tick);
      this.frame();
    };
    cancelAnimationFrame(this.raf);
    tick();
  }
}
