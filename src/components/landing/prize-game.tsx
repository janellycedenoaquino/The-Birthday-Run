"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { msg } from "@/lib/messages";
import { useMotion } from "@/components/motion/motion";
import {
  advance,
  isCaught,
  newPrize,
  pointsFor,
  ROUND_SECONDS,
  spawnInterval,
  type Prize,
} from "./prize-engine";
import { drawRunner } from "./runner";

// "Catch the prizes" (decision 0016): optional decoration in a pink pull-up tab at the bottom of
// the landing page. The tab is a real button (`aria-expanded`); Escape closes the sheet. Playing
// pauses the tunnel and glow, and they resume after the round unless the visitor had paused them.
// The best score is a number in localStorage, nothing else.

export type GameLogo = { id: string; logoFile: string };
const BEST_KEY = "tbr-best";
const SCALE = 0.62;

export function PrizeGame({ logos }: { logos: GameLogo[] }) {
  const [open, setOpen] = useState(false);
  const tabRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      tabRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="sticky bottom-0 z-20 mx-auto w-full sm:max-w-[640px]">
      {open && (
        <div
          id={panelId}
          className="absolute inset-x-0 bottom-full rounded-t-2xl bg-background px-4 pt-3.5 pb-4 shadow-[0_-1.5px_0_color-mix(in_srgb,var(--foreground)_15%,transparent)]"
        >
          <GameBoard logos={logos} />
        </div>
      )}
      <button
        ref={tabRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
        className={`flex h-[52px] w-full items-center justify-center gap-2 bg-[var(--bubblegum)] text-[15px] font-extrabold text-[var(--navy)] shadow-[0_-1.5px_0_var(--navy)] outline-none focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-[var(--navy)] ${open ? "" : "rounded-t-[20px]"}`}
      >
        {open ? (
          <>
            {msg("M-286b")}{" "}
            <ChevronDown className="size-4" aria-hidden="true" />
          </>
        ) : (
          <>
            {msg("M-286")} <ChevronUp className="size-4" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}

/** Mounted only while the sheet is open, so localStorage is read in the browser only. */
function GameBoard({ logos }: { logos: GameLogo[] }) {
  const { paused, setPaused } = useMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [best, setBest] = useState(() => {
    const stored = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  });
  // Whether the visitor had paused the motion themselves before this round.
  const pausedBefore = useRef(false);

  useEffect(() => playRef.current?.focus(), []);

  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const fit = () => {
      const d = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * d;
      canvas.height = canvas.clientHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);

    const images = logos.map((l) => {
      const img = new Image();
      img.src = `/retailers/${l.logoFile}`;
      return img;
    });
    const css = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const colors = {
      star: css("--bubblegum"),
      burst: [css("--bubblegum"), css("--primary"), css("--spring")],
      ink: css("--navy"),
    };

    const W = () => canvas.clientWidth;
    const H = () => canvas.clientHeight;
    let prizes: Prize[] = [];
    let bursts: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      t: number;
      c: string;
    }[] = [];
    let floats: { x: number; y: number; t: number; s: string }[] = [];
    let px = W() / 2;
    let target = px;
    let face: 1 | -1 = 1;
    let points = 0;
    let shownSecond = ROUND_SECONDS;
    let sinceSpawn = 0;
    const keys = { left: false, right: false };
    const start = performance.now();
    let last = start;
    let frame = 0;

    const pointerX = (clientX: number) => {
      target = clientX - canvas.getBoundingClientRect().left;
    };
    const onMouse = (e: MouseEvent) => pointerX(e.clientX);
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) pointerX(e.touches[0].clientX);
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      const down = e.type === "keydown";
      if (e.key === "ArrowLeft") keys.left = down;
      else if (e.key === "ArrowRight") keys.right = down;
      else return;
      e.preventDefault();
    };
    canvas.addEventListener("mousemove", onMouse);
    canvas.addEventListener("touchmove", onTouch, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const finish = (final: number) => {
      setPlaying(false);
      setLastScore(final);
      setBest((b) => {
        if (final <= b) return b;
        window.localStorage.setItem(BEST_KEY, String(final));
        return final;
      });
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - start) / 1000;
      const left = Math.max(0, ROUND_SECONDS - elapsed);
      const w = W();
      const h = H();

      sinceSpawn += dt;
      while (sinceSpawn > spawnInterval(elapsed)) {
        sinceSpawn -= spawnInterval(elapsed);
        prizes.push(newPrize(Math.random, w, elapsed, logos.length));
      }
      if (keys.left) target -= 400 * dt;
      if (keys.right) target += 400 * dt;
      target = Math.max(20, Math.min(w - 20, target));
      const before = px;
      px += (target - px) * Math.min(1, dt * 10);
      if (Math.abs(px - before) > 0.5) face = px > before ? 1 : -1;

      ctx.clearRect(0, 0, w, h);
      for (const p of prizes) {
        advance(p, dt);
        ctx.save();
        ctx.translate(p.cx, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = p.logo === null ? colors.star : "rgba(31,42,92,.15)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-20, -14, 40, 28, 7);
        ctx.fill();
        ctx.stroke();
        const img = p.logo === null ? null : images[p.logo];
        if (p.logo === null) {
          ctx.fillStyle = colors.star;
          ctx.font = "800 18px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("★", 0, 1);
        } else if (img?.complete && img.naturalWidth) {
          const k = Math.min(34 / img.naturalWidth, 22 / img.naturalHeight);
          const iw = img.naturalWidth * k;
          const ih = img.naturalHeight * k;
          ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
        }
        ctx.restore();
      }

      const ground = h - 6;
      prizes = prizes.filter((p) => {
        if (isCaught(p, px, ground, SCALE)) {
          const gained = pointsFor(p);
          points += gained;
          setScore(points);
          floats.push({ x: p.cx, y: p.y, t: 0, s: `+${gained}` });
          for (let i = 0; i < 12; i++)
            bursts.push({
              x: p.cx,
              y: p.y,
              vx: (Math.random() - 0.5) * 200,
              vy: -Math.random() * 200,
              t: 0,
              c: colors.burst[i % 3],
            });
          return false;
        }
        return p.y < h + 40;
      });
      for (const b of bursts) {
        b.t += dt;
        b.vy += 500 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        ctx.globalAlpha = Math.max(0, 1 - b.t);
        ctx.fillStyle = b.c;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      bursts = bursts.filter((b) => b.t < 1);
      for (const f of floats) {
        f.t += dt;
        ctx.globalAlpha = Math.max(0, 1 - f.t);
        ctx.fillStyle = colors.ink;
        ctx.font = "800 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(f.s, f.x, f.y - f.t * 40);
      }
      floats = floats.filter((f) => f.t < 1);
      ctx.globalAlpha = 1;
      drawRunner(ctx, px, ground, now, face, SCALE);

      const second = Math.ceil(left);
      if (second !== shownSecond) {
        shownSecond = second;
        setTimeLeft(second);
      }
      if (left > 0) frame = requestAnimationFrame(step);
      else finish(points);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
      canvas.removeEventListener("mousemove", onMouse);
      canvas.removeEventListener("touchmove", onTouch);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [playing, logos]);

  // Motion stays paused for the whole round, and is given back when the round ends or the sheet
  // closes mid-round, unless the visitor had paused it.
  useEffect(() => {
    if (!playing) return;
    return () => {
      if (!pausedBefore.current) setPaused(false);
    };
  }, [playing, setPaused]);

  const play = () => {
    pausedBefore.current = paused;
    setPaused(true);
    setScore(0);
    setTimeLeft(ROUND_SECONDS);
    setPlaying(true);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between px-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
        <span>{msg("M-286")}</span>
        <span>
          {msg("M-289")}
          <b className="ml-1 text-[15px] tracking-normal text-foreground">
            {score}
          </b>
          <span className="ml-3">{msg("M-289b")}</span>
          <b className="ml-1 text-[15px] tracking-normal text-foreground">
            {timeLeft}
          </b>
          <span className="ml-3">{msg("M-289c")}</span>
          <b className="ml-1 text-[15px] tracking-normal text-foreground">
            {best}
          </b>
        </span>
      </div>
      <div className="relative overflow-hidden rounded-2xl bg-white/55 shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--navy)_15%,transparent)]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={msg("M-289d")}
          className="block h-[190px] w-full cursor-none"
        />
        {!playing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
            <button
              ref={playRef}
              type="button"
              onClick={play}
              className="rounded-[10px] bg-[var(--bubblegum)] px-4 py-2.5 text-sm font-bold text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)] outline-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--navy)]"
            >
              {lastScore === null
                ? msg("M-287")
                : msg("M-287b").replace("{score}", String(lastScore))}
            </button>
            <span className="text-xs text-[var(--navy)]/80">
              {msg("M-288")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
