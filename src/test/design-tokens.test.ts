import { describe, it, expect } from "vitest";
import {
  typeVoiceFor, getTypeRoleTokens, layoutTokens, radiusFor, shadowFor,
  motionTokens, resolveDesignTokens, EASING_SNAPPY,
} from "../../supabase/functions/_shared/design-tokens";

describe("Design Tokens (7.1)", () => {
  it("mapeia voz tipográfica por archetype", () => {
    expect(typeVoiceFor("editorial")).toBe("editorial");
    expect(typeVoiceFor("bold")).toBe("display");
    expect(typeVoiceFor("service_focused")).toBe("technical");
    expect(typeVoiceFor("minimal")).toBe("quiet");
  });

  it("escala tipográfica editorial tem display grande e tracking negativo", () => {
    const t = getTypeRoleTokens("editorial");
    expect(t.display.size).toContain("clamp");
    expect(t.display.tracking).toBe("-0.02em");
    expect(t.eyebrow.tracking).toBe("0.22em");
    expect(t.eyebrow.size).toBe("0.72rem");
  });

  it("layout tokens obedecem container/spacing/density", () => {
    const wide = layoutTokens({ container: "wide", spacing: "generous", density: "airy" });
    expect(wide.container).toBe("86rem");
    expect(wide.sectionPad).toBe("6.5rem");
    expect(wide.densityLine).toBe(1.75);
    const compact = layoutTokens({ container: "narrow", spacing: "compact", density: "dense" });
    expect(compact.container).toBe("62rem");
    expect(compact.gridGap).toBe("1rem");
    expect(compact.densityLine).toBe(1.42);
  });

  it("shape: radius e shadow por estilo", () => {
    expect(radiusFor("large")).toBe("large");
    expect(radiusFor("")).toBe("medium");
    expect(shadowFor("editorial", "editorial")).toBe("editorial");
    expect(shadowFor("elevated")).toBe("elevated");
    expect(shadowFor("bordered")).toBe("soft");
    expect(shadowFor("flat")).toBe("flat");
  });

  it("motion: clusters calmos são mais suaves que energéticos", () => {
    const calm = motionTokens("saude_bem_estar");
    const energetic = motionTokens("automotivo");
    expect(calm.staggerMs).toBeGreaterThan(energetic.staggerMs);
    expect(calm.hoverLift).toBe("-3px");
    expect(energetic.hoverLift).toBe("-5px");
    expect(energetic.easing).toBe(EASING_SNAPPY);
  });

  it("resolveDesignTokens monta objeto completo", () => {
    const resolved = resolveDesignTokens("Pet Shop", "service_focused", { container: "standard" });
    expect(resolved.layout.container).toBe("74rem");
    expect(resolved.shape.radius).toBe("16px");
    expect(resolved.shape.shadowKey).toBe("soft");
    expect(resolved.type.body.line).toBeGreaterThan(1.5);
    expect(resolved.motion.imageZoomScale).toContain("1.0");
  });
});
