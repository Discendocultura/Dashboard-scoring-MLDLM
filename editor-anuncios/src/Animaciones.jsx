import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate} from 'remotion';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
// Entrada con muelle y salida suave en los últimos frames de la secuencia
const useVida = (salida = 8) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  return {f, fps, ent: (d = 0, cfg = {damping: 14}) => spring({frame: f - d, fps, config: cfg}),
    sal: interpolate(f, [durationInFrames - salida, durationInFrames], [1, 0], clamp)};
};
const caps = (e) => ({fontFamily: e.fuenteSubs, fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase'});

// Titulares que caen en avalancha: exceso de información
export const Titulares = ({e}) => {
  const {f, fps, ent, sal} = useVida(10);
  const etiquetas = ['Última hora', 'Urgente', 'En directo', 'Viral', 'Exclusiva', 'Alerta', 'Opinión', 'Tendencia'];
  return (
    <AbsoluteFill style={{opacity: sal}}>
      {etiquetas.map((t, i) => {
        const p = ent(i * 3, {damping: 12, stiffness: 140});
        const lado = i % 2 ? 1 : -1;
        const x = 70 + (i % 4) * 225 + lado * (1 - p) * 700;
        const y = 60 + Math.floor(i / 4) * 150 + (i % 3) * 18;
        const blur = interpolate(f, [fps * 1.6, fps * 2.6], [0, 6], clamp);
        return (
          <div key={i} style={{position: 'absolute', left: x - 40, top: y, width: 250, padding: '14px 16px', background: e.claro,
            borderLeft: `8px solid ${e.primario}`, boxShadow: '0 10px 24px rgba(0,0,0,.45)', transform: `rotate(${lado * (3 + i)}deg)`, filter: `blur(${blur}px)`}}>
            <div style={{...caps(e), fontSize: 20, color: e.primario}}>{t}</div>
            {[90, 70, 80].map((w, j) => <div key={j} style={{height: 9, width: `${w}%`, background: '#cfc6b8', marginTop: 9, borderRadius: 4}} />)}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Se va la luz: viñeta que se cierra sobre la cara con parpadeo
export const Apagon = () => {
  const {f, fps} = useVida();
  const parpadeo = f < fps * 0.4 ? (Math.floor(f / 2) % 2 ? 0.25 : 0.75) : 1;
  const cierre = interpolate(f, [0, fps * 0.5, fps * 1.4, fps * 1.9], [0, 1, 1, 0], clamp);
  const radio = interpolate(cierre, [0, 1], [140, 34]);
  return <AbsoluteFill style={{opacity: cierre * parpadeo,
    background: `radial-gradient(circle at 50% 33%, rgba(0,0,0,0) ${radio - 12}%, rgba(8,4,3,.93) ${radio + 14}%)`}} />;
};

// Cinta de titulares que se tacha: "no se arregla mirando más titulares"
export const Cinta = ({e}) => {
  const {f, fps, ent, sal} = useVida();
  const texto = 'ÚLTIMA HORA · URGENTE · EN DIRECTO · VIRAL · ALERTA · EXCLUSIVA · ';
  const tacha = interpolate(f, [fps * 0.9, fps * 1.25], [0, 100], clamp);
  return (
    <div style={{position: 'absolute', top: 150, left: 0, right: 0, opacity: sal, transform: `scaleY(${ent()})`}}>
      <div style={{background: e.primario, borderTop: `4px solid ${e.acento}`, borderBottom: `4px solid ${e.acento}`, padding: '18px 0', overflow: 'hidden', whiteSpace: 'nowrap', transform: 'rotate(-3deg)'}}>
        <span style={{...caps(e), fontSize: 44, color: e.claro, display: 'inline-block', transform: `translateX(${-f * 22}px)`}}>{texto.repeat(4)}</span>
      </div>
      <div style={{position: 'absolute', top: '50%', left: 40, height: 12, width: `${tacha * 0.92}%`, background: e.acento, transform: 'rotate(-3deg)', boxShadow: '0 4px 12px rgba(0,0,0,.5)'}} />
    </div>
  );
};

// Línea del tiempo que se dibuja: "entendiendo de dónde viene cada cosa"
export const LineaTiempo = ({e, hitos}) => {
  const {f, fps, ent, sal} = useVida();
  const traza = interpolate(f, [0, fps * 1.6], [0, 1], clamp);
  const x0 = 90, x1 = 990, y = 230;
  return (
    <AbsoluteFill style={{opacity: sal}}>
      <div style={{position: 'absolute', left: x0, top: y, height: 6, width: (x1 - x0) * traza, background: e.acento, boxShadow: '0 0 18px rgba(184,145,58,.7)'}} />
      {hitos.map((h, i) => {
        const x = x0 + ((x1 - x0) * i) / (hitos.length - 1);
        const p = ent(i * 8 + 2, {damping: 10, stiffness: 200});
        const ultimo = i === hitos.length - 1;
        return (
          <div key={i} style={{position: 'absolute', left: x - 90, top: y - 82, width: 180, textAlign: 'center', transform: `scale(${p})`}}>
            <div style={{fontFamily: e.fuenteTitulos, fontWeight: 700, fontSize: ultimo ? 52 : 44, color: ultimo ? e.acento : e.claro, textShadow: '0 4px 14px rgba(0,0,0,.8)'}}>{h}</div>
            <div style={{margin: '14px auto 0', width: ultimo ? 30 : 22, height: ultimo ? 30 : 22, borderRadius: '50%', background: ultimo ? e.acento : e.claro, border: `4px solid ${e.oscuro}`}} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Tarjeta del evento, con fases según lo que se dice
export const Evento = ({e, fases}) => {
  const {f, fps, ent, sal} = useVida(10);
  const t = f / fps;
  const fase = [...fases].reverse().find((x) => t >= x.desde) || fases[0];
  const pFase = ent(Math.round(fase.desde * fps), {damping: 13});
  const sello = fases.find((x) => x.sello);
  const pSello = sello ? spring({frame: f - Math.round(sello.sello * fps), fps, config: {damping: 8, stiffness: 260}}) : 0;
  return (
    <div style={{position: 'absolute', top: 60, left: 70, right: 70, opacity: sal, transform: `translateY(${(1 - ent()) * -380}px)`}}>
      <div style={{background: e.claro, border: `3px solid ${e.acento}`, outline: `10px solid ${e.primario}`, padding: '26px 30px 24px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,.55)'}}>
        <div style={{...caps(e), fontSize: 22, color: e.acento}}>{fase.antetitulo}</div>
        <div style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 76, lineHeight: 1.05, color: e.primario, marginTop: 6}}>{fase.titulo}</div>
        <div style={{height: 3, width: 140, background: e.acento, margin: '14px auto'}} />
        <div style={{fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontSize: 38, color: e.oscuro, opacity: pFase, transform: `translateY(${(1 - pFase) * 20}px)`}}>
          {fase.linea}{fase.tachado && <span style={{position: 'relative', marginLeft: 12}}>{fase.tachado}
            <span style={{position: 'absolute', left: -4, top: '55%', height: 5, background: e.primario, width: `${interpolate(t, [fase.tachaEn, fase.tachaEn + 0.3], [0, 106], clamp)}%`}} /></span>}
        </div>
      </div>
      {sello && <div style={{position: 'absolute', right: -24, top: -34, width: 150, height: 150, borderRadius: '50%', background: e.primario, border: `5px dashed ${e.acento}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(-14deg) scale(${pSello * (t < sello.sello ? 0 : 1)})`, boxShadow: '0 10px 26px rgba(0,0,0,.5)'}}>
        <span style={{...caps(e), fontSize: 30, letterSpacing: 2, color: e.claro}}>Gratis</span>
      </div>}
    </div>
  );
};

// Contador 0 → 60.000 con "personas"
export const Contador = ({e, hasta, etiqueta}) => {
  const {f, fps, ent, sal} = useVida(6);
  const n = Math.round(interpolate(f, [0, fps * 1.1], [0, hasta], {...clamp, easing: (x) => 1 - Math.pow(1 - x, 3)}));
  return (
    <div style={{position: 'absolute', top: e.grandeAltura - e.grandeCuerpo - 10, width: '100%', textAlign: 'center', opacity: sal, transform: `scale(${ent(0, {damping: 9, stiffness: 180})})`}}>
      <div style={{fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 800, fontSize: e.grandeCuerpo + 20, lineHeight: 1, color: e.claro,
        WebkitTextStroke: `10px ${e.oscuro}`, paintOrder: 'stroke fill', textShadow: '0 10px 30px rgba(0,0,0,.6)'}}>+{n.toLocaleString('es-ES')}</div>
      <div style={{...caps(e), fontSize: 46, color: e.acento, marginTop: 30, WebkitTextStroke: `6px ${e.oscuro}`, paintOrder: 'stroke fill', textShadow: '0 4px 12px rgba(0,0,0,.8)'}}>{etiqueta}</div>
    </div>
  );
};

// Personitas que se van llenando en la franja superior
export const Multitud = ({e}) => {
  const {f, sal} = useVida();
  const cols = 14, filas = 3;
  return (
    <AbsoluteFill style={{opacity: sal}}>
      {Array.from({length: cols * filas}).map((_, i) => {
        const on = interpolate(f, [i * 0.7, i * 0.7 + 5], [0, 1], clamp);
        const x = 95 + (i % cols) * 66, y = 90 + Math.floor(i / cols) * 92;
        const c = i % 9 === 4 ? e.acento : e.claro;
        return (
          <div key={i} style={{position: 'absolute', left: x, top: y, opacity: on, transform: `translateY(${(1 - on) * 20}px)`}}>
            <div style={{width: 22, height: 22, borderRadius: '50%', background: c, margin: '0 auto'}} />
            <div style={{width: 40, height: 28, borderRadius: '20px 20px 6px 6px', background: c, marginTop: 5}} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Llamada a la acción: botón con pulsación, chip de grupo privado y flecha final
export const Cta = ({e, toque, grupo, final, texto = 'Reserva tu plaza gratis', chip = 'Grupo privado'}) => {
  const {f, fps, ent} = useVida(4);
  const t = f / fps;
  const pulso = 1 + 0.04 * Math.sin(f / 4);
  const onda = (t - toque) * 1.6;
  const pG = grupo != null ? spring({frame: f - Math.round(grupo * fps), fps, config: {damping: 12}}) : 0;
  const pF = final != null ? spring({frame: f - Math.round(final * fps), fps, config: {damping: 10}}) : 0;
  return (
    <div style={{position: 'absolute', top: 70, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <div style={{position: 'relative', transform: `scale(${ent() * pulso})`}}>
        <div style={{background: e.primario, border: `4px solid ${e.acento}`, borderRadius: 999, padding: '26px 56px', boxShadow: '0 16px 40px rgba(0,0,0,.55)'}}>
          <span style={{fontFamily: e.fuenteTitulos, fontWeight: 700, fontSize: 52, color: e.claro}}>{texto}</span>
        </div>
        {onda > 0 && onda < 1 && <div style={{position: 'absolute', left: '72%', top: '50%', width: 260 * onda, height: 260 * onda, marginLeft: -130 * onda, marginTop: -130 * onda,
          borderRadius: '50%', border: `6px solid ${e.acento}`, opacity: 1 - onda}} />}
        {t >= toque - 0.3 && <div style={{position: 'absolute', left: '72%', top: '62%', fontSize: 90, transform: `translate(-20%, ${t < toque ? 30 : 0}px) scale(${t < toque + 0.1 && t > toque ? 0.9 : 1})`}}>👆</div>}
      </div>
      {chip && grupo != null && <div style={{marginTop: 44, display: 'flex', alignItems: 'center', gap: 16, background: e.claro, borderRadius: 999, padding: '14px 30px', opacity: pG, transform: `translateY(${(1 - pG) * 30}px)`, boxShadow: '0 10px 26px rgba(0,0,0,.45)'}}>
        <svg width="46" height="46" viewBox="0 0 24 24"><path fill="#25A244" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" /><circle cx="8" cy="12" r="1.4" fill="#fff" /><circle cx="12" cy="12" r="1.4" fill="#fff" /><circle cx="16" cy="12" r="1.4" fill="#fff" /></svg>
        <span style={{...caps(e), fontSize: 28, color: e.oscuro}}>{chip}</span>
      </div>}
      {final != null && t >= final && <svg width="90" height="110" viewBox="0 0 90 110" style={{marginTop: 18, transform: `translateY(${Math.sin(f / 3) * 12}px) scale(${pF})`, filter: 'drop-shadow(0 6px 12px rgba(0,0,0,.7))'}}>
        <path d="M45 6 V84 M14 58 L45 92 L76 58" stroke={e.acento} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>}
    </div>
  );
};

// ───────────── Animaciones de temática fertilidad / El Camino (sirven para cualquier plantilla) ─────────────
const ex = (e, k, def) => (e.extra && e.extra[k]) || def;

// Test de embarazo: la segunda raya aparece (positivo), no aparece (negativo) o parpadea (esperando)
export const Test = ({e, resultado = 'negativo', etiqueta}) => {
  const {f, fps, ent, sal} = useVida(8);
  const p = ent(0, {damping: 13});
  const t = f / fps;
  const segunda = resultado === 'positivo' ? interpolate(t, [0.8, 1.6], [0, 1], clamp)
    : resultado === 'esperando' ? 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5)) : interpolate(t, [0.8, 1.3, 1.6], [0, 0.35, 0], clamp);
  return (
    <div style={{position: 'absolute', top: 70, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: sal,
      transform: `translateY(${(1 - p) * -300}px) rotate(${(1 - p) * -12}deg)`}}>
      <svg width="560" height="170" viewBox="0 0 560 170" style={{filter: 'drop-shadow(0 14px 22px rgba(0,0,0,.45))'}}>
        <rect x="10" y="40" width="540" height="90" rx="45" fill={ex(e, 'blanco', '#fff')} />
        <rect x="10" y="40" width="190" height="90" rx="45" fill={e.claro} />
        <rect x="170" y="40" width="40" height="90" fill={ex(e, 'pastel', e.claro)} />
        <rect x="270" y="58" width="190" height="54" rx="14" fill={ex(e, 'pastel', '#eee')} stroke={ex(e, 'linea', '#ddd')} strokeWidth="3" />
        <rect x="320" y="62" width="12" height="46" rx="3" fill={e.primario} />
        <rect x="380" y="62" width="12" height="46" rx="3" fill={e.primario} opacity={segunda} />
        <circle cx="500" cy="85" r="16" fill={ex(e, 'pastel', '#eee')} />
      </svg>
      {etiqueta && <div style={{...caps(e), marginTop: 10, fontSize: 30, color: e.claro, background: e.primario, padding: '10px 24px', borderRadius: 999,
        opacity: interpolate(t, [1.6, 2], [0, 1], clamp)}}>{etiqueta}</div>}
    </div>
  );
};

// Calendario: los días se van tachando (meses que pasan); opcional un día destacado que se tacha («día 14»)
export const Calendario = ({e, titulo = 'Mes tras mes', tachar = 28, destacar}) => {
  const {f, fps, ent, sal} = useVida(8);
  const p = ent(0, {damping: 14});
  const t = f / fps;
  const vel = Math.max(1, tachar) / 1.8;
  return (
    <div style={{position: 'absolute', top: 60, left: 150, right: 150, opacity: sal, transform: `translateY(${(1 - p) * -380}px)`}}>
      <div style={{background: ex(e, 'blanco', '#fff'), borderRadius: 20, border: `1px solid ${ex(e, 'linea', '#ddd')}`, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,.45)'}}>
        <div style={{...caps(e), background: e.primario, color: e.claro, fontSize: 26, padding: '12px 0', textAlign: 'center'}}>{titulo}</div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, padding: 14}}>
          {Array.from({length: 28}).map((_, i) => {
            const dia = i + 1, d = dia === destacar;
            const x = interpolate(t, [0.3 + i / vel, 0.3 + i / vel + 0.15], [0, 1], clamp) * (i < tachar ? 1 : 0);
            return (
              <div key={i} style={{position: 'relative', height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: d ? e.primario : ex(e, 'pastel', '#f3f3f3'), fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 20, color: d ? e.claro : ex(e, 'titulos', '#333')}}>
                {dia}
                <svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none" style={{position: 'absolute', inset: 0}}>
                  <line x1="1.5" y1="8.5" x2={1.5 + 7 * x} y2={8.5 - 7 * x} stroke={d ? e.claro : e.primario} strokeWidth="1.1" strokeLinecap="round" />
                </svg>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Preguntas que flotan alrededor (dudas): chips que entran escalonados
// `en`: segundo (desde el inicio de la animación) en que entra cada frase; si no se da, entran cada 0,45 s
export const Preguntas = ({e, textos, en}) => {
  const {f, fps, sal} = useVida(10);
  return (
    <AbsoluteFill style={{opacity: sal}}>
      {textos.map((q, i) => {
        const p = spring({frame: f - Math.round(fps * (en ? en[i] : i * 0.45)), fps, config: {damping: 12}});
        const lado = i % 2 ? 'right' : 'left';
        return (
          <div key={i} style={{position: 'absolute', top: 70 + i * 104, [lado]: 50, maxWidth: 760, opacity: p,
            transform: `translateX(${(1 - p) * (lado === 'left' ? -200 : 200)}px) rotate(${i % 2 ? 2 : -2}deg)`,
            background: i === textos.length - 1 ? e.primario : ex(e, 'blanco', '#fff'), color: i === textos.length - 1 ? e.claro : e.primario,
            borderRadius: 22, padding: '18px 28px', boxShadow: '0 12px 28px rgba(0,0,0,.4)',
            fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 900, fontSize: 40, lineHeight: 1.15}}>{q}</div>
        );
      })}
    </AbsoluteFill>
  );
};

// Lista que se va marcando (p. ej. pruebas «normales»); la última línea opcional queda como pregunta final
// `en`: segundo de entrada de cada elemento y `finalEn` el de la frase final (si no, cada 0,55 s)
export const Lista = ({e, items, final, en, finalEn}) => {
  const {f, fps, ent, sal} = useVida(10);
  const t = f / fps;
  return (
    <div style={{position: 'absolute', top: 60, left: 120, right: 120, opacity: sal, transform: `translateY(${(1 - ent()) * -380}px)`}}>
      <div style={{background: ex(e, 'blanco', '#fff'), borderRadius: 20, border: `1px solid ${ex(e, 'linea', '#ddd')}`, padding: '22px 30px', boxShadow: '0 16px 40px rgba(0,0,0,.45)'}}>
        {items.map((it, i) => {
          const t0 = en ? en[i] : 0.4 + i * 0.55;
          const on = interpolate(t, [t0, t0 + 0.2], [0, 1], clamp);
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 18, padding: '8px 0', opacity: 0.35 + 0.65 * on}}>
              <div style={{width: 46, height: 46, borderRadius: '50%', background: on > 0.5 ? e.acento : ex(e, 'pastel', '#eee'), display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: ex(e, 'blanco', '#fff'), fontSize: 30, fontWeight: 900, transform: `scale(${0.7 + 0.3 * on})`}}>✓</div>
              <span style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 38, color: ex(e, 'titulos', '#333')}}>{it}</span>
            </div>
          );
        })}
        {final && <div style={{marginTop: 10, fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 900, fontSize: 44, color: e.primario,
          opacity: interpolate(t, finalEn != null ? [finalEn, finalEn + 0.3] : [0.6 + items.length * 0.55, 0.9 + items.length * 0.55], [0, 1], clamp)}}>{final}</div>}
      </div>
    </div>
  );
};

// Montaña rusa emocional: la línea se dibuja y un punto la recorre, con etiquetas arriba y abajo
export const Montana = ({e, arriba = 'Ilusión', abajo = 'Frustración'}) => {
  const {f, fps, sal} = useVida(10);
  const t = f / fps;
  const prog = interpolate(t, [0, 2.6], [0, 1], clamp);
  const pts = Array.from({length: 61}, (_, i) => [40 + i * 15.3, 190 - 120 * Math.sin(i / 60 * Math.PI * 3.2) * (0.6 + 0.4 * Math.sin(i / 9))]);
  const n = Math.max(2, Math.round(prog * 60) + 1);
  const d = pts.slice(0, n).map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const [cx, cy] = pts[n - 1];
  return (
    <div style={{position: 'absolute', top: 40, left: 0, right: 0, opacity: sal}}>
      <svg width="1080" height="380" viewBox="0 0 1000 380">
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} stroke={ex(e, 'tierraClaro', e.claro)} strokeOpacity=".35" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d={d} stroke={e.acento} strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={cx} cy={cy} r="20" fill={e.primario} stroke={e.claro} strokeWidth="6" />
      </svg>
      <div style={{position: 'absolute', top: 6, left: 70, ...caps(e), fontSize: 30, color: e.claro, background: e.acento, padding: '8px 18px', borderRadius: 999}}>{arriba} ↑</div>
      <div style={{position: 'absolute', top: 300, right: 70, ...caps(e), fontSize: 30, color: e.claro, background: e.primario, padding: '8px 18px', borderRadius: 999}}>{abajo} ↓</div>
    </div>
  );
};

// Semilla en la tierra: brota si el terreno está preparado (crecer=true) o se queda quieta
export const Semilla = ({e, crecer = true, etiqueta}) => {
  const {f, fps, sal} = useVida(10);
  const t = f / fps;
  const caida = interpolate(t, [0, 0.6], [-260, 0], {...clamp, easing: (x) => x * x});
  const tallo = crecer ? interpolate(t, [0.9, 2.2], [0, 1], clamp) : 0;
  const hoja = crecer ? spring({frame: f - Math.round(fps * 1.8), fps, config: {damping: 10}}) : 0;
  return (
    <div style={{position: 'absolute', top: 40, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: sal}}>
      <svg width="600" height="330" viewBox="0 0 600 330">
        <ellipse cx="300" cy="290" rx="280" ry="50" fill={ex(e, 'colinas', ['#e2c9b2'])[2] || e.acento} />
        <ellipse cx="300" cy="280" rx="230" ry="34" fill={ex(e, 'tierraOscuro', e.acento)} />
        <path d={`M300 272 C 300 ${272 - 120 * tallo}, 300 ${272 - 160 * tallo}, 300 ${272 - 190 * tallo}`} stroke="#6f8f4e" strokeWidth="10" fill="none" strokeLinecap="round" />
        <g transform={`translate(300 ${272 - 150 * tallo}) scale(${hoja})`}>
          <path d="M0 0 C -60 -10 -80 -60 -90 -70 C -40 -70 -10 -40 0 0" fill="#7fa35a" />
          <path d="M0 -20 C 60 -30 80 -80 90 -90 C 40 -90 10 -60 0 -20" fill="#8db866" />
        </g>
        <ellipse cx="300" cy={262 + caida} rx="16" ry="11" fill={e.oscuro} />
      </svg>
      {etiqueta && <div style={{...caps(e), fontSize: 30, color: e.claro, background: e.primario, padding: '10px 24px', borderRadius: 999, marginTop: -10,
        opacity: interpolate(t, [1, 1.4], [0, 1], clamp)}}>{etiqueta}</div>}
    </div>
  );
};

// Móvil con la app de ciclo: «Ovulación: día 14» que se tacha
export const App = ({e, texto = 'Ovulación: día 14', tachaEn = 1.4}) => {
  const {f, fps, ent, sal} = useVida(8);
  const t = f / fps;
  const tacha = interpolate(t, [tachaEn, tachaEn + 0.35], [0, 100], clamp);
  return (
    <div style={{position: 'absolute', top: 40, right: 70, width: 300, opacity: sal, transform: `translateX(${(1 - ent()) * 420}px) rotate(6deg)`}}>
      <div style={{background: '#1c1513', borderRadius: 40, padding: 14, boxShadow: '0 20px 40px rgba(0,0,0,.55)'}}>
        <div style={{background: e.claro, borderRadius: 28, padding: '26px 18px', height: 380, textAlign: 'center'}}>
          <div style={{...caps(e), fontSize: 18, color: e.acento}}>Mi ciclo</div>
          <div style={{margin: '18px auto', width: 150, height: 150, borderRadius: '50%', border: `14px solid ${ex(e, 'pastel', '#eee')}`, borderTopColor: e.primario,
            transform: `rotate(${f * 3}deg)`}} />
          <div style={{position: 'relative', display: 'inline-block', whiteSpace: 'nowrap', fontFamily: e.fuenteSubs, fontWeight: 900, fontSize: 25, color: ex(e, 'titulos', '#333')}}>
            {texto}
            <div style={{position: 'absolute', left: -6, top: '52%', height: 6, width: `${tacha * 1.08}%`, background: e.primario}} />
          </div>
        </div>
      </div>
    </div>
  );
};

// El Camino: sendero punteado con mojones numerados y la meta (concha); sirve para «3 pilares» o pasos
export const Camino = ({e, hitos = ['1', '2', '3'], meta = 'Tu positivo', titulo}) => {
  const {f, fps, sal} = useVida(10);
  const t = f / fps;
  const prog = interpolate(t, [0.2, 2.4], [0, 1], clamp);
  const path = 'M 60 300 C 260 300, 260 130, 500 150 S 760 300, 960 110';
  const n = hitos.length;
  return (
    <div style={{position: 'absolute', top: 30, left: 0, right: 0, opacity: sal}}>
      {titulo && <div style={{textAlign: 'center', ...caps(e), fontSize: 30, color: e.claro, textShadow: '0 4px 12px rgba(0,0,0,.8)'}}>{titulo}</div>}
      <svg width="1080" height="360" viewBox="0 0 1020 360">
        <path d={path} stroke={ex(e, 'tierraClaro', e.claro)} strokeWidth="18" fill="none" strokeLinecap="round" pathLength="1" strokeDasharray={`${prog} 1`} />
        <path d={path} stroke={e.acento} strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray="2 14" strokeDashoffset={-f * 1.5}
          style={{clipPath: `inset(0 ${100 - prog * 100}% 0 0)`}} />
        {hitos.map((h, i) => {
          const x = 60 + ((960 - 60) * (i + 1)) / (n + 1);
          const y = i === 0 ? 255 : i === n - 1 ? 220 : 160;
          const p = spring({frame: f - Math.round(fps * (0.5 + (i * 1.6) / n)), fps, config: {damping: 10}});
          return (
            <g key={i} transform={`translate(${x} ${y - 40}) scale(${p})`}>
              <path d="M -34 40 L -30 -30 Q 0 -52 30 -30 L 34 40 Z" fill={e.claro} stroke={ex(e, 'tierraOscuro', e.acento)} strokeWidth="4" />
              <rect x="-24" y="-16" width="48" height="36" rx="6" fill={e.primario} />
              <text x="0" y="12" textAnchor="middle" fontFamily={e.fuenteTitulos} fontWeight="900" fontSize="28" fill={e.claro}>{h}</text>
            </g>
          );
        })}
        <g transform={`translate(960 110) scale(${spring({frame: f - Math.round(fps * 2.3), fps, config: {damping: 9}})})`}>
          <circle r="46" fill={e.primario} stroke={e.claro} strokeWidth="5" />
          {/* concha de vieira: abanico con costillas y las dos «orejas» de la base */}
          <path d="M 0 24 L -30 -4 A 32 32 0 0 1 30 -4 Z" fill={e.claro} />
          {[-24, -12, 0, 12, 24].map((x) => <line key={x} x1="0" y1="22" x2={x} y2={x === 0 ? -30 : -30 + Math.abs(x) * 0.7} stroke={e.primario} strokeWidth="3" strokeLinecap="round" />)}
          <path d="M -12 22 L -18 32 L 18 32 L 12 22 Z" fill={e.claro} />
        </g>
      </svg>
      <div style={{position: 'absolute', top: titulo ? 210 : 175, right: 30, ...caps(e), fontSize: 26, color: e.claro, background: e.primario, padding: '8px 18px', borderRadius: 999,
        opacity: interpolate(t, [2.4, 2.8], [0, 1], clamp)}}>{meta}</div>
    </div>
  );
};
