// Estilo de edición «Impacto»: escenas a pantalla completa que tapan la imagen mientras la voz sigue,
// para captar y guiar la atención. Todas usan solo los colores de la plantilla (e.primario, e.oscuro, e.acento, e.claro).
import React from 'react';
import {AbsoluteFill, OffthreadVideo, Img, useCurrentFrame, useVideoConfig, spring, interpolate, staticFile} from 'remotion';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};

// Entrada en círculo que se abre desde el centro y salida con escala y fundido: así cada escena «golpea» al entrar
const Escena = ({children, fondo = '#000'}) => {
  const f = useCurrentFrame(); const {durationInFrames} = useVideoConfig();
  const abre = interpolate(f, [0, 7], [0, 150], {...clamp, easing: (x) => 1 - Math.pow(1 - x, 3)});
  const sale = interpolate(f, [durationInFrames - 6, durationInFrames], [0, 1], clamp);
  return (
    <AbsoluteFill style={{clipPath: `circle(${abre}% at 50% 45%)`, opacity: 1 - sale, transform: `scale(${1 + sale * 0.08})`, background: fondo}}>
      {children}
    </AbsoluteFill>
  );
};

// Fondo de marca con luz que respira y grano, para las escenas tipográficas
const FondoMarca = ({e}) => {
  const f = useCurrentFrame();
  const luz = 50 + 6 * Math.sin(f / 18);
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% ${luz}%, ${e.primario} 0%, ${e.oscuro} 55%, #0b0605 100%)`}}>
      <AbsoluteFill style={{opacity: 0.08, backgroundImage: 'repeating-radial-gradient(circle at 17% 32%, #fff 0, #fff 1px, transparent 1px, transparent 3px)'}} />
    </AbsoluteFill>
  );
};

// B-roll a pantalla completa: vídeo (IA o stock) o imagen, con zoom lento y viñeta; rótulo opcional arriba
export const BRoll = ({e, src, imagen, rotulo, zoom = [1.04, 1.16]}) => {
  const f = useCurrentFrame(); const {durationInFrames, fps} = useVideoConfig();
  const s = interpolate(f, [0, durationInFrames], zoom, clamp);
  const pR = spring({frame: f - 6, fps, config: {damping: 14}});
  return (
    <Escena>
      <AbsoluteFill style={{transform: `scale(${s})`}}>
        {src ? <OffthreadVideo src={staticFile(src)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          : <Img src={staticFile(imagen)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />}
      </AbsoluteFill>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%)'}} />
      {rotulo && <div style={{position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', opacity: pR, transform: `translateY(${(1 - pR) * -40}px)`}}>
        <span style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 34, letterSpacing: 6, textTransform: 'uppercase', color: '#fff',
          background: e.primario, padding: '12px 26px', boxShadow: '0 10px 30px rgba(0,0,0,.5)'}}>{rotulo}</span>
      </div>}
    </Escena>
  );
};

// Frase tipográfica a pantalla completa: palabras que entran una a una; las de `destacar` en color de acento y cursiva
export const Frase = ({e, texto, destacar = [], antetitulo, cada = 0.18}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const palabras = texto.split(' ');
  const norm = (w) => w.toLowerCase().replace(/[^a-záéíóúñü0-9]/g, '');
  const dest = destacar.map(norm);
  return (
    <Escena>
      <FondoMarca e={e} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: '0 80px'}}>
        {antetitulo && <div style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 32, letterSpacing: 8, textTransform: 'uppercase', color: e.acento, marginBottom: 40,
          opacity: interpolate(f, [4, 12], [0, 1], clamp)}}>{antetitulo}</div>}
        <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 28px', maxWidth: 920}}>
          {palabras.map((w, i) => {
            const p = spring({frame: f - 5 - Math.round(i * cada * fps), fps, config: {damping: 12, stiffness: 170}});
            const d = dest.includes(norm(w));
            return <span key={i} style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontStyle: d ? 'italic' : 'normal', fontSize: d ? 132 : 112, lineHeight: 1.08,
              color: d ? e.acento : e.claro, opacity: p, transform: `translateY(${(1 - p) * 60}px) scale(${0.8 + 0.2 * p})`, textShadow: '0 10px 30px rgba(0,0,0,.5)'}}>{w}</span>;
          })}
        </div>
        <div style={{marginTop: 50, height: 8, width: `${interpolate(f, [10, 30], [0, 40], clamp)}%`, background: e.acento}} />
      </AbsoluteFill>
    </Escena>
  );
};

// Cifra enorme que sube, con etiqueta
export const Cifra = ({e, hasta, prefijo = '+', sufijo = '', etiqueta, antetitulo}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const n = Math.round(interpolate(f, [4, fps * 1.3], [0, hasta], {...clamp, easing: (x) => 1 - Math.pow(1 - x, 3)}));
  const pulso = 1 + 0.03 * Math.sin(f / 4);
  return (
    <Escena>
      <FondoMarca e={e} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        {antetitulo && <div style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 34, letterSpacing: 8, textTransform: 'uppercase', color: e.acento, marginBottom: 20}}>{antetitulo}</div>}
        <div style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 250, lineHeight: 1, color: e.claro, transform: `scale(${pulso})`, textShadow: `0 0 60px ${e.acento}66`}}>
          {prefijo}{n.toLocaleString('es-ES')}{sufijo}</div>
        {etiqueta && <div style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 52, letterSpacing: 4, textTransform: 'uppercase', color: e.acento, marginTop: 24,
          opacity: interpolate(f, [fps * 0.9, fps * 1.3], [0, 1], clamp)}}>{etiqueta}</div>}
      </AbsoluteFill>
    </Escena>
  );
};

