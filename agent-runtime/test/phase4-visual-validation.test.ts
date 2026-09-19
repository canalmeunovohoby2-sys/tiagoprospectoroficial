import { describe, it, expect } from "vitest";
import {
  evaluateViewport,
  summarizeValidation,
  checkDirection,
  expectedSections,
  brandColorPresent,
  VALIDATION_VIEWPORTS,
  type ViewportEvidence,
} from "../src/studio/visual-validation";

// FASE 4 — lógica de validação visual (sem navegador). Cobre A–J determinística-
// mente; o render REAL é coberto por visual-validation.browser.test.ts.

const spec = VALIDATION_VIEWPORTS[0];
const mobileSpec = VALIDATION_VIEWPORTS[2];

const probeOk = { colors: ["#0b5cff"], brokenImages: [] as string[], overflowX: false, consoleErrors: [] as string[], failedRequests: [] as string[] };

function evidence(overrides: Partial<Parameters<typeof evaluateViewport>[0]> = {}, probe = probeOk) {
  return evaluateViewport({
    spec,
    probe,
    measurements: { heroVisible: true, ctaVisible: true, headerPresent: true },
    sections: { total: 6, empty: 0 },
    textOverflow: 0,
    imagesTotal: 3,
    ...overrides,
  });
}

describe("FASE 4 · A) render válido · B) tela branca", () => {
  it("A) página com hero/seções = render passed e relatório passed", () => {
    const v = evidence();
    expect(v.render).toBe("passed");
    const report = summarizeValidation([v], checkDirection(undefined, v, "Serviços Contato", ["#0b5cff"], {}));
    expect(report.status).toBe("passed");
    expect(report.reasons).toEqual([]);
  });

  it("B) tela branca (sem hero e sem seções) é detectada como falha", () => {
    const v = evidence({ measurements: { heroVisible: false, ctaVisible: false, headerPresent: false }, sections: { total: 0, empty: 0 }, imagesTotal: 0 });
    expect(v.render).toBe("failed");
    expect(v.reason).toMatch(/tela branca|erro fatal/i);
    const report = summarizeValidation([v], checkDirection(undefined, v, "", [], {}));
    expect(report.status).toBe("failed");
  });
});

describe("FASE 4 · C) overflow · D) imagem quebrada · E) CTA", () => {
  it("C) overflow horizontal vira falha explícita", () => {
    const v = evidence({}, { ...probeOk, overflowX: true });
    const report = summarizeValidation([v], checkDirection(undefined, v, "x", [], {}));
    expect(report.status).toBe("failed");
    expect(report.reasons.join(" ")).toMatch(/overflow horizontal/i);
  });

  it("D) imagem quebrada vira falha com URL", () => {
    const v = evidence({}, { ...probeOk, brokenImages: ["https://x.com/foto.jpg"] });
    expect(v.broken_images).toBe(1);
    expect(v.broken_image_urls[0]).toContain("foto.jpg");
    const report = summarizeValidation([v], checkDirection(undefined, v, "x", [], {}));
    expect(report.status).toBe("failed");
  });

  it("E) CTA principal ausente é detectado", () => {
    const v = evidence({ measurements: { heroVisible: true, ctaVisible: false, headerPresent: true } });
    expect(v.primary_cta_visible).toBe(false);
    const report = summarizeValidation([v], checkDirection(undefined, v, "x", [], {}));
    expect(report.reasons.join(" ")).toMatch(/CTA principal não visível/i);
  });
});

describe("FASE 4 · F) mobile pode falhar com desktop ok", () => {
  it("falha específica de mobile é atribuída ao viewport mobile", () => {
    const desktop = evidence();
    const mobile = evaluateViewport({
      spec: mobileSpec,
      probe: { ...probeOk, overflowX: true },
      measurements: { heroVisible: true, ctaVisible: true, headerPresent: true },
      sections: { total: 6, empty: 0 },
      textOverflow: 2,
      imagesTotal: 3,
    });
    expect(desktop.render).toBe("passed");
    expect(mobile.horizontal_overflow).toBe(true);
    const report = summarizeValidation([desktop, mobile], checkDirection(undefined, desktop, "x", [], {}));
    expect(report.status).toBe("failed");
    expect(report.reasons.join(" ")).toMatch(/mobile-390/);
    expect(report.reasons.join(" ")).not.toMatch(/desktop-1366/);
  });
});

describe("FASE 4 · G) direção fotográfica exige evidência", () => {
  it("photo_led sem imagens renderizadas = failed", () => {
    const v = evidence({ imagesTotal: 0 });
    const checks = checkDirection({ photoLed: true }, v, "texto", [], { hasPhotos: true });
    expect(checks.photo_evidence).toBe("failed");
    expect(checks.reasons.join(" ")).toMatch(/nenhuma imagem renderizada/i);
    expect(summarizeValidation([v], checks).status).toBe("failed");
  });

  it("photo_led com imagens reais (nenhuma quebrada) = passed", () => {
    const v = evidence({ imagesTotal: 2 });
    const checks = checkDirection({ photoLed: true }, v, "texto", [], { hasPhotos: true });
    expect(checks.photo_evidence).toBe("passed");
    expect(checks.reasons).toEqual([]);
  });
});

