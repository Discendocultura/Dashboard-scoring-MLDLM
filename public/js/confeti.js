// Confeti a pantalla completa en un <canvas> (crear un embudo, terminar la marca…). Dura unos 3,5 s; con
// «reducir movimiento» del sistema no hace nada. `sigue()`: mientras devuelva true, se sigue pintando.
export function lanzarConfeti(canvas, { sigue = () => true } = {}) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth; const H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const colores = ['#ff5a36', '#ffb020', '#2ec27e', '#3d8bfd', '#c061cb', '#ff7eb6', '#ffd23f'];
  const piezas = Array.from({ length: Math.min(220, Math.round(W / 5)) }, (_, i) => {
    // Un tercio llueve desde arriba; el resto sale disparado desde los dos lados.
    const lluvia = i % 3 === 2;
    const izq = i % 2 === 0;
    return {
      x: lluvia ? Math.random() * W : izq ? -10 : W + 10, y: lluvia ? -20 - Math.random() * H * 0.4 : H * (0.55 + Math.random() * 0.3),
      vx: lluvia ? (Math.random() - 0.5) * 3 : (izq ? 1 : -1) * (4 + Math.random() * 9), vy: lluvia ? 2 + Math.random() * 3 : -(9 + Math.random() * 11),
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 10, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: colores[i % colores.length], redondo: Math.random() < 0.25,
    };
  });
  const inicio = performance.now();
  const paso = (t) => {
    const dt = t - inicio;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = dt > 2800 ? Math.max(0, 1 - (dt - 2800) / 700) : 1;
    for (const p of piezas) {
      p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      if (p.redondo) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      ctx.restore();
    }
    if (dt < 3500 && sigue()) requestAnimationFrame(paso); else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(paso);
}
