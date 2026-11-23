import { z } from 'zod';
export class Problem extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export function requireThat(condition, status, code, message, details) {
  if (!condition) throw new Problem(status, code, message, details);
}
export const id = z.coerce.number().int().min(1).max(4294967295);
export const name = z.string().trim().min(1).max(90);
export const description = z.string().trim().max(240).default('');
export const type = z.enum(['income', 'expense']);
export const money = z
  .string()
  .regex(
    /^-?(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/,
    'Use pesos con máximo dos decimales.',
  );
export function cents(s) {
  const [whole, fraction = ''] = String(s).replace('-', '').split('.');
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return String(s).startsWith('-') ? -value : value;
}
export function decimal(c) {
  const n = c < 0n ? -c : c;
  return (
    (c < 0n ? '-' : '') + n / 100n + '.' + String(n % 100n).padStart(2, '0')
  );
}
// Zod 4 ejecuta los refine aunque el formato ya haya fallado: sin esta guarda,
// un importe como "abc" llegaba a cents() y provocaba un 500 en vez de un 400.
const isMoney = (s) => money.safeParse(s).success;
export const positive = money.refine(
  (s) => isMoney(s) && cents(s) > 0n,
  'El importe debe ser positivo.',
);
export const day = z.iso
  .date()
  .refine(
    (s) => s >= '1900-01-01' && s <= '9999-12-31',
    'Fecha fuera del intervalo.',
  );
export const today = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(
    new Date(),
  );
export const effectiveDay = day.refine(
  (s) => s <= today(),
  'La fecha efectiva no puede ser futura.',
);
export const period = z
  .string()
  .regex(/^(?:19\d\d|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/);
export const movement = z.object({
  type,
  accountId: id,
  categoryId: id,
  amount: positive,
  date: effectiveDay,
  description,
});
export const transfer = z.object({
  sourceAccountId: id,
  destinationAccountId: id,
  amount: positive,
  date: effectiveDay,
  description,
});
export const payment = z.object({
  accountId: id,
  amount: positive,
  date: effectiveDay,
  description,
});
export const version = z.object({ version: id });
export const schedule = z.object({
  name,
  categoryId: id,
  estimatedAmount: positive,
  dueDay: z.coerce.number().int().min(1).max(31),
  startDate: day,
  isVariable: z.boolean(),
});
