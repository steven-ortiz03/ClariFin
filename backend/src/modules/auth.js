import argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { rows, pool, transaction } from '../config/db.js';
import { name, requireThat } from '../core/validation.js';
import { presets } from './catalog.js';
import { catchUp } from './recurring.js';
const email = z.email().max(190).toLowerCase();
const credentials = z.object({ email, password: z.string().min(1).max(256) });
const registration = credentials.extend({
  name,
  password: z.string().min(10, 'Usa al menos 10 caracteres.').max(256),
});
export const digest = (s) => createHash('sha256').update(s).digest('hex');
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
});
export async function session(cookie = '') {
  const match = /(?:^|;\s*)gf_session=([a-f0-9]{64})(?:;|$)/.exec(cookie);
  if (!match) return null;
  const [s] = await rows(
    pool,
    `SELECT s.tokenHash,s.csrf,u.id,u.name,u.email FROM sesiones s JOIN usuarios u ON s.userId=u.id
    WHERE s.tokenHash=? AND s.expiresAt>UTC_TIMESTAMP()`,
    [digest(match[1])],
  );
  return s;
}
export async function protect(req, res, next) {
  const s = await session(req.headers.cookie);
  requireThat(s, 401, 'SESSION', 'Inicia sesión para continuar.');
  if (req.method !== 'GET')
    requireThat(
      req.get('X-CSRF-Token') === s.csrf,
      403,
      'CSRF',
      'Vuelve a abrir la sesión.',
    );
  req.session = s;
  next();
}
const publicUser = ({ id, name, email, csrf }) => ({ id, name, email, csrf });
export function authRoutes(router) {
  const limits = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      res
        .status(429)
        .json({
          error: {
            code: 'RATE_LIMIT',
            message: 'Demasiados intentos. Intenta más tarde.',
          },
          requestId: req.requestId,
        }),
  };
  const ipLimit = rateLimit({ ...limits, limit: 100 });
  const accountLimit = rateLimit({
    ...limits,
    limit: 12,
    skipSuccessfulRequests: true,
    keyGenerator: (req) =>
      digest(
        String(req.body?.email || '')
          .trim()
          .toLowerCase(),
      ),
  });
  router.post('/auth/register', ipLimit, async (req, res) => {
    const b = registration.parse(req.body),
      hash = await argon2.hash(b.password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
    const id = await transaction(async (db) => {
      const r = await rows(
        db,
        'INSERT INTO usuarios(name,email,passwordHash) VALUES (?,?,?)',
        [b.name, b.email, hash],
      );
      for (const [type, names] of Object.entries(presets))
        for (const label of names)
          await rows(
            db,
            'INSERT INTO categorias(userId,name,type,preset) VALUES (?,?,?,1)',
            [r.insertId, label, type],
          );
      return r.insertId;
    });
    res.status(201).json({ data: { id } });
  });
  const dummy = argon2.hash(randomBytes(32));
  router.post('/auth/login', ipLimit, accountLimit, async (req, res) => {
    const b = credentials.parse(req.body);
    const [u] = await rows(pool, 'SELECT * FROM usuarios WHERE email=?', [
      b.email,
    ]);
    const valid = await argon2.verify(
      u?.passwordHash || (await dummy),
      b.password,
    );
    requireThat(
      u && valid,
      401,
      'CREDENTIALS',
      'Correo o contraseña incorrectos.',
    );
    await catchUp(u.id);
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex');
    const old = await session(req.headers.cookie);
    await transaction(async (db) => {
      if (old)
        await rows(db, 'DELETE FROM sesiones WHERE tokenHash=?', [
          old.tokenHash,
        ]);
      await rows(
        db,
        'INSERT INTO sesiones VALUES (?,?,?,UTC_TIMESTAMP()+INTERVAL 7 DAY)',
        [digest(token), u.id, csrf],
      );
    });
    res
      .cookie('gf_session', token, { ...cookieOptions(), maxAge: 604800000 })
      .json({ data: publicUser({ ...u, csrf }) });
  });
  router.use(protect);
  router.get('/users/me', (req, res) =>
    res.json({ data: publicUser(req.session) }),
  );
  router.patch('/users/me', async (req, res) => {
    const b = z.object({ name, email }).parse(req.body);
    await rows(pool, 'UPDATE usuarios SET name=?,email=? WHERE id=?', [
      b.name,
      b.email,
      req.session.id,
    ]);
    res.json({ data: publicUser({ ...req.session, ...b }) });
  });
  router.post('/auth/logout', async (req, res) => {
    await rows(pool, 'DELETE FROM sesiones WHERE tokenHash=?', [
      req.session.tokenHash,
    ]);
    req.app.get('io')?.in(req.session.tokenHash).disconnectSockets(true);
    res
      .clearCookie('gf_session', cookieOptions())
      .json({ data: { closed: true } });
  });
}
