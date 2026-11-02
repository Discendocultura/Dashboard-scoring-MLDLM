// Vimeo: subir la grabación del directo (Vimeo la descarga solo desde el enlace de Zoom: «pull») y saber cuándo está lista.
// Token personal de Vimeo (developer.vimeo.com → My apps → Generate access token, con los permisos «upload», «edit»
// y «video_files»/«private»): VIMEO_TOKEN en Cloudflare (o VIMEO_TOKEN_<CLIENTE> si el cliente sube a su propia cuenta).
// Nunca en el código ni en un chat.
import { env } from './env.js';
import { envCliente } from './cliente.js';
import * as mock from './mock.js';

const useMock = () => env.GHL_MOCK === '1';
const token = () => String(envCliente('VIMEO_TOKEN') || '').trim();
export const vimeoConfigurado = () => useMock() || token().length >= 20;

async function vimeo(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.vimeo.com${path}`, {
    method,
    headers: { Authorization: `bearer ${token()}`, Accept: 'application/vnd.vimeo.*+json;version=3.4', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Vimeo ${res.status}: ${String(data.developer_message || data.error || '').slice(0, 300)}`);
    err.status = 502;
    err.publicMessage = res.status === 401 ? 'Vimeo no reconoce el token: revisa VIMEO_TOKEN en Cloudflare.'
      : res.status === 403 ? 'El token de Vimeo no tiene permiso para subir vídeos (necesita «upload»).'
        : `Vimeo: ${data.error || 'no responde'}`;
    throw err;
  }
  return data;
}

// Sube un vídeo desde un enlace (Vimeo lo descarga). Oculto en vimeo.com y se puede incrustar en cualquier web; si la
// cuenta no permite «oculto» (Vimeo Basic), se sube sin tocar la privacidad. → { uri, link }
export async function subirDesdeUrl({ url, nombre }) {
  if (useMock()) { const v = mock.vimeoSubir({ link: url, name: nombre }); return { uri: v.uri, link: v.link }; }
  const base = { upload: { approach: 'pull', link: url }, name: String(nombre || 'Grabación').slice(0, 120) };
  let v;
  try {
    v = await vimeo('/me/videos', { method: 'POST', body: { ...base, privacy: { view: 'unlisted', embed: 'public' } } });
  } catch (e) {
    if (!/Vimeo 4\d\d/.test(e.message) || /Vimeo 40[13]/.test(e.message)) throw e;
    v = await vimeo('/me/videos', { method: 'POST', body: base });
  }
  return { uri: String(v.uri), link: String(v.link || '') };
}

// ¿Está lista? → { estado: 'lista' | 'procesando' | 'error', link }
export async function estadoVideo(uri) {
  if (useMock()) {
    const v = mock.vimeoEstado(uri);
    if (!v) return { estado: 'error', link: '' };
    return { estado: v.estado === 'complete' ? 'lista' : v.estado === 'error' ? 'error' : 'procesando', link: v.link };
  }
  const v = await vimeo(`${uri}?fields=link,upload.status,transcode.status`);
  const up = v.upload?.status;
  const tr = v.transcode?.status;
  return { estado: up === 'error' || tr === 'error' ? 'error' : tr === 'complete' ? 'lista' : 'procesando', link: String(v.link || '') };
}
