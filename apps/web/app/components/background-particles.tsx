"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  drift: number;
};

const FRAME_INTERVAL_MS = 1000 / 30;
const MAX_PIXEL_RATIO = 1.25;

export function BackgroundParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!canvas || !context || motionQuery.matches) return;

    let width = 0;
    let height = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastFrameAt = performance.now();
    let particles: Particle[] = [];

    const createParticle = (fromLeft = false): Particle => ({
      x: fromLeft ? -4 : Math.random() * width,
      y: Math.random() * height,
      size: 0.6 + Math.random() * 1.4,
      opacity: 0.18 + Math.random() * 0.42,
      speed: 0.04 + Math.random() * 0.14,
      drift: (Math.random() - 0.5) * 0.03,
    });

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const count = Math.min(36, Math.max(18, Math.round((width * height) / 80_000)));
      particles = Array.from({ length: count }, () => createParticle());
    };

    const draw = () => {
      const now = performance.now();
      const elapsed = now - lastFrameAt;
      lastFrameAt = now;

      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        particle.x += particle.speed * elapsed;
        particle.y += particle.drift * elapsed;
        if (particle.x > width + particle.size || particle.y < -particle.size || particle.y > height + particle.size) {
          Object.assign(particle, createParticle(true));
        }

        context.beginPath();
        context.fillStyle = `rgba(226, 232, 240, ${particle.opacity})`;
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
    };

    const scheduleNextFrame = () => {
      if (document.hidden) return;
      draw();
      timer = setTimeout(scheduleNextFrame, FRAME_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        return;
      }
      lastFrameAt = performance.now();
      scheduleNextFrame();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleNextFrame();

    return () => {
      if (timer) clearTimeout(timer);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="background-particles" aria-hidden="true" />;
}
