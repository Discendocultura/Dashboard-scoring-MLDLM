import { requireRole } from '../lib/auth.js';
import { listTags } from '../lib/ghl.js';
import { json, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireRole(request);
    return json({ tags: await listTags() });
  } catch (e) {
    return errorResponse(e);
  }
}
