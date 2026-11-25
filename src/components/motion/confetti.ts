// One confetti burst in the brand colours (decision 0016: after Continue on sign up). Callers skip
// it when motion is paused or reduced. A temporary full-screen canvas that ignores the pointer and
// removes itself after about two seconds. Colours are the theme's tokens (the sky blue lives only in
// the config, FR-26).
const TOKENS = [
  "--bubblegum",
  "--primary",
  "--spring",
  "--glow-pink",
  "--glow-blue",
];
const FRAMES = 110;

export function confettiBurst() {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;z-index:60;pointer-events:none;width:100vw;height:100vh";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  const style = getComputedStyle(document.documentElement);
  const COLORS = TOKENS.map((t) => style.getPropertyValue(t).trim());
  const pieces = Array.from({ length: 120 }, () => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: window.innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    r: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    c: COLORS[Math.floor(Math.random() * COLORS.length)],
    w: 6 + Math.random() * 6,
  }));
  let frame = 0;
  const draw = () => {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.vy += 0.35;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
      ctx.restore();
    }
    if (frame < FRAMES) requestAnimationFrame(draw);
    else canvas.remove();
  };
  requestAnimationFrame(draw);
}
