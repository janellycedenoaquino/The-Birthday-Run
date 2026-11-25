// The owner's runner for the "Catch the prizes" game (decision 0016), drawn on the canvas from her
// reference: a big dark-brown afro, medium-brown skin, a tilted purple party hat with a lilac
// pompom, a pink tee, blue shorts, white socks and shoes. She runs (alternating knee lift,
// swinging arms, a small bob) and her eyes look the way she moves (`face` = 1 right, -1 left).
const C = {
  afro: "#2A0C0D",
  skin: "#D3874A",
  blush: "#E07A5A",
  hat: "#9B6E9E",
  hatHi: "#C6A4CB",
  pom: "#DCC6E6",
  shirt: "#C04350",
  collar: "#E58A93",
  shorts: "#437893",
  shortsShade: "#23546C",
  sock: "#F2F4EF",
  shoe: "#ECEAE0",
  shoeLine: "#9A9486",
  line: "#3B2320",
  mouth: "#7A2418",
};
const TAU = Math.PI * 2;

/** Draws the runner with her feet at (x, y), `scale` 1 ≈ 120 px tall. `now` in ms drives the run. */
export function drawRunner(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  face: 1 | -1,
  scale: number,
) {
  const phase = now / 95;
  const bob = Math.abs(Math.sin(phase)) * -3;
  const look = face * 1.6;
  c.save();
  c.translate(x, y + bob * scale);
  c.scale(scale, scale);
  c.lineJoin = "round";
  c.lineCap = "round";

  // Legs, socks and shoes: one knee lifts while the other foot is down.
  [-1, 1].forEach((side, i) => {
    const lift = Math.max(0, Math.sin(phase + i * Math.PI)) * 9;
    c.fillStyle = C.skin;
    c.fillRect(side * 5 - 3, -30, 6, 24 - lift);
    c.fillStyle = C.sock;
    c.fillRect(side * 5 - 3.2, -12 - lift, 6.4, 6);
    c.fillStyle = C.shoe;
    c.strokeStyle = C.shoeLine;
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(side * 6, -4 - lift, 6.5, 3.6, 0, 0, TAU);
    c.fill();
    c.stroke();
  });

  // Shorts.
  c.fillStyle = C.shorts;
  c.beginPath();
  c.roundRect(-13, -44, 26, 17, 4);
  c.fill();
  c.strokeStyle = C.shortsShade;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(0, -38);
  c.lineTo(0, -28);
  c.stroke();

  // Afro: back volume, sides down to the shoulders, the face left open.
  c.fillStyle = C.afro;
  c.beginPath();
  c.arc(0, -92, 18, 0, TAU);
  c.fill();
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU;
    const sx = Math.cos(a);
    const sy = Math.sin(a);
    if (sy > 0.55 && Math.abs(sx) < 0.6) continue;
    c.beginPath();
    c.arc(sx * 19, -90 + sy * 17, 8, 0, TAU);
    c.fill();
  }

  // Neck and tee.
  c.fillStyle = C.skin;
  c.fillRect(-3.5, -72, 7, 7);
  c.fillStyle = C.shirt;
  c.beginPath();
  c.roundRect(-14, -66, 28, 25, 7);
  c.fill();
  c.strokeStyle = C.collar;
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(0, -66, 5, 2.6, 0, 0, Math.PI);
  c.stroke();

  // Arms swing against the legs, drawn over the tee.
  [-1, 1].forEach((side, i) => {
    const a = -side * (0.25 + 0.22 * Math.sin(phase + i * Math.PI));
    c.save();
    c.translate(side * 13, -61);
    c.rotate(a);
    c.strokeStyle = C.skin;
    c.lineWidth = 5.5;
    c.beginPath();
    c.moveTo(0, 3);
    c.lineTo(0, 20);
    c.stroke();
    c.fillStyle = C.skin;
    c.beginPath();
    c.arc(0, 21.5, 3.4, 0, TAU);
    c.fill();
    c.fillStyle = C.shirt;
    c.beginPath();
    c.roundRect(-4.5, -3, 9, 10, 3);
    c.fill();
    c.restore();
  });

  // Head and face; the eyes, cheeks and smile shift toward where she runs.
  c.fillStyle = C.skin;
  c.beginPath();
  c.arc(0, -82, 12, 0, TAU);
  c.fill();
  c.fillStyle = C.blush;
  c.globalAlpha = 0.5;
  c.beginPath();
  c.arc(-6.5 + look, -78, 2.6, 0, TAU);
  c.arc(6.5 + look, -78, 2.6, 0, TAU);
  c.fill();
  c.globalAlpha = 1;
  c.fillStyle = C.line;
  c.beginPath();
  c.arc(-4.2 + look, -83, 1.9, 0, TAU);
  c.arc(4.2 + look, -83, 1.9, 0, TAU);
  c.fill();
  c.fillStyle = "#fff";
  c.beginPath();
  c.arc(-3.6 + look, -83.7, 0.6, 0, TAU);
  c.arc(4.8 + look, -83.7, 0.6, 0, TAU);
  c.fill();
  c.fillStyle = C.mouth;
  c.beginPath();
  c.arc(look, -78.5, 3.4, 0, Math.PI);
  c.fill();

  // Fringe curls along the hairline.
  c.fillStyle = C.afro;
  for (const [fx, fy, r] of [
    [-9, -92, 5],
    [-3, -94.5, 5.5],
    [4, -94, 5.5],
    [10, -91, 4.5],
  ]) {
    c.beginPath();
    c.arc(fx, fy, r, 0, TAU);
    c.fill();
  }

  // The purple party hat, tilted, sitting in the afro.
  c.save();
  c.translate(-4, -106);
  c.rotate(-0.22);
  c.fillStyle = C.hat;
  c.beginPath();
  c.moveTo(-8, 0);
  c.lineTo(8, 0);
  c.lineTo(0, -24);
  c.closePath();
  c.fill();
  c.strokeStyle = C.hatHi;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-5, -6);
  c.lineTo(5, -6);
  c.moveTo(-2.6, -13);
  c.lineTo(2.6, -13);
  c.stroke();
  c.fillStyle = C.pom;
  c.beginPath();
  c.arc(0, -25, 3.8, 0, TAU);
  c.fill();
  c.restore();

  c.restore();
}
