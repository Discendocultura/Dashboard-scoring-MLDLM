import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate, staticFile} from 'remotion';
import * as A from './Animaciones';
import * as I from './Impacto';
import './fuentes';

// Agrupa palabras en bloques de N sin cruzar el final de frase
const bloques = (words, n) => {
  const out = []; let cur = [];
  words.forEach((w) => { cur.push(w); if (cur.length === n || /[.?!…:]$/.test(w.text)) { out.push(cur); cur = []; } });
  if (cur.length) out.push(cur);
  return out;
};

const Subtitulos = ({words, grandes, e, ed}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig(); const t = f / fps;
  if (grandes.some((g) => t >= g.start && t < g.start + g.dur)) return null; // la palabra grande manda
  const b = bloques(words, e.subPalabras).find((x) => t >= x[0].start && t < x[x.length - 1].end + 0.15);
  if (!b) return null;
  const pop = spring({frame: f - Math.round(b[0].start * fps), fps, config: {damping: 14, stiffness: 220}});
  return (
    <div style={{position: 'absolute', top: ed.subAltura ?? e.subAltura, width: '100%', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0 22px', padding: '0 90px', transform: `scale(${0.85 + 0.15 * pop})`}}>
      {b.map((w, i) => {
        const on = w === b.filter((x) => x.start <= t).pop();
        // edición «blanco»: todo en blanco con sombra suave; la palabra que suena, un poco más grande
        if (ed.subtitulos === 'blanco') {
          return <span key={i} style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: e.subCuerpo, lineHeight: 1.15, textTransform: 'uppercase', color: '#fff',
            display: 'inline-block', transform: `scale(${on ? 1.12 : 1})`, margin: on ? '0 10px' : 0, opacity: on ? 1 : 0.92,
            textShadow: '0 4px 14px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.6)'}}>{w.text}</span>;
        }
        // subRealce "pildora": la palabra que suena va en una píldora clara con letra del color principal (se lee sobre cualquier ropa)
        const pildora = on && e.subRealce === 'pildora';
        return <span key={i} style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: e.subCuerpo, lineHeight: 1.15, textTransform: 'uppercase',
          color: pildora ? e.primario : on ? e.acento : e.claro, WebkitTextStroke: pildora ? 'none' : `10px ${e.oscuro}`, paintOrder: 'stroke fill',
          ...(pildora ? {background: e.claro, borderRadius: 14, padding: '0 14px', boxShadow: '0 8px 20px rgba(0,0,0,.45)'} : {textShadow: '0 6px 18px rgba(0,0,0,.45)'})}}>{w.text}</span>;
      })}
    </div>
  );
};

const Gancho = ({texto, e, abajo}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const ent = spring({frame: f, fps, config: {damping: 16}});
  const sal = interpolate(f, [durationInFrames - 8, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', ...(abajo ? {bottom: 120} : {top: 70}), left: 60, right: 60, opacity: sal, transform: `translateY(${(1 - ent) * (abajo ? 80 : -60)}px)`}}>
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

const RENDER = {titulares: A.Titulares, apagon: A.Apagon, cinta: A.Cinta, linea: A.LineaTiempo, evento: A.Evento, contador: A.Contador, multitud: A.Multitud, cta: A.Cta,
  test: A.Test, calendario: A.Calendario, preguntas: A.Preguntas, lista: A.Lista, montana: A.Montana, semilla: A.Semilla, app: A.App, camino: A.Camino,
  // estilo «Impacto» (pantalla completa)
  broll: I.BRoll, frase: I.Frase, cifra: I.Cifra, cronologia: I.Linea, cartel: I.Cartel, boton: I.BotonAbajo};
// Escenas de texto a pantalla completa: mientras están, no se ponen subtítulos encima
const TAPAN_SUBTITULOS = ['contador', 'frase', 'cifra', 'cronologia', 'cartel'];

export const Anuncio = ({video, fondo, words, gancho, grandes, zooms, animaciones = [], estilo: e, ed = {}}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig(); const t = f / fps;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <AbsoluteFill style={{transform: `scale(${escala(t, zooms)})`, transformOrigin: '50% 38%'}}>
        {video ? <OffthreadVideo src={staticFile(video)} muted /> : <AbsoluteFill style={{background: fondo}} />}
      </AbsoluteFill>
      {animaciones.filter((a) => a.tipo === 'apagon').map((a, i) => <Sequence key={'d' + i} from={Math.round(a.start * fps)} durationInFrames={Math.round(a.dur * fps)}><A.Apagon /></Sequence>)}
      {animaciones.filter((a) => a.tipo !== 'apagon').map((a, i) => { const C = RENDER[a.tipo];
        return <Sequence key={'a' + i} from={Math.round(a.start * fps)} durationInFrames={Math.round(a.dur * fps)}><C e={e} {...a} /></Sequence>; })}
      <Subtitulos words={words} grandes={[...grandes, ...animaciones.filter((a) => TAPAN_SUBTITULOS.includes(a.tipo))]} e={e} ed={ed} />
      {grandes.map((g, i) => <Sequence key={i} from={Math.round(g.start * fps)} durationInFrames={Math.round(g.dur * fps)}><Grande texto={g.text} e={e} /></Sequence>)}
      {gancho && <Sequence durationInFrames={Math.round(e.ganchoDura * fps)}><Gancho texto={gancho} e={e} abajo={ed.gancho === 'abajo'} /></Sequence>}
      <Barra e={e} />
    </AbsoluteFill>
  );
};
