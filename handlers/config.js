import { requireRole } from '../lib/auth.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { zoomConfigured } from '../lib/zoom.js';
import { json, readBody, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const role = await requireRole(request);
    const config = await getConfig({ fresh: new URL(request.url).searchParams.has('fresh') });
    return json({ role, config, zoomConfigured: zoomConfigured() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireRole(request, { admin: true });
    const config = await saveConfig(await readBody(request));
    return json({ config });
  } catch (e) {
    return errorResponse(e);
  }
}
