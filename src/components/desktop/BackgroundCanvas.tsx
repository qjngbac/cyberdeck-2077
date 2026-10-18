import React, { useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';

export const BackgroundCanvas: React.FC = () => {
  const { state } = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      if (state.bgMode === 'minimal') {
        ctx.fillStyle = '#06080d';
        ctx.fillRect(0, 0, width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    if (state.bgMode === 'minimal') {
      ctx.fillStyle = '#06080d';
      ctx.fillRect(0, 0, width, height);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    // Stars generation for Nebula mode
    interface Star {
      x: number;
      y: number;
      radius: number;
      baseAlpha: number;
      twinkleSpeed: number;
      phase: number;
    }
    const stars: Star[] = Array.from({ length: 90 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5 + 0.5,
      baseAlpha: Math.random() * 0.5 + 0.2,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      phase: Math.random() * Math.PI * 2,
    }));

    // Rain particles for gentle rain mode
    interface RainDrop {
      x: number;
      y: number;
      length: number;
      speed: number;
      alpha: number;
    }
    const raindrops: RainDrop[] = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      length: Math.random() * 18 + 10,
      speed: Math.random() * 3 + 2,
      alpha: Math.random() * 0.25 + 0.1,
    }));

    // Matrix characters
    const chars = '010177⚡功德量子修仙CODE';
    const fontSize = 14;
    const columns = Math.floor(width / fontSize);
    const drops: number[] = new Array(columns).fill(1);

    let time = 0;
    let animId: number;

    const render = () => {
      if (paused) return;
      time += 0.008;

      if (state.bgMode === 'nebula') {
        // 1. Base dark background
        ctx.fillStyle = '#06080e';
        ctx.fillRect(0, 0, width, height);

        // 2. Slow soothing nebula glow blobs
        // Blob 1: Dark Cyan / Blue
        const blob1X = width * 0.3 + Math.sin(time * 0.7) * 80;
        const blob1Y = height * 0.35 + Math.cos(time * 0.5) * 60;
        const grad1 = ctx.createRadialGradient(blob1X, blob1Y, 10, blob1X, blob1Y, width * 0.45);
        grad1.addColorStop(0, 'rgba(0, 180, 216, 0.08)');
        grad1.addColorStop(0.5, 'rgba(10, 40, 80, 0.04)');
        grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, width, height);

        // Blob 2: Deep Purple / Violet
        const blob2X = width * 0.75 + Math.cos(time * 0.6) * 90;
        const blob2Y = height * 0.65 + Math.sin(time * 0.8) * 70;
        const grad2 = ctx.createRadialGradient(blob2X, blob2Y, 10, blob2X, blob2Y, width * 0.4);
        grad2.addColorStop(0, 'rgba(147, 51, 234, 0.07)');
        grad2.addColorStop(0.6, 'rgba(60, 20, 100, 0.03)');
        grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, width, height);

        // 3. Twinkling soft stars
        stars.forEach((s) => {
          s.phase += s.twinkleSpeed;
          const currentAlpha = s.baseAlpha + Math.sin(s.phase) * 0.2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 230, 255, ${Math.max(0.05, currentAlpha)})`;
          ctx.fill();
        });
      } else if (state.bgMode === 'wave') {
        // Soft digital mesh wave
        ctx.fillStyle = '#06080e';
        ctx.fillRect(0, 0, width, height);

        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          const waveY = height * 0.5 + i * 40;
          ctx.strokeStyle = `rgba(0, 240, 255, ${0.05 + i * 0.03})`;
          for (let x = 0; x < width; x += 10) {
            const y = waveY + Math.sin(x * 0.005 + time * 2 + i) * 30 + Math.cos(x * 0.002 + time) * 20;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (state.bgMode === 'rain') {
        // Gentle soothing rain
        ctx.fillStyle = 'rgba(6, 8, 14, 0.3)';
        ctx.fillRect(0, 0, width, height);

        raindrops.forEach((drop) => {
          drop.y += drop.speed;
          if (drop.y > height) {
            drop.y = -20;
            drop.x = Math.random() * width;
          }

          ctx.beginPath();
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x, drop.y + drop.length);
          ctx.strokeStyle = `rgba(0, 210, 255, ${drop.alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      } else if (state.bgMode === 'matrix') {
        // Softer, slower matrix rain
        ctx.fillStyle = 'rgba(6, 8, 14, 0.15)';
        ctx.fillRect(0, 0, width, height);

        ctx.font = `${fontSize}px monospace`;
        ctx.fillStyle = 'rgba(0, 255, 102, 0.6)';

        for (let i = 0; i < drops.length; i++) {
          if (i % 2 === 0) { // reduce density
            const text = chars[Math.floor(Math.random() * chars.length)];
            const x = i * fontSize;
            const y = drops[i] * fontSize;

            ctx.fillText(text, x, y);

            if (y > height && Math.random() > 0.985) {
              drops[i] = 0;
            }
            drops[i]++;
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    // A 摸鱼 tool spends most of its life in a background tab. Without this the
    // full-screen canvas kept compositing at 60fps while hidden.
    let paused = false;
    const onVisibility = () => {
      if (document.hidden) {
        paused = true;
        cancelAnimationFrame(animId);
      } else if (paused) {
        paused = false;
        animId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    if (!document.hidden) render();

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', handleResize);
    };
  }, [state.bgMode]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
};
