import { ExpenseRow } from './models';

/**
 * Read-time quality filter for the ledger, mirroring expense-tracker-api/src/sync/sanitize.ts
 * (keep the two in step). Applied in DataStore.load() to each member's COMPLETE pulled
 * ledger — never to a single pull page, where a prompt and its transfer or the two copies
 * of one SMS can sit either side of the page break.
 *
 * The server currently serves rows unsanitized, so the rules live here until the API is
 * redeployed; they are idempotent, so a double pass (client over a future sanitized API)
 * finds nothing left to drop.
 */

/** Telecom service notices. Never a transaction. */
const TELECOM_ALERT = /\bno recharge\b|outgoing service|service has expired/i;

/** A payment prompt ("Swiggy is requesting payment of Rs.413"), not the transfer itself. */
const PAYMENT_REQUEST =
  /\bis requesting payment\b|has requested money\b|requesting payment of\b/i;

/** Above this the "amount" is an identifier, not money. The real ledger tops out far below. */
export const MAX_PLAUSIBLE_PAISE = 100_000_000; // ₹10,00,000

/** Money demonstrably in, per the API's parse rules. */
const CREDIT =
  /\b(credited|received|remitted|refund(?:ed)?|salary|interest earned|cashback)|\bcr\.?\s+(?=₹|rs\.?|inr|\d)/i;

/** Money demonstrably out; beats CREDIT, so "debited ... cashback credited" stays a spend. */
const DEBIT_STRONG =
  /\b(debited|spent|charged|paid|withdrawn|purchased)\b|\bdr\.?\s+(?=₹|rs\.?|inr|\d|from\b)/i;

/** Two reports of one event sit this close together; two real transactions usually don't. */
const DUPLICATE_WINDOW_MS = 5 * 60_000;

/** Copies of one text arrive twice (live push + inbox rescan) with the inbox copy
 *  tail-truncated, so exact-text equality misses them. Same amount, ≤5 min apart,
 *  and one message a prefix of the other (≥40 normalized chars) is still one event. */
const HEAD_MIN_CHARS = 40;

const sameSms = (a: string | null, b: string | null): boolean => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= HEAD_MIN_CHARS && (x.startsWith(y) || y.startsWith(x)));
};

/** How long after a prompt we await its matching transfer when checking whether one exists. */
const REQUEST_PAIR_WINDOW_MS = 30 * 60_000;

const norm = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const income = (r: ExpenseRow): boolean => CREDIT.test(r.rawSms) && !DEBIT_STRONG.test(r.rawSms);

const sameLocalDay = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

export function sanitizeExpenses(input: ExpenseRow[]): ExpenseRow[] {
  // Hard drops: telecom notices, and amounts no real transaction can carry.
  let rows = input.filter(
    (r) => !TELECOM_ALERT.test(r.rawSms) && r.amountPaise <= MAX_PLAUSIBLE_PAISE,
  );

  // Payment prompts: drop one only when the transfer it demanded actually arrived. An
  // unpaired prompt is kept — without it the transfer would have no record at all.
  const isPrompt = (r: ExpenseRow): boolean => PAYMENT_REQUEST.test(r.rawSms);
  const real = rows.filter((r) => !isPrompt(r));
  const unpairedPrompts = rows.filter(
    (r) =>
      isPrompt(r) &&
      !real.some(
        (o) =>
          o.amountPaise === r.amountPaise &&
          Math.abs(o.txnAt - r.txnAt) <= REQUEST_PAIR_WINDOW_MS,
      ),
  );
  rows = [...real, ...unpairedPrompts];

  // Direction: trust the message over the stored flag, expense → income only.
  rows = rows.map((r) =>
    r.isExpense && !r.isIncome && income(r) ? { ...r, isIncome: true } : r,
  );

  // Duplicates: identical message text, or two credit messages for the same amount on
  // the same day, both inside the window. Amount+time alone is NOT a merge key — two
  // real ₹5,000 withdrawals a minute apart exist.
  rows = [...rows].sort((a, b) => a.txnAt - b.txnAt);
  const kept: ExpenseRow[] = [];
  for (const r of rows) {
    const dup = kept.find(
      (o) =>
        o.amountPaise === r.amountPaise &&
        Math.abs(o.txnAt - r.txnAt) <= DUPLICATE_WINDOW_MS &&
        (sameSms(o.rawSms, r.rawSms) || (income(o) && income(r) && sameLocalDay(o.txnAt, r.txnAt))),
    );
    if (!dup) {
      kept.push(r);
    } else if ((r.rawSms ?? '').length > (dup.rawSms ?? '').length && Math.abs(dup.txnAt - r.txnAt) <= 30_000) {
      // Keep the fuller copy: its tail carries the parsed category/merchant, the
      // truncated one often classifies as "Other". Amount is identical, so no money moves.
      kept[kept.indexOf(dup)] = r;
    }
  }
  return kept;
}
