import { memo, useEffect, useRef } from "react";

/**
 * ParticleNetwork — lightweight canvas "neural net" backdrop.
 * - Fixed, behind everything, pointer-events: none.
 * - Pauses when tab is hidden, softens when reduced motion is requested.
 * - Uses time-based movement so the animation stays alive even when FPS is throttled.
 */
export const ParticleNetwork = memo(function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let teardown: (() => void) | undefined;
    let cancelled = false;

    const setup = () => {
      if (cancelled) return;
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return;

      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let width = 0;
      let height = 0;
      let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      type P = { x: number; y: number; vx: number; vy: number; seed: number };
      let particles: P[] = [];

      function resize() {
        const rect = canvas.getBoundingClientRect();
        const nextWidth = Math.round(rect.width);
        const nextHeight = Math.round(rect.height);
        const nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
        if (nextWidth === width && nextHeight === height && nextDpr === dpr && particles.length) return;

        width = nextWidth;
        height = nextHeight;
        dpr = nextDpr;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Same visual density, far less CPU: capped count + wider links.
        const target = Math.min(105, Math.max(46, Math.floor((width * height) / 18500)));
        particles = Array.from({ length: target }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 2.05,
          vy: (Math.random() - 0.5) * 2.05,
          seed: Math.random() * 1000,
        }));
      }
      resize();

      const ro = new ResizeObserver(resize);
      ro.observe(canvas);

      let raf = 0;
      let last = 0;
      const interval = 1000 / (prefersReduced ? 30 : 50);
      const motionScale = prefersReduced ? 0.35 : 1;
      let running = !document.hidden;

      const linkDist = 205;
      const linkDistSq = linkDist * linkDist;
      const turquoise = /* red */ "239, 68, 68";
      const blue = "80, 160, 255";
      const tau = Math.PI * 2;

      function step(deltaFrames = 1, time = 0) {
        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = "lighter";

        for (const p of particles) {
          p.x += p.vx * deltaFrames * motionScale;
          p.y += p.vy * deltaFrames * motionScale;
          if (p.x < -10) p.x = width + 10;
          else if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          else if (p.y > height + 10) p.y = -10;
        }

        ctx.lineWidth = 1.2;
        for (let i = 0; i < particles.length; i++) {
          const a = particles[i];
          for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < linkDistSq) {
              const t = 1 - d2 / linkDistSq;
              const flow = prefersReduced ? 0.9 : 0.72 + Math.sin(time * 0.0014 + a.seed + b.seed) * 0.18;
              ctx.strokeStyle = `rgba(${t > 0.5 ? turquoise : blue}, ${t * 0.78 * flow})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }

        // Glow without per-particle shadowBlur (the main CPU/GPU hotspot).
        ctx.fillStyle = `rgba(${turquoise}, 0.20)`;
        for (const p of particles) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, tau);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(${turquoise}, 0.95)`;
        for (const p of particles) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.15, 0, tau);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      function loop(ts: number) {
        if (!running) return;
        if (!last) last = ts;
        const elapsed = ts - last;
        if (elapsed >= interval) {
          const deltaFrames = Math.min(3, elapsed / interval);
          last = ts - (elapsed % interval);
          step(deltaFrames, ts);
        }
        raf = requestAnimationFrame(loop);
      }

      const resume = () => {
        running = !document.hidden;
        cancelAnimationFrame(raf);
        if (running) {
          last = 0;
          raf = requestAnimationFrame(loop);
        }
      };
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("focus", resume);
      window.addEventListener("pageshow", resume);

      step(1, performance.now());
      raf = requestAnimationFrame(loop);

      teardown = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        document.removeEventListener("visibilitychange", resume);
        window.removeEventListener("focus", resume);
        window.removeEventListener("pageshow", resume);
      };
    };

    // Start immediately on next frame — no idle deferral, otherwise the
    // canvas may stay blank if the browser never reaches "idle".
    const startId = requestAnimationFrame(setup);

    return () => {
      cancelled = true;
      cancelAnimationFrame(startId);
      teardown?.();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* base gradient ambience */}
      <div className="absolute inset-0 bg-background bg-gradient-bg" />
      {/* subtle grid */}
      <div className="absolute inset-0 tech-grid opacity-60" />
      {/* particle network */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-40" />
      {/* soft drifting glow */}
      <div
        className="aurora-blob"
        style={{
          width: 520,
          height: 520,
          top: -160,
          left: -140,
          background: "radial-gradient(circle, hsl(217 91% 55% / 0.45), transparent 60%)",
        }}
      />
      <div
        className="aurora-blob"
        style={{
          width: 460,
          height: 460,
          bottom: -160,
          right: -120,
          background: "radial-gradient(circle, hsl(0 84% 55% / 0.35), transparent 60%)",
          animationDelay: "-6s",
        }}
      />
    </div>
  );
});
