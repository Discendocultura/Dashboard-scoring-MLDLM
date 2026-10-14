import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate, staticFile} from 'remotion';
import * as A from './Animaciones';
import './fuentes';

// Agrupa palabras en bloques de N sin cruzar el final de frase
const bloques = (words, n) => {
  const out = []; let cur = [];
  words.forEach((w) => { cur.push(w); if (cur.length === n || /[.?!…:]$/.test(w.text)) { out.push(cur); cur = []; } });
  if (cur.length) out.push(cur);
  return out;
};

const Subtitulos = ({words, grandes, e}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig(); const t = f / fps;
  if (grandes.some((g) => t >= g.start && t < g.start + g.dur)) return null; // la palabra grande manda
  const b = bloques(words, e.subPalabras).find((x) => t >= x[0].start && t < x[x.length - 1].end + 0.15);
  if (!b) return null;
  const pop = spring({frame: f - Math.round(b[0].start * fps), fps, config: {damping: 14, stiffness: 220}});
  return (
    <div style={{position: 'absolute', top: e.subAltura, width: '100%', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0 22px', padding: '0 90px', transform: `scale(${0.85 + 0.15 * pop})`}}>
      {b.map((w, i) => {
        const on = w === b.filter((x) => x.start <= t).pop();
        return <span key={i} style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: e.subCuerpo, lineHeight: 1.15, textTransform: 'uppercase',
          color: on ? e.acento : e.claro, WebkitTextStroke: `10px ${e.oscuro}`, paintOrder: 'stroke fill',
          textShadow: '0 6px 18px rgba(0,0,0,.45)'}}>{w.text}</span>;
      })}
    </div>
  );
};

const Gancho = ({texto, e}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const ent = spring({frame: f, fps, config: {damping: 16}});
  const sal = interpolate(f, [durationInFrames - 8, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', top: 70, left: 60, right: 60, opacity: sal, transform: `translateY(${(1 - ent) * -60}px)`}}>
      <div style={{background: e.primario, borderTop: `6px solid ${e.acento}`, borderBottom: `6px solid ${e.acento}`, padding: '26px 36px', boxShadow: '0 18px 40px rgba(0,0,0,.35)'}}>
        <div style={{fontFamily: e.fuenteTitulos, fontWeight: 700, fontSize: 60, lineHeight: 1.12, color: e.claro, textAlign: 'center'}}>{texto}</div>
      </div>
    </div>
  );
};

const Grande = ({texto, e}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const s = spring({frame: f, fps, config: {damping: 9, stiffness: 180}});
  const raya = spring({frame: f - 4, fps, config: {damping: 20}});
  const o = interpolate(f, [durationInFrames - 6, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', top: e.grandeAltura - e.grandeCuerpo, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: o, transform: `scale(${s})`, padding: '0 60px'}}>
      <span style={{fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 800, fontSize: e.grandeCuerpo, lineHeight: 1.05, textAlign: 'center', color: e.claro,
        WebkitTextStroke: `10px ${e.oscuro}`, paintOrder: 'stroke fill', textShadow: '0 10px 30px rgba(0,0,0,.6)'}}>{texto}</span>
      <div style={{marginTop: 14, height: 10, width: `${raya * 60}%`, background: e.acento, boxShadow: '0 4px 14px rgba(0,0,0,.5)'}} />
    </div>
  );
};

const Barra = ({e}) => {
  const f = useCurrentFrame(); const {durationInFrames} = useVideoConfig();
  return <div style={{position: 'absolute', bottom: 0, left: 0, height: e.barraAlto, width: `${(f / durationInFrames) * 100}%`, background: e.acento}} />;
};

// Zoom: lento ("zoom") o de golpe ("salto")
const escala = (t, zooms) => {
  let s = 1;
  for (const z of zooms) {
    if (t < z.start || t > z.start + z.dur) continue;
    if (z.tipo === 'salto') s = 1.18;
    else s = interpolate(t, [z.start, z.start + z.dur], [1, 1.12]);
  }
  return s;
};

const RENDER = {titulares: A.Titulares, apagon: A.Apagon, cinta: A.Cinta, linea: A.LineaTiempo, evento: A.Evento, contador: A.Contador, multitud: A.Multitud, cta: A.Cta};

export const Anuncio = ({video, fondo, words, gancho, grandes, zooms, animaciones = [], estilo: e}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig(); const t = f / fps;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <AbsoluteFill style={{transform: `scale(${escala(t, zooms)})`, transformOrigin: '50% 38%'}}>
        {video ? <OffthreadVideo src={staticFile(video)} muted /> : <AbsoluteFill style={{background: fondo}} />}
      </AbsoluteFill>
      {animaciones.filter((a) => a.tipo === 'apagon').map((a, i) => <Sequence key={'d' + i} from={Math.round(a.start * fps)} durationInFrames={Math.round(a.dur * fps)}><A.Apagon /></Sequence>)}
      {animaciones.filter((a) => a.tipo !== 'apagon').map((a, i) => { const C = RENDER[a.tipo];
        return <Sequence key={'a' + i} from={Math.round(a.start * fps)} durationInFrames={Math.round(a.dur * fps)}><C e={e} {...a} /></Sequence>; })}
      <Subtitulos words={words} grandes={[...grandes, ...animaciones.filter((a) => a.tipo === 'contador')]} e={e} />
      {grandes.map((g, i) => <Sequence key={i} from={Math.round(g.start * fps)} durationInFrames={Math.round(g.dur * fps)}><Grande texto={g.text} e={e} /></Sequence>)}
      {gancho && <Sequence durationInFrames={Math.round(e.ganchoDura * fps)}><Gancho texto={gancho} e={e} /></Sequence>}
      <Barra e={e} />
    </AbsoluteFill>
  );
};
