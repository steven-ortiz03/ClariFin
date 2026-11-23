import { transaction } from '../config/db.js';
import { write } from './write.js';
import { id } from './validation.js';
export const read = (fn) => async (req, res) => {
  // Multi-query reports use a single repeatable-read snapshot.
  const result = await transaction((db) => fn(db, req.session.id, req));
  res.json({ data: result });
};
export const mutation =
  (schema, fn, status = 200) =>
  async (req, res) => {
    const b = schema.parse(req.body || {});
    const item =
      req.params.id === undefined ? undefined : id.parse(req.params.id);
    const data = await write(
      req.session.id,
      req.get('Idempotency-Key'),
      req.method + ' ' + req.path,
      b,
      (ctx) => fn(ctx, b, item),
    );
    res.status(status).json({ data });
  };
