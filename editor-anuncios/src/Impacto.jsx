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
// `desde`: segundo del clip en el que empieza (para enseñar justo el momento bueno)
export const BRoll = ({e, src, imagen, rotulo, desde = 0, zoom = [1.04, 1.16]}) => {
  const f = useCurrentFrame(); const {durationInFrames, fps} = useVideoConfig();
  const s = interpolate(f, [0, durationInFrames], zoom, clamp);
  const pR = spring({frame: f - 6, fps, config: {damping: 14}});
  return (
    <Escena>
      <AbsoluteFill style={{transform: `scale(${s})`}}>
        {src ? <OffthreadVideo src={staticFile(src)} startFrom={Math.round(desde * fps)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
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
            return <span key={i} style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontStyle: d ? 'italic' : 'normal', fontSize: (d ? 1.18 : 1) * (palabras.length <= 4 ? 150 : 112), lineHeight: 1.08,
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
        {etiqueta && <div style={{fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 48, letterSpacing: 3, textTransform: 'uppercase', color: e.acento, marginTop: 24, textAlign: 'center', maxWidth: 900, padding: '0 40px', lineHeight: 1.2,
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

// Fondo claro de marca (crema y pastel) con anillos que se expanden desde el centro: para ilustraciones y listas
const FondoClaro = ({e, ondas = true}) => {
  const f = useCurrentFrame();
  const pastel = e.extra?.pastel ?? e.claro;
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 45%, #fff 0%, ${e.claro} 45%, ${pastel} 100%)`}}>
      {ondas && [0, 1, 2].map((k) => {
        const t = ((f + k * 20) % 60) / 60;
        return <div key={k} style={{position: 'absolute', left: '50%', top: '45%', width: 1400 * t, height: 1400 * t, marginLeft: -700 * t, marginTop: -700 * t,
          borderRadius: '50%', border: `3px solid ${e.acento}`, opacity: 0.35 * (1 - t)}} />;
      })}
    </AbsoluteFill>
  );
};

// Ilustración o foto propia a pantalla completa: entra con «pop» (escala con rebote), flota un poco y lleva rótulo.
// `fondo`: "oscuro" (burdeos de marca; los subtítulos blancos se leen encima) o "claro" (crema; tapa los subtítulos).
// La imagen queda por encima de y = 1120 para dejar sitio a los subtítulos. `marco`: foto en tarjeta redondeada.
// `etiquetas`: [{texto, x, y, en}] flechas que señalan partes de la imagen (x, y en % de la imagen).
export const Ilustracion = ({e, imagen, titulo, antetitulo, fondo = 'oscuro', marco = false, ancho = 820, etiquetas = []}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const pop = spring({frame: f, fps, config: {damping: 9, stiffness: 170, mass: 0.8}});
  const flota = Math.sin(f / 14) * 10;
  const pT = spring({frame: f - 8, fps, config: {damping: 14}});
  const oscuro = fondo === 'oscuro';
  return (
    <Escena fondo={oscuro ? '#000' : e.claro}>
      {oscuro ? <FondoMarca e={e} /> : <FondoClaro e={e} />}
      {antetitulo && <div style={{position: 'absolute', top: 200, width: '100%', textAlign: 'center', opacity: pT, fontFamily: e.fuenteTitulos, fontWeight: 900,
        fontSize: 34, letterSpacing: 8, textTransform: 'uppercase', color: oscuro ? e.acento : e.primario}}>{antetitulo}</div>}
      {titulo && <div style={{position: 'absolute', top: 250, left: 60, right: 60, textAlign: 'center', opacity: pT, transform: `translateY(${(1 - pT) * 30}px)`,
        fontFamily: e.fuenteTitulos, fontWeight: 900, fontStyle: 'italic', fontSize: 92, lineHeight: 1.05, color: oscuro ? e.claro : e.primario}}>{titulo}</div>}
      <div style={{position: 'absolute', left: (1080 - ancho) / 2, width: ancho, top: titulo ? 400 : 300, height: titulo ? 700 : 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `translateY(${flota}px) scale(${pop})`}}>
        <div style={{position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '100%'}}>
          <Img src={staticFile(imagen)} style={{display: 'block', maxWidth: ancho, maxHeight: titulo ? 700 : 800, objectFit: 'contain',
            ...(marco ? {borderRadius: 28, border: `8px solid ${e.claro}`, boxShadow: '0 30px 80px rgba(0,0,0,.55)'} : {filter: 'drop-shadow(0 24px 40px rgba(94,9,9,.28))'})}} />
          {etiquetas.map((t, i) => {
            const p = spring({frame: f - Math.round((t.en ?? 0.6) * fps), fps, config: {damping: 13}});
            const izq = t.x > 50;
            return <div key={i} style={{position: 'absolute', left: `${t.x}%`, top: `${t.y}%`, opacity: p}}>
              <div style={{width: 22, height: 22, borderRadius: '50%', background: e.primario, border: '4px solid #fff', marginLeft: -11, marginTop: -11,
                boxShadow: '0 0 0 8px rgba(134,13,14,.25)', transform: `scale(${p})`}} />
              <div style={{position: 'absolute', top: -30, [izq ? 'right' : 'left']: 24, whiteSpace: 'nowrap', background: e.primario, color: '#fff',
                fontFamily: e.fuenteTitulos, fontWeight: 900, fontSize: 38, padding: '10px 22px', borderRadius: 40, boxShadow: '0 10px 24px rgba(0,0,0,.3)',
                transform: `translateX(${(1 - p) * (izq ? 40 : -40)}px)`}}>{t.texto}</div>
            </div>;
          })}
        </div>
      </div>
    </Escena>
  );
};

// Curva que se dibuja a pantalla completa (p. ej. calidad de los óvulos con la edad, o el pico de una hormona).
// `valores`: puntos de 0 a 1; `ejeX`: rótulos bajo el eje; `marca`: índice del punto que se señala con `etiqueta`.
export const Curva = ({e, titulo, antetitulo, valores = [], ejeX = [], marca, etiqueta, relleno = true}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const prog = interpolate(f, [6, fps * 2.2], [0, 1], {...clamp, easing: (x) => 1 - Math.pow(1 - x, 2)});
  const x0 = 120, x1 = 960, y0 = 1420, y1 = 760;
  const pts = valores.map((v, i) => [x0 + ((x1 - x0) * i) / (valores.length - 1), y0 - v * (y0 - y1)]);
  const d = pts.map((p, i) => (i ? `L${p[0]},${p[1]}` : `M${p[0]},${p[1]}`)).join(' ');
  const pT = spring({frame: f, fps, config: {damping: 14}});
  const verMarca = marca != null && prog >= marca / (valores.length - 1);
  const pM = spring({frame: f - Math.round(fps * 2.2 * (marca ?? 0) / Math.max(1, valores.length - 1)), fps, config: {damping: 10}});
  return (
    <Escena>
      <FondoMarca e={e} />
      {antetitulo && <div style={{position: 'absolute', top: 360, width: '100%', textAlign: 'center', opacity: pT, fontFamily: e.fuenteTitulos, fontWeight: 900,
        fontSize: 34, letterSpacing: 8, textTransform: 'uppercase', color: e.acento}}>{antetitulo}</div>}
      <div style={{position: 'absolute', top: 410, left: 60, right: 60, textAlign: 'center', opacity: pT, fontFamily: e.fuenteTitulos, fontWeight: 900,
        fontStyle: 'italic', fontSize: 80, lineHeight: 1.05, color: e.claro}}>{titulo}</div>
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
        <defs>
          <linearGradient id="relleno" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={e.acento} stopOpacity=".55" /><stop offset="1" stopColor={e.acento} stopOpacity="0" /></linearGradient>
          <clipPath id="avance"><rect x="0" y="0" width={x0 + (x1 - x0) * prog + 4} height="1920" /></clipPath>
        </defs>
        <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={e.claro} strokeOpacity=".5" strokeWidth="4" />
        {ejeX.map((t, i) => <text key={i} x={x0 + ((x1 - x0) * i) / Math.max(1, ejeX.length - 1)} y={y0 + 60} textAnchor="middle" fontFamily={e.fuenteSubs}
          fontWeight="900" fontSize="38" fill={e.claro} fillOpacity=".8">{t}</text>)}
        <g clipPath="url(#avance)">
          {relleno && <path d={`${d} L${x1},${y0} L${x0},${y0} Z`} fill="url(#relleno)" />}
          <path d={d} stroke={e.claro} strokeWidth="12" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {verMarca && <g transform={`translate(${pts[marca][0]},${pts[marca][1]}) scale(${pM})`}>
          <circle r="34" fill={e.acento} fillOpacity=".35" />
          <circle r="18" fill={e.claro} stroke={e.primario} strokeWidth="6" />
        </g>}
      </svg>
      {verMarca && etiqueta && <div style={{position: 'absolute', left: Math.min(700, Math.max(80, pts[marca][0] - 200)), top: pts[marca][1] - 150, width: 400, textAlign: 'center',
        opacity: pM, transform: `scale(${0.7 + 0.3 * pM})`}}>
        <span style={{background: e.claro, color: e.primario, fontFamily: e.fuenteTitulos, fontWeight: 900, fontSize: 40, padding: '12px 24px', borderRadius: 40,
          boxShadow: '0 12px 30px rgba(0,0,0,.4)'}}>{etiqueta}</span>
      </div>}
    </Escena>
  );
};

// Lista de comprobación en tarjetas blancas (estilo MLDLM): cada punto entra con su check en el segundo `en`
export const Checklist = ({e, titulo, items = []}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const pT = spring({frame: f, fps, config: {damping: 14}});
  return (
    <Escena fondo={e.claro}>
      <FondoClaro e={e} ondas={false} />
      <div style={{position: 'absolute', top: 420, left: 70, right: 70, textAlign: 'center', opacity: pT, fontFamily: e.fuenteTitulos, fontWeight: 900,
        fontStyle: 'italic', fontSize: 86, lineHeight: 1.05, color: e.primario}}>{titulo}</div>
      <div style={{position: 'absolute', top: 700, left: 70, right: 70}}>
        {items.map((it, i) => {
          const p = spring({frame: f - Math.round((it.en ?? 0.4 + i * 0.6) * fps), fps, config: {damping: 13}});
          const c = spring({frame: f - Math.round((it.en ?? 0.4 + i * 0.6) * fps) - 6, fps, config: {damping: 8, stiffness: 200}});
          return <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28, background: '#fff', borderRadius: 20, border: `1px solid ${e.extra?.linea ?? e.acento}`,
            boxShadow: '0 14px 40px rgba(134,13,14,.12)', padding: '34px 34px', marginBottom: 32, opacity: p, transform: `translateX(${(1 - p) * 120}px)`}}>
            <div style={{flexShrink: 0, width: 70, height: 70, borderRadius: '50%', background: e.primario, color: '#fff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 44, fontWeight: 900, transform: `scale(${c})`}}>✓</div>
            <div style={{fontFamily: e.fuenteTitulos, fontWeight: 900, fontSize: 54, lineHeight: 1.15, color: e.extra?.titulos ?? e.oscuro}}>{it.texto}</div>
          </div>;
        })}
      </div>
    </Escena>
  );
};