// Línea del tiempo vertical a pantalla completa: los hitos se encienden de arriba abajo
export const Linea = ({e, hitos, titulo}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const paso = (durationInFrames - 12) / hitos.length;
  return (
    <Escena>
      <FondoMarca e={e} />
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 220}}>
        {titulo && <div style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontStyle: 'italic', fontSize: 84, color: e.claro, marginBottom: 60}}>{titulo}</div>}
        <div style={{position: 'relative', width: 760}}>
          <div style={{position: 'absolute', left: 60, top: 20, width: 8, height: `${interpolate(f, [4, durationInFrames - 8], [0, 100], clamp)}%`, background: e.acento}} />
          {hitos.map((h, i) => {
            const p = spring({frame: f - 6 - Math.round(i * paso), fps, config: {damping: 11}});
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 50, height: 200, opacity: 0.25 + 0.75 * p, transform: `translateX(${(1 - p) * 60}px)`}}>
                <div style={{width: 72, height: 72, borderRadius: '50%', background: p > 0.5 ? e.acento : e.oscuro, border: `6px solid ${e.claro}`, marginLeft: 28, flexShrink: 0}} />
                <div>
                  <div style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 96, color: e.claro, lineHeight: 1}}>{h.anio}</div>
                  {h.texto && <div style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 34, color: e.acento, textTransform: 'uppercase', letterSpacing: 3}}>{h.texto}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Escena>
  );
};

// Cartel del evento a pantalla completa: título, detalles que entran por fases y sello
export const Cartel = ({e, antetitulo, titulo, lineas = [], sello, selloEn = 1.2}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const pT = spring({frame: f - 4, fps, config: {damping: 13}});
  const pS = spring({frame: f - Math.round(selloEn * fps), fps, config: {damping: 8, stiffness: 260}});
  return (
    <Escena>
      <FondoMarca e={e} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: '0 70px'}}>
        <div style={{position: 'relative', width: '100%', border: `4px solid ${e.acento}`, padding: '70px 50px', textAlign: 'center', background: 'rgba(0,0,0,.18)'}}>
          {antetitulo && <div style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 34, letterSpacing: 8, textTransform: 'uppercase', color: e.acento}}>{antetitulo}</div>}
          <div style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 150, lineHeight: 1, color: e.claro, margin: '24px 0', transform: `scale(${0.7 + 0.3 * pT})`, opacity: pT}}>{titulo}</div>
          <div style={{height: 6, width: 220, background: e.acento, margin: '0 auto 30px'}} />
          {lineas.map((l, i) => {
            const t0 = (l.en ?? (0.6 + i * 0.5));
            const p = spring({frame: f - Math.round(t0 * fps), fps, config: {damping: 13}});
            return <div key={i} style={{fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 700, fontSize: 58, color: e.claro, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, marginTop: 10}}>{l.texto}</div>;
          })}
          {sello && <div style={{position: 'absolute', right: -30, top: -60, width: 220, height: 220, borderRadius: '50%', background: e.primario, border: `6px dashed ${e.acento}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(-14deg) scale(${f / fps < selloEn ? 0 : pS})`, boxShadow: '0 14px 30px rgba(0,0,0,.5)'}}>
            <span style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 46, letterSpacing: 2, color: e.claro, textTransform: 'uppercase'}}>{sello}</span>
          </div>}
        </div>
      </AbsoluteFill>
    </Escena>
  );
};

// Botón de registro abajo del todo, ancho, con latido, brillo que lo recorre y toque
export const BotonAbajo = ({e, texto = 'Regístrate gratis', toque = 1.5, subtexto}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const t = f / fps;
  const ent = spring({frame: f, fps, config: {damping: 12}});
  const pulso = 1 + 0.035 * Math.sin(f / 4);
  const brillo = ((f % 45) / 45) * 160 - 30;
  const onda = (t - toque) * 1.6;
  return (
    <div style={{position: 'absolute', left: 60, right: 60, bottom: 110, transform: `translateY(${(1 - ent) * 260}px)`}}>
      <div style={{position: 'relative', overflow: 'hidden', background: e.primario, border: `4px solid ${e.acento}`, borderRadius: 26, padding: '34px 0', textAlign: 'center',
        transform: `scale(${pulso})`, boxShadow: `0 18px 40px rgba(0,0,0,.6), 0 0 40px ${e.acento}55`}}>
        <span style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 60, letterSpacing: 2, textTransform: 'uppercase', color: e.claro}}>{texto}</span>
        <div style={{position: 'absolute', top: 0, bottom: 0, left: `${brillo}%`, width: '18%', background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent)', transform: 'skewX(-20deg)'}} />
      </div>
      {subtexto && <div style={{textAlign: 'center', marginTop: 16, fontFamily: e.fuenteSubs, fontWeight: 700, fontSize: 32, color: '#fff', textShadow: '0 3px 10px rgba(0,0,0,.8)'}}>{subtexto}</div>}
      {onda > 0 && onda < 1 && <div style={{position: 'absolute', left: '68%', top: 60, width: 300 * onda, height: 300 * onda, marginLeft: -150 * onda, marginTop: -150 * onda,
        borderRadius: '50%', border: `6px solid ${e.acento}`, opacity: 1 - onda}} />}
      {t >= toque - 0.3 && <div style={{position: 'absolute', left: '66%', top: 70, fontSize: 100, transform: `translateY(${t < toque ? 30 : 0}px)`}}>👆</div>}
    </div>
  );
};
