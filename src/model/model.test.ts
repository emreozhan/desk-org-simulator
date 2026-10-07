import { describe, expect, it } from "vitest";
import { analyze } from "./analysis";
import { F80_GEOMETRY, F80_LIMITS, ZERO_POSE, defaultLayout } from "./defaults";
import { clampPose, forward, reachInfo, solveIK } from "./kinematics";
import { obbIntersects } from "./obb";
import { parseLayout } from "./storage";
import type { Arm, OBB } from "./types";
import { JOINTS } from "./types";
import { dist, vec, wrapDeg } from "./vec";

const arm = (pose = ZERO_POSE): Arm => ({
  id: "t",
  name: "t",
  base: { x: 100, z: -300 },
  geometry: { ...F80_GEOMETRY },
  limits: structuredClone(F80_LIMITS),
  pose: { ...pose },
  monitor: null,
});

// Testte tohumlu, basit LCG.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

describe("ileri kinematik", () => {
  it("sıfır duruşta kol düz ileri uzanır", () => {
    const g = F80_GEOMETRY;
    const f = forward(arm());
    expect(f.plate.x).toBeCloseTo(100);
    expect(f.plate.y).toBeCloseTo(g.columnHeight + g.elbowRise);
    expect(f.plate.z).toBeCloseTo(-300 + g.lowerLength + g.upperLength + g.headLength);
    expect(f.normal.z).toBeCloseTo(1);
  });

  it("pozitif eğim ekranı yukarı, 90° döndürme portreye çevirir", () => {
    const f = forward(arm({ ...ZERO_POSE, tilt: 20, roll: 90 }));
    expect(f.normal.y).toBeGreaterThan(0);
    expect(Math.abs(f.right.y)).toBeGreaterThan(0.9);
  });

  it("kaldırma açısı VESA yüksekliğini sinüsle değiştirir", () => {
    const g = F80_GEOMETRY;
    const f = forward(arm({ ...ZERO_POSE, lift: 30 }));
    expect(f.plate.y).toBeCloseTo(g.columnHeight + g.elbowRise + g.upperLength * 0.5);
  });
});

describe("ters kinematik", () => {
  it("sınırlar içindeki rastgele duruşları geri bulur", () => {
    const rnd = lcg(42);
    const a = arm();
    for (let i = 0; i < 300; i++) {
      const pose = clampPose(a, {
        shoulder: rnd() * 360 - 180,
        elbow: rnd() * 340 - 170,
        lift: -24 + rnd() * 63,
        swivel: rnd() * 170 - 85,
        tilt: rnd() * 40 - 20,
        roll: 0,
      });
      const f = forward({ ...a, pose });
      const r = solveIK(a, f.plate, f.facingYaw);
      const back = forward({ ...a, pose: r.pose });
      expect(dist(back.plate, f.plate)).toBeLessThan(1e-6);
      expect(Math.abs(wrapDeg(back.facingYaw - f.facingYaw))).toBeLessThan(1e-6);
      expect(r.reachable).toBe(true);
    }
  });

  it("erişim dışı hedefte sınırlar içinde en yakın duruşu verir", () => {
    const a = arm();
    const r = solveIK(a, vec(100, 2000, 2000));
    expect(r.reachable).toBe(false);
    expect(r.error).toBeGreaterThan(100);
    for (const j of JOINTS) {
      expect(r.pose[j]).toBeGreaterThanOrEqual(a.limits[j][0]);
      expect(r.pose[j]).toBeLessThanOrEqual(a.limits[j][1]);
    }
  });

  it("baş dönüş sınırı aşılırsa bakış yönünden vazgeçip konumu tutturur", () => {
    const a = arm();
    const target = forward({ ...a, pose: { ...ZERO_POSE, elbow: 60 } }).plate;
    const r = solveIK(a, target, 180);
    expect(r.facingKept).toBe(false);
    expect(r.reachable).toBe(true);
  });

  it("yükseklik aralığı F80 değerine (~260 mm) yakındır", () => {
    const info = reachInfo(arm());
    expect(info.maxY - info.minY).toBeGreaterThan(240);
    expect(info.maxY - info.minY).toBeLessThan(290);
  });
});

describe("çarpışma", () => {
  const box = (x: number, rot = 0): OBB => ({
    c: vec(x, 0, 0),
    u: [vec(Math.cos(rot), 0, -Math.sin(rot)), vec(0, 1, 0), vec(Math.sin(rot), 0, Math.cos(rot))],
    e: [50, 50, 50],
  });
  it("kesişen ve ayrık kutuları ayırt eder", () => {
    expect(obbIntersects(box(0), box(90))).toBe(true);
    expect(obbIntersects(box(0), box(101))).toBe(false);
    // 45° dönmüş kutunun köşesi 70.7 mm uzanır.
    expect(obbIntersects(box(0), box(115, Math.PI / 4))).toBe(true);
    expect(obbIntersects(box(0), box(125, Math.PI / 4))).toBe(false);
  });

  it("fotoğraf düzeni erişilebilir ve çakışmasızdır", () => {
    const layout = defaultLayout();
    const a = analyze(layout);
    expect(a.collisions.map((h) => `${h.a} ↔ ${h.b}`)).toEqual([]);
    const lower = a.arms.get("kol-alt")!;
    expect(lower.frame.plate.y).toBeCloseTo(285, 0);
    expect(lower.ergo!.bottomAboveDesk).toBeGreaterThan(80);
  });

  it("monitör duvara itilince çakışma raporlanır", () => {
    const layout = defaultLayout();
    const lower = layout.arms[0];
    lower.pose = solveIK(lower, vec(0, 285, -470)).pose;
    const hits = analyze(layout).collisions;
    expect(hits.some((h) => h.b === "duvar")).toBe(true);
  });
});

describe("kayıt", () => {
  it("zarflı ve çıplak düzeni kabul eder, bozuk veriyi reddeder", () => {
    const l = defaultLayout();
    expect(parseLayout({ version: 1, layout: l })).not.toBeNull();
    expect(parseLayout(JSON.parse(JSON.stringify(l)))).not.toBeNull();
    expect(parseLayout({ version: 2, arms: [] })).toBeNull();
    expect(parseLayout("x")).toBeNull();
  });
});
