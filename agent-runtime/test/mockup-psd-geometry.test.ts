import { describe, it, expect } from "vitest";
import { readPsdTree, discoverSurfaceGeometry, resolveDesignSurface, protectMaster } from "../src/mockup-psd-adapter";

const master = "assets/mockups/master/mockup-master.psd.psd";
const mapPath = "assets/mockups/master/mockup-master.analysis.json";

describe("mockup-psd-adapter — GEOMETRIA REAL das superfícies (10.7.2)", () => {
  it("readPsdTree expõe bounds reais (top/left/right/bottom) — geometria presente", () => {
    const t = readPsdTree(master);
    // Há múltiplas camadas 'BC' (Mockup/Designs/BC e Designs/BC); ambas têm bounds reais comprovados.
    expect(t.tree.some((n) => n.name === "BC" && (n.bbox?.width === 241 || n.bbox?.width === 311))).toBe(true);
    for (const app of ["A4", "A5", "DL", "BC", "Keychain", "Brochure", "Badge", "Notepad", "Box top", "Mug", "iPhone", "Tablet"]) {
      expect(t.tree.some((x) => x.name === app && (x.bbox?.width ?? 0) > 0), app).toBe(true);
    }
  });

  it("resolveDesignSurface devolve bounds reais (width/height > 0)", () => {
    const t = readPsdTree(master);
    const map = { tree: t.tree } as any;
    const s = resolveDesignSurface(map, "BC");
    expect(s).not.toBeNull();
    expect(s!.bbox.width).toBeGreaterThan(0);
    expect(s!.bbox.height).toBeGreaterThan(0);
  });

  it("camadas de cor expõem vectorFill real (Resolved_vector_color)", () => {
    const geom = discoverSurfaceGeometry(master, mapPath);
    expect(geom.colors["Color 1"]?.state).toBe("resolved_vector_color");
    expect(Math.round(geom.colors["Color 1"]?.vectorFill?.r ?? 999)).toBe(47);
    expect(geom.colors["Color 2"]?.vectorFill).not.toBeNull();
    // superfícies resolvidas como raster real
    expect(geom.surfaces["BC"]?.state).toBe("resolved_raster");
    expect((geom.surfaces["BC"]?.bounds?.width ?? 0)).toBeGreaterThan(0);
  });

  it("master permanece byte-for-byte intacto após descoberta de geometria", () => {
    const before = protectMaster(master);
    discoverSurfaceGeometry(master, mapPath);
    expect(protectMaster(master)).toBe(before);
  });
});
