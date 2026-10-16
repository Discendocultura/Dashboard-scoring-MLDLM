// Piezas de los estilos de edición Nativo, Documental, Noticiero, Explicador e Íntimo.
// Cada estilo (ediciones/*.json) elige: subtítulos, gancho, marco (capa fija encima de todo), filtro de color y disposición.
// Solo se usan colores de la plantilla (e.primario, e.oscuro, e.acento, e.claro) salvo negro/blanco neutros.
import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame, useVideoConfig, spring, interpolate, staticFile} from 'remotion';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const sal = (f, total, n = 8) => interpolate(f, [total - n, total], [1, 0], clamp);

// ───────────────────────── Subtítulos ─────────────────────────

// Frases: agrupa hasta `max` palabras sin cruzar el final de frase (para estilos de frase completa)
export const frases = (words, max) => {
  const out = []; let cur = [];
  words.forEach((w) => { cur.push(w); if (cur.length >= max || /[.?!…:;,]$/.test(w.text)) { out.push(cur); cur = []; } });
  if (cur.length) out.push(cur);
  return out;
};

// Nativo (TikTok): 2–3 palabras, blancas con contorno negro grueso; la que suena en color de acento y con salto
export const SubTikTok = ({bloque, t, e, top}) => (
  <div style={{position: 'absolute', top, width: '100%', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0 18px', padding: '0 80px'}}>
    {bloque.map((w, i) => {
      const on = w === bloque.filter((x) => x.start <= t).pop();
      return <span key={i} style={{fontFamily: e.fuenteSubs, fontWeight: 900, fontSize: on ? 92 : 84, lineHeight: 1.1, color: on ? e.acento : '#fff',
        WebkitTextStroke: '12px #000', paintOrder: 'stroke fill', textShadow: '0 6px 0 rgba(0,0,0,.35)'}}>{w.text}</span>;
    })}
  </div>
);

// Documental: frase entera en serif que se escribe letra a letra, como a máquina
export const SubMaquina = ({frase, t, e, top}) => {
  const texto = frase.map((w) => w.text).join(' ');
  const t0 = frase[0].start, t1 = frase[frase.length - 1].end;
  const n = Math.ceil(interpolate(t, [t0, Math.max(t0 + 0.2, t1 - 0.1)], [0, texto.length], clamp));
  return (
    <div style={{position: 'absolute', top, left: 90, right: 90, textAlign: 'center', fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 700, fontSize: 60,
      lineHeight: 1.25, color: e.claro, textShadow: '0 3px 12px rgba(0,0,0,.9)'}}>
      {texto.slice(0, n)}<span style={{opacity: Math.floor(t * 3) % 2 ? 0 : 1, color: e.acento}}>|</span>
    </div>
  );
};

// Noticiero: subtítulos de televisión, en blanco sobre una banda oscura
export const SubTV = ({frase, e, top}) => (
  <div style={{position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 60px'}}>
    <span style={{background: 'rgba(0,0,0,.72)', padding: '10px 22px', fontFamily: e.fuenteSubs, fontWeight: 700, fontSize: 52, lineHeight: 1.3, color: '#fff', textAlign: 'center'}}>
      {frase.map((w) => w.text).join(' ')}
    </span>
  </div>
);

// Íntimo: frase grande en serif, como una cita; entra con un fundido y las palabras ya dichas se encienden
export const SubCita = ({frase, t, e, top}) => {
  const p = interpolate(t, [frase[0].start - 0.05, frase[0].start + 0.25], [0, 1], clamp);
  return (
    <div style={{position: 'absolute', top, left: 80, right: 80, textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 14}px)`}}>
      {frase.map((w, i) => (
        <span key={i} style={{fontFamily: e.fuenteTitulos, fontWeight: 700, fontSize: 64, lineHeight: 1.2, color: e.claro,
          opacity: w.start <= t ? 1 : 0.55, textShadow: '0 3px 6px rgba(0,0,0,.9), 0 4px 22px rgba(0,0,0,.8)'}}>{w.text} </span>
      ))}
    </div>
  );
};

// ───────────────────────── Ganchos ─────────────────────────

// Nativo: caja blanca con texto negro, como el texto de TikTok/Reels
export const GanchoTikTok = ({texto, e}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const p = spring({frame: f, fps, config: {damping: 11, stiffness: 200}});
  return (
    <div style={{position: 'absolute', top: 300, left: 70, right: 70, display: 'flex', justifyContent: 'center', opacity: sal(f, durationInFrames), transform: `scale(${p})`}}>
      <span style={{background: '#fff', color: '#000', fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 58, lineHeight: 1.25, padding: '14px 26px', borderRadius: 16,
        textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,.35)', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'}}>{texto}</span>
    </div>
  );
};

// Noticiero: banda «ÚLTIMA HORA» con el titular, arriba bajo la mosca (abajo están el rótulo, los subtítulos y la cinta)
export const GanchoTitular = ({texto, e}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const p = spring({frame: f, fps, config: {damping: 14}});
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 170, opacity: sal(f, durationInFrames), transform: `translateX(${(1 - p) * -1100}px)`}}>
      <div style={{display: 'flex', alignItems: 'stretch'}}>
        <div style={{background: e.primario, color: '#fff', fontFamily: e.fuenteSubs, fontWeight: 900, fontSize: 40, letterSpacing: 2, padding: '18px 26px', textTransform: 'uppercase',
          opacity: Math.floor(f / 10) % 2 ? 0.8 : 1}}>Última hora</div>
        <div style={{flex: 1, background: '#fff', color: '#111', fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 44, padding: '18px 26px', lineHeight: 1.2}}>{texto}</div>
      </div>
    </div>
  );
};

// Íntimo, Documental y Explicador: título centrado en serif con raya (sobreClaro: sobre la pizarra, en color oscuro)
export const GanchoCita = ({texto, e, top = 260, sobreClaro}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const p = interpolate(f, [0, fps * 0.6], [0, 1], clamp);
  return (
    <div style={{position: 'absolute', top, left: 80, right: 80, textAlign: 'center', opacity: p * sal(f, durationInFrames, 12)}}>
      <div style={{fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 700, fontSize: 66, lineHeight: 1.2, color: sobreClaro ? e.oscuro : e.claro, textShadow: sobreClaro ? 'none' : '0 4px 20px rgba(0,0,0,.8)'}}>{texto}</div>
      <div style={{margin: '22px auto 0', height: 4, width: `${p * 30}%`, background: e.acento}} />
    </div>
  );
};

// ───────────────────────── Marcos (capa fija) ─────────────────────────

const Grano = ({opacidad = 0.07}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: opacidad, mixBlendMode: 'overlay', backgroundImage: 'repeating-radial-gradient(circle at ' + ((f * 37) % 100) + '% ' + ((f * 53) % 100) +
    '%, #fff 0, #fff 1px, transparent 1px, transparent 3px)'}} />;
};

// Documental: franjas de cine, viñeta y grano
export const MarcoDocumental = () => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,.6) 100%)'}} />
    <Grano opacidad={0.1} />
    <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: 170, background: '#000'}} />
    <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: 170, background: '#000'}} />
  </AbsoluteFill>
);

// Noticiero: mosca «EN DIRECTO», reloj, nombre del canal, rótulo con nombre y cargo al principio y cinta de titulares abajo
export const MarcoNoticiero = ({e, canal, ticker = [], locutor, tapado}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const t = f / fps;
  const reloj = new Date(Date.UTC(2026, 0, 1, 20, 30, Math.floor(t))).toISOString().slice(11, 16);
  const texto = ticker.length ? ticker.join('   ◆   ') + '   ◆   ' : '';
  const pL = spring({frame: f - 15, fps, config: {damping: 14}});
  const salL = interpolate(t, [5.5, 6], [1, 0], clamp);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', top: 60, left: 50, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,.6)', padding: '10px 18px', borderRadius: 8}}>
        <div style={{width: 18, height: 18, borderRadius: '50%', background: '#e11', opacity: Math.floor(f / 12) % 2 ? 0.3 : 1}} />
        <span style={{fontFamily: e.fuenteSubs, fontWeight: 900, fontSize: 30, color: '#fff', letterSpacing: 2}}>EN DIRECTO</span>
      </div>
      <div style={{position: 'absolute', top: 60, right: 50, background: e.primario, color: '#fff', fontFamily: e.fuenteSubs, fontWeight: 800, fontSize: 30, padding: '10px 18px', borderRadius: 8}}>
        {canal} · {reloj}
      </div>
      {locutor && <div style={{position: 'absolute', left: 0, bottom: 290, opacity: salL, transform: `translateX(${(1 - pL) * -900}px)`}}>
        <div style={{background: e.primario, color: '#fff', fontFamily: e.fuenteSubs, fontWeight: 900, fontSize: 44, padding: '14px 40px 10px 50px'}}>{locutor.nombre}</div>
        <div style={{background: '#fff', color: e.oscuro, fontFamily: e.fuenteSubs, fontWeight: 700, fontSize: 30, padding: '8px 40px 10px 50px', display: 'inline-block'}}>{locutor.cargo}</div>
      </div>}
      {texto && !tapado && <div style={{position: 'absolute', left: 0, right: 0, bottom: 150, height: 74, background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center'}}>
        <div style={{flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center', background: e.primario, color: '#fff', fontFamily: e.fuenteSubs, fontWeight: 900, fontSize: 30,
          padding: '0 24px', zIndex: 1}}>TITULARES</div>
        <div style={{whiteSpace: 'nowrap', fontFamily: e.fuenteSubs, fontWeight: 700, fontSize: 32, color: '#111', transform: `translateX(${-(f * 6) % 4000}px)`, paddingLeft: 30}}>
          {texto.repeat(4)}</div>
      </div>}
    </AbsoluteFill>
  );
};

// Íntimo: viñeta cálida y una onda de audio sutil que se mueve cuando hay voz
export const MarcoIntimo = ({e, words, tapado}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const t = f / fps;
  const habla = words.some((w) => t >= w.start && t <= w.end + 0.05);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 45%, rgba(20,8,4,.55) 100%)'}} />
      <Grano opacidad={0.05} />
      <div style={{position: 'absolute', bottom: 120, left: 0, right: 0, display: tapado ? 'none' : 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, height: 60}}>
        {Array.from({length: 28}).map((_, i) => {
          const h = habla ? 10 + 40 * Math.abs(Math.sin(f / 3 + i * 1.7) * Math.cos(f / 5 + i)) : 6;
          return <div key={i} style={{width: 7, height: h, borderRadius: 4, background: e.claro, opacity: 0.55}} />;
        })}
      </div>
    </AbsoluteFill>
  );
};

// Explicador: la mitad de abajo es una pizarra clara donde se dibuja; aquí solo el fondo y la línea divisoria
export const FondoPizarra = ({e, desde}) => (
  <div style={{position: 'absolute', top: desde, left: 0, right: 0, bottom: 0, background: e.claro}}>
    <div style={{position: 'absolute', inset: 0, opacity: 0.35, backgroundImage: `linear-gradient(${e.acento}22 1px, transparent 1px), linear-gradient(90deg, ${e.acento}22 1px, transparent 1px)`,
      backgroundSize: '60px 60px'}} />
    <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: e.primario}} />
  </div>
);

// ───────────────────────── Escenas ─────────────────────────

// Documental: rótulo de lugar y fecha abajo a la izquierda, con raya que se dibuja
export const Rotulo = ({e, lugar, fecha}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const p = interpolate(f, [0, fps * 0.5], [0, 1], clamp);
  return (
    <div style={{position: 'absolute', left: 70, bottom: 250, opacity: sal(f, durationInFrames, 10)}}>
      <div style={{height: 4, width: 220 * p, background: e.acento, marginBottom: 14}} />
      <div style={{fontFamily: e.fuenteTitulos, fontWeight: 700, fontSize: 52, color: e.claro, letterSpacing: 1, opacity: p, textShadow: '0 3px 10px rgba(0,0,0,.8)'}}>{lugar}</div>
      {fecha && <div style={{fontFamily: e.fuenteSubs, fontWeight: 700, fontSize: 30, color: e.acento, letterSpacing: 6, textTransform: 'uppercase', opacity: p}}>{fecha}</div>}
    </div>
  );
};

// Documental: pergamino a pantalla completa con una ruta que se dibuja entre puntos con nombre
export const Mapa = ({e, puntos, titulo}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const prog = interpolate(f, [6, durationInFrames - 10], [0, 1], clamp);
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  return (
    <AbsoluteFill style={{opacity: interpolate(f, [0, 8], [0, 1], clamp) * sal(f, durationInFrames)}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 45%, ${e.claro} 0%, #d9c9a8 70%, #8a7354 100%)`}} />
      <Grano opacidad={0.12} />
      {titulo && <div style={{position: 'absolute', top: 230, width: '100%', textAlign: 'center', fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 800, fontSize: 80, color: e.oscuro}}>{titulo}</div>}
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
        <path d={d} stroke={e.primario} strokeWidth="8" strokeLinecap="round" fill="none" pathLength="1" strokeDasharray="1 1" strokeDashoffset={1 - prog} />
        {puntos.map((p, i) => {
          const on = prog >= i / Math.max(1, puntos.length - 1) - 0.02;
          return (
            <g key={i} opacity={on ? 1 : 0}>
              <circle cx={p.x} cy={p.y} r="20" fill={e.primario} stroke={e.claro} strokeWidth="6" />
              <text x={p.x + 34} y={p.y + 14} fontFamily={e.fuenteTitulos} fontWeight="800" fontSize="46" fill={e.oscuro}>{p.nombre}</text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// Documental: imagen de archivo a pantalla completa, envejecida, con zoom lento y sello de fecha
export const Archivo = ({e, imagen, fecha}) => {
  const f = useCurrentFrame(); const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{opacity: interpolate(f, [0, 8], [0, 1], clamp) * sal(f, durationInFrames), background: '#000'}}>
      <AbsoluteFill style={{transform: `scale(${interpolate(f, [0, durationInFrames], [1.05, 1.18])})`, filter: 'sepia(.55) contrast(1.1) brightness(.9)'}}>
        <Img src={staticFile(imagen)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <Grano opacidad={0.14} />
      {fecha && <div style={{position: 'absolute', right: 70, bottom: 260, fontFamily: 'Courier New, monospace', fontWeight: 700, fontSize: 40, color: e.claro,
        border: `3px solid ${e.claro}`, padding: '6px 16px', transform: 'rotate(-4deg)', opacity: 0.85}}>{fecha}</div>}
    </AbsoluteFill>
  );
};

// Noticiero: tarjeta de dato de plató que entra desde un lado
export const DatoTV = ({e, cifra, texto, fuente}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const p = spring({frame: f, fps, config: {damping: 14}});
  return (
    <div style={{position: 'absolute', top: 210, right: 50, width: 560, opacity: sal(f, durationInFrames), transform: `translateX(${(1 - p) * 700}px)`}}>
      <div style={{background: e.primario, color: '#fff', fontFamily: e.fuenteSubs, fontWeight: 900, fontSize: 26, letterSpacing: 3, padding: '10px 20px'}}>DATO</div>
      <div style={{background: 'rgba(255,255,255,.95)', padding: '20px 24px'}}>
        <div style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 110, lineHeight: 1, color: e.primario}}>{cifra}</div>
        <div style={{fontFamily: e.fuenteSubs, fontWeight: 700, fontSize: 34, lineHeight: 1.2, color: '#222', marginTop: 8}}>{texto}</div>
        {fuente && <div style={{fontFamily: e.fuenteSubs, fontSize: 22, color: '#666', marginTop: 10}}>Fuente: {fuente}</div>}
      </div>
    </div>
  );
};

// Nativo: nota del móvil (estilo app de Notas) que sube con los puntos tachándose o marcándose
export const Nota = ({e, titulo, lineas = [], cada = 0.6}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const p = spring({frame: f, fps, config: {damping: 13}});
  return (
    <div style={{position: 'absolute', top: 230, left: 110, right: 110, opacity: sal(f, durationInFrames), transform: `translateY(${(1 - p) * 500}px) rotate(-2deg)`}}>
      <div style={{background: '#fffdf4', borderRadius: 28, padding: '30px 36px', boxShadow: '0 20px 50px rgba(0,0,0,.45)'}}>
        <div style={{fontFamily: 'Inter', fontWeight: 800, fontSize: 26, color: '#c9a227', marginBottom: 6}}>‹ Notas</div>
        <div style={{fontFamily: 'Inter', fontWeight: 800, fontSize: 46, color: '#111', marginBottom: 14}}>{titulo}</div>
        {lineas.map((l, i) => {
          const on = f / fps >= 0.4 + i * cada;
          return <div key={i} style={{fontFamily: 'Inter', fontWeight: 600, fontSize: 38, color: '#222', lineHeight: 1.5, opacity: on ? 1 : 0,
            textDecoration: l.tachar ? 'line-through' : 'none', textDecorationColor: e.primario}}>{l.marca ?? '•'} {l.texto}</div>;
        })}
      </div>
    </div>
  );
};

// Nativo: burbujas de chat (WhatsApp/iMessage) que van apareciendo
export const Chat = ({e, mensajes = [], cada = 0.9}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  return (
    <div style={{position: 'absolute', top: 230, left: 60, right: 60, opacity: sal(f, durationInFrames)}}>
      {mensajes.map((m, i) => {
        const p = spring({frame: f - Math.round((0.2 + i * cada) * fps), fps, config: {damping: 12}});
        const mio = m.de === 'yo';
        return (
          <div key={i} style={{display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start', marginBottom: 18, opacity: p, transform: `scale(${0.7 + 0.3 * p})`, transformOrigin: mio ? 'right' : 'left'}}>
            <div style={{maxWidth: '78%', background: mio ? '#d9fdd3' : '#fff', color: '#111', fontFamily: 'Inter', fontWeight: 600, fontSize: 40, lineHeight: 1.3,
              padding: '16px 24px', borderRadius: 26, boxShadow: '0 8px 20px rgba(0,0,0,.3)'}}>{m.texto}</div>
          </div>
        );
      })}
    </div>
  );
};

// Nativo: texto «POV» o comentario arriba, en blanco con contorno
export const Pov = ({e, texto}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const p = spring({frame: f, fps, config: {damping: 10, stiffness: 220}});
  return (
    <div style={{position: 'absolute', top: 250, left: 70, right: 70, textAlign: 'center', opacity: sal(f, durationInFrames), transform: `scale(${p})`}}>
      <span style={{fontFamily: e.fuenteSubs, fontWeight: 900, fontSize: 70, lineHeight: 1.15, color: '#fff', WebkitTextStroke: '12px #000', paintOrder: 'stroke fill'}}>{texto}</span>
    </div>
  );
};

// ── Explicador: dibujos en la pizarra (mitad inferior). `zona` = {top, alto} de la pizarra.
const ZONA = {top: 1120, alto: 800};

// Ciclo de N días en círculo; la ventana fértil se colorea y un marcador señala la ovulación
export const PizarraCiclo = ({e, dias = 28, fertilDesde = 10, fertilHasta = 15, ovulacion = 14, titulo = 'Tu ciclo'}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const prog = interpolate(f, [4, fps * 1.6], [0, 1], clamp);
  const cx = 540, cy = ZONA.top + 420, r = 260;
  return (
    <AbsoluteFill style={{opacity: sal(f, durationInFrames)}}>
      <div style={{position: 'absolute', top: ZONA.top + 40, width: '100%', textAlign: 'center', fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 56, color: e.oscuro}}>{titulo}</div>
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
        {Array.from({length: dias}).map((_, i) => {
          const a = (i / dias) * Math.PI * 2 - Math.PI / 2;
          const visible = i / dias <= prog;
          const fertil = i + 1 >= fertilDesde && i + 1 <= fertilHasta && f / fps > 1.8;
          const ov = i + 1 === ovulacion && f / fps > 2.4;
          return <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r={ov ? 30 : 20} opacity={visible ? 1 : 0}
            fill={ov ? e.primario : fertil ? e.acento : '#fff'} stroke={e.oscuro} strokeWidth="4" />;
        })}
        <text x={cx} y={cy + 20} textAnchor="middle" fontFamily={e.fuenteTitulos} fontWeight="800" fontSize="64" fill={e.primario} opacity={f / fps > 2.4 ? 1 : 0}>
          Día {ovulacion}?</text>
      </svg>
    </AbsoluteFill>
  );
};

// Gráfica de línea que se dibuja (p. ej. temperatura basal), con etiqueta en el punto clave
export const PizarraGrafica = ({e, valores = [], titulo, marca, etiqueta}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const prog = interpolate(f, [4, fps * 2], [0, 1], clamp);
  const x0 = 120, x1 = 960, y0 = ZONA.top + 640, y1 = ZONA.top + 220;
  const min = Math.min(...valores), max = Math.max(...valores);
  const pts = valores.map((v, i) => [x0 + ((x1 - x0) * i) / (valores.length - 1), y0 - ((v - min) / (max - min || 1)) * (y0 - y1)]);
  const n = Math.max(2, Math.round(prog * (pts.length - 1)) + 1);
  return (
    <AbsoluteFill style={{opacity: sal(f, durationInFrames)}}>
      {titulo && <div style={{position: 'absolute', top: ZONA.top + 40, width: '100%', textAlign: 'center', fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 56, color: e.oscuro}}>{titulo}</div>}
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0}}>
        <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={e.oscuro} strokeWidth="4" />
        <line x1={x0} y1={y0} x2={x0} y2={y1 - 30} stroke={e.oscuro} strokeWidth="4" />
        <path d={pts.slice(0, n).map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} stroke={e.primario} strokeWidth="10" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {marca != null && prog > marca / (valores.length - 1) && <g>
          <circle cx={pts[marca][0]} cy={pts[marca][1]} r="22" fill={e.acento} stroke={e.oscuro} strokeWidth="4" />
          {etiqueta && <text x={pts[marca][0] + 36} y={pts[marca][1] + 14} textAnchor="start" fontFamily={e.fuenteTitulos} fontWeight="800" fontSize="44" fill={e.oscuro}
            stroke={e.claro} strokeWidth="10" paintOrder="stroke">{etiqueta}</text>}
        </g>}
      </svg>
    </AbsoluteFill>
  );
};

// Cajas de causa → efecto unidas por flechas que se dibujan
export const PizarraFlechas = ({e, pasos = [], cada = 0.8}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const t = f / fps;
  return (
    <div style={{position: 'absolute', top: ZONA.top + 70, left: 80, right: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: sal(f, durationInFrames)}}>
      {pasos.map((p, i) => {
        const on = interpolate(t, [0.2 + i * cada, 0.5 + i * cada], [0, 1], clamp);
        return (
          <React.Fragment key={i}>
            {i > 0 && <div style={{fontSize: 60, lineHeight: 1, color: e.primario, opacity: on, margin: '6px 0'}}>↓</div>}
            <div style={{background: i === pasos.length - 1 ? e.primario : '#fff', color: i === pasos.length - 1 ? '#fff' : e.oscuro, border: `4px solid ${e.oscuro}`, borderRadius: 18,
              padding: '16px 34px', fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 46, opacity: on, transform: `scale(${0.85 + 0.15 * on})`}}>{p}</div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Apuntes: palabras clave que se escriben en la pizarra con un subrayado
export const PizarraApuntes = ({e, titulo, puntos = [], cada = 0.7}) => {
  const f = useCurrentFrame(); const {fps, durationInFrames} = useVideoConfig();
  const t = f / fps;
  return (
    <div style={{position: 'absolute', top: ZONA.top + 60, left: 100, right: 100, opacity: sal(f, durationInFrames)}}>
      {titulo && <div style={{fontFamily: e.fuenteTitulos, fontWeight: 800, fontSize: 60, color: e.primario, marginBottom: 20}}>{titulo}</div>}
      {puntos.map((p, i) => {
        const on = interpolate(t, [0.3 + i * cada, 0.6 + i * cada], [0, 1], clamp);
        return <div key={i} style={{fontFamily: e.fuenteTitulos, fontStyle: 'italic', fontWeight: 700, fontSize: 52, color: e.oscuro, opacity: on, marginBottom: 14,
          borderBottom: `6px solid ${e.acento}`, display: 'table', paddingBottom: 4, clipPath: `inset(0 ${100 - on * 100}% 0 0)`}}>{i + 1}. {p}</div>;
      })}
    </div>
  );
};
