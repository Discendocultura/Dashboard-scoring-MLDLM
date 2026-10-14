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
export const Cta = ({e, toque, grupo, final}) => {
  const {f, fps, ent} = useVida(4);
  const t = f / fps;
  const pulso = 1 + 0.04 * Math.sin(f / 4);
  const onda = (t - toque) * 1.6;
  const pG = spring({frame: f - Math.round(grupo * fps), fps, config: {damping: 12}});
  const pF = spring({frame: f - Math.round(final * fps), fps, config: {damping: 10}});
  return (
    <div style={{position: 'absolute', top: 70, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <div style={{position: 'relative', transform: `scale(${ent() * pulso})`}}>
        <div style={{background: e.primario, border: `4px solid ${e.acento}`, borderRadius: 999, padding: '26px 56px', boxShadow: '0 16px 40px rgba(0,0,0,.55)'}}>
          <span style={{fontFamily: e.fuenteTitulos, fontWeight: 700, fontSize: 52, color: e.claro}}>Reserva tu plaza gratis</span>
        </div>
        {onda > 0 && onda < 1 && <div style={{position: 'absolute', left: '72%', top: '50%', width: 260 * onda, height: 260 * onda, marginLeft: -130 * onda, marginTop: -130 * onda,
          borderRadius: '50%', border: `6px solid ${e.acento}`, opacity: 1 - onda}} />}
        {t >= toque - 0.3 && <div style={{position: 'absolute', left: '72%', top: '62%', fontSize: 90, transform: `translate(-20%, ${t < toque ? 30 : 0}px) scale(${t < toque + 0.1 && t > toque ? 0.9 : 1})`}}>👆</div>}
      </div>
      <div style={{marginTop: 44, display: 'flex', alignItems: 'center', gap: 16, background: e.claro, borderRadius: 999, padding: '14px 30px', opacity: pG, transform: `translateY(${(1 - pG) * 30}px)`, boxShadow: '0 10px 26px rgba(0,0,0,.45)'}}>
        <svg width="46" height="46" viewBox="0 0 24 24"><path fill="#25A244" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" /><circle cx="8" cy="12" r="1.4" fill="#fff" /><circle cx="12" cy="12" r="1.4" fill="#fff" /><circle cx="16" cy="12" r="1.4" fill="#fff" /></svg>
        <span style={{...caps(e), fontSize: 28, color: e.oscuro}}>Grupo privado</span>
      </div>
      {t >= final && <svg width="90" height="110" viewBox="0 0 90 110" style={{marginTop: 18, transform: `translateY(${Math.sin(f / 3) * 12}px) scale(${pF})`, filter: 'drop-shadow(0 6px 12px rgba(0,0,0,.7))'}}>
        <path d="M45 6 V84 M14 58 L45 92 L76 58" stroke={e.acento} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>}
    </div>
  );
};
