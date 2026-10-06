import { getSession } from '../lib/auth.js';
import { publicUser, rolEn } from '../lib/users.js';
import { getRoles } from '../lib/roles.js';
import { clienteActual } from '../lib/cliente.js';
import { listClientes, clientePublico } from '../lib/clientes.js';
import { json, errorResponse } from '../lib/http.js';

// Quién soy en el cliente de la petición y a qué clientes puedo cambiar.
export async function GET(request) {
  try {
    const s = await getSession(request);
    if (!s) return json({ error: 'No autorizado' }, 401);
    const todos = await listClientes();
    const mios = s.superadmin ? todos
      : s.user ? todos.filter((c) => rolEn(s.user, c.id))
        : todos.filter((c) => c.principal); // contraseña general de setter
    const roles = s.role ? (await getRoles()).map((r) => ({ id: r.id, label: r.label })) : [];
    return json({
      role: s.role, user: s.user ? publicUser(s.user) : null, permisos: s.permisos || [], roles,
      superadmin: Boolean(s.superadmin), cliente: clientePublico(clienteActual()), clientes: mios.map(clientePublico),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