describe("FASE 4 · H) identidade existente é verificável no render", () => {
  it("cor de marca presente (hex computado) = passed; ausente = failed", () => {
    expect(brandColorPresent(["rgb(11, 92, 255)".replace("rgb(11, 92, 255)", "#0b5cff")], ["#0B5CFF"])).toBe(true);
    expect(brandColorPresent(["#ffffff", "#111111"], ["#0b5cff"])).toBe(false);
    // hex curto expandido
    expect(brandColorPresent(["#00bbff"], ["#0bf"])).toBe(true);

    const ok = checkDirection({ brandColors: ["#0b5cff"] }, evidence(), "x", ["#0b5cff"], {});
    expect(ok.brand_identity).toBe("passed");
    const bad = checkDirection({ brandColors: ["#0b5cff"] }, evidence(), "x", ["#ffffff"], {});
    expect(bad.brand_identity).toBe("failed");
    expect(bad.reasons.join(" ")).toMatch(/cores da marca/i);
  });
});

describe("FASE 4 · I) direção × estrutura (só quando os dados sustentam)", () => {
  it("galeria só é exigida quando existem fotos; localização só com endereço", () => {
    const plan = ["Prova visual: galeria com as fotos REAIS", "Localização/atendimento presencial", "Serviços reais informados"];
    expect(expectedSections(plan, { hasPhotos: true, hasAddress: true, hasServices: true })).toEqual(expect.arrayContaining(["gallery", "location", "services"]));
    expect(expectedSections(plan, { hasPhotos: false, hasAddress: false, hasServices: false })).toEqual([]);
    expect(expectedSections(plan, { hasPhotos: false, hasAddress: true, hasServices: true })).toEqual(expect.arrayContaining(["location", "services"]));
  });

  it("seções esperadas ausentes no TEXTO renderizado viram falha concreta", () => {
    const semImagens = evidence({ imagesTotal: 0 }); // sem imagens → galeria não se sustenta
    const checks = checkDirection(
      { sectionPlan: ["galeria com as fotos REAIS", "localização e atendimento"] },
      semImagens,
      "Serviços e contato.", // texto SEM galeria/localização
      [],
      { hasPhotos: true, hasAddress: true },
    );
    expect(checks.sections_expected).toEqual(expect.arrayContaining(["gallery", "location"]));
    expect(checks.sections_missing).toEqual(expect.arrayContaining(["gallery", "location"]));
    expect(summarizeValidation([semImagens], checks).status).toBe("failed");
  });

  it("seções presentes no render são reconhecidas (sem falso negativo)", () => {
    const checks = checkDirection(
      { sectionPlan: ["galeria com as fotos REAIS", "localização e atendimento"] },
      evidence(),
      "Galeria de trabalhos ... Onde estamos — endereço ... Nossos serviços",
      [],
      { hasPhotos: true, hasAddress: true, hasServices: true },
    );
    expect(checks.sections_missing).toEqual([]);
    expect(checks.sections_found).toEqual(expect.arrayContaining(["gallery", "location"]));
    expect(checks.sections_found).not.toContain("services"); // não estava no plano
  });
});

describe("FASE 4 · J) relatório honesto (falha visual nunca vira verified)", () => {
  it("qualquer falha de viewport mantém status failed (mesmo com direção ok)", () => {
    const okV = evidence();
    const badV: ViewportEvidence = { ...evidence(), horizontal_overflow: true };
    const report = summarizeValidation([okV, badV], checkDirection(undefined, okV, "x", [], {}));
    expect(report.status).toBe("failed");
    expect(report.reasons.length).toBeGreaterThan(0);
  });

  it("direção falhando mantém status failed (mesmo com render ok nos 3 viewports)", () => {
    const v = evidence();
    const checks = checkDirection({ photoLed: true }, v, "x", [], { hasPhotos: true });
    // evidência sem imagens → direção falha
    const semImagens = { ...v, images_total: 0 };
    const report = summarizeValidation([semImagens], checkDirection({ photoLed: true }, semImagens, "x", [], { hasPhotos: true }));
    expect(report.status).toBe("failed");
    expect(checks.photo_evidence).toBe("passed");
  });

  it("os 3 viewports exigidos pela fase são exatamente estes", () => {
    expect(VALIDATION_VIEWPORTS.map((v) => `${v.width}x${v.height}`)).toEqual(["1366x768", "1280x720", "390x844"]);
  });
});
