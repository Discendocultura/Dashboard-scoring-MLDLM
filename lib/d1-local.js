// Base de datos D1 «de mentira» para el servidor local y los tests: la misma API que D1
// (prepare → bind → first / all / run, y batch) sobre SQLite de Node. En Cloudflare no se usa.
import { DatabaseSync } from 'node:sqlite';

export function crearD1Local(path = ':memory:') {
  const db = new DatabaseSync(path);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first(col) {
      const row = db.prepare(sql).get(...args);
      return row == null ? null : col ? row[col] : { ...row };
    },
    async all() { return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })), success: true }; },
    async run() {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    prepare: (sql) => stmt(sql),
    async batch(list) { return Promise.all(list.map((s) => s.run())); },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
  };
}
