/**
 * TechBackground — subtle, performant animated backdrop.
 * - Fixed, behind everything (z-0), pointer-events: none.
 * - Gradient + tech grid + two slowly drifting aurora blobs.
 * - No JS animation loop; pure CSS keyframes.
 */
export function TechBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background bg-gradient-bg"
    >
      <div className="absolute inset-0 tech-grid opacity-70" />
      <div
        className="aurora-blob"
        style={{
          width: 520,
          height: 520,
          top: -160,
          left: -140,
          background: "radial-gradient(circle, hsl(217 91% 55% / 0.55), transparent 60%)",
        }}
      />
      <div
        className="aurora-blob"
        style={{
          width: 460,
          height: 460,
          bottom: -160,
          right: -120,
          background: "radial-gradient(circle, hsl(0 84% 55% / 0.45), transparent 60%)",
          animationDelay: "-6s",
        }}
      />
    </div>
  );
}
