/**
 * jobs
 *
 * Pure helpers and constants used by the Find Work page and the
 * brief detail page. The data itself lives in Supabase
 * (`public.jobs`); this file is no longer a catalog — it is the
 * place where the label, classification, and filter math lives.
 *
 * What stays:
 *   - The four constants the Find Work filter dropdowns render:
 *     `JOB_CATEGORIES`, `EXP_LEVELS`, `BUDGET_RANGES`,
 *     `BUDGET_TYPES`.
 *   - Three derived helpers: `experienceLevelFor`,
 *     `estimatedTotalBudget`, `matchesBudgetRange`.
 *   - The relative-date formatter `formatRelativeDate` and the
 *     `Recency` / `matchesRecency` predicate.
 *   - Three internal parsers for the human-written `duration` /
 *     `hours` strings the post form stores verbatim.
 *
 * Why this file is not gone: the helpers above depend on a
 * consistent grammar (the `duration` / `hours` band format) that
 * is also encoded in the post form's <select> options. Centralising
 * the parse + classify math here keeps that grammar documented in
 * one place.
 *
 * The pages that consume these helpers project a live `ListedJob`
 * (from src/lib/api.ts) into the small `Brief`-shaped input these
 * helpers expect; see find-work.astro::projectForHelpers.
 */

export type BudgetType = 'fixed' | 'hourly';

/**
 * The minimum shape these helpers need. Wider than the DB row so
 * the same code works for live (Supabase) briefs and for the
 * fallback stubs on the detail / apply pages.
 */
export interface BriefInput {
  budget: { type: BudgetType; amount: number };
  duration: string;
  hours: string;
}

/**
 * Categories rendered in the Find Work filter dropdown. The list is
 * intentionally closed — categories outside this set (e.g. the
 * kebab-case slugs the post form stores) won't appear in the UI.
 * Kept hand-curated, not derived from the DB, because the marketplace
 * is small and the dropdown doubles as the categorization contract.
 */
export const JOB_CATEGORIES: string[] = [
  'Web Development',
  'Mobile Development',
  'UI/UX Design',
  'Graphic Design',
  'Video Editing',
  'Content Writing',
  'Copywriting',
  'SEO',
  'Digital Marketing',
  'Social Media Management',
  'Data Entry',
  'Virtual Assistant',
  'AI / Machine Learning',
  'Automation',
  'Cybersecurity',
  'DevOps',
  'Game Development',
  'WordPress',
  'Shopify',
  'E-commerce',
  'Customer Support',
  'Sales',
  'Business Research',
  'Finance',
  'Accounting',
  'Tutoring',
  'Other',
];

export const BUDGET_TYPES: BudgetType[] = ['fixed', 'hourly'];

/**
 * Experience level — derived from the existing fields so we don't
 * need a separate "level" column on the brief. The rule is small
 * enough to live here and the page renders it transparently. The
 * same brief always classifies the same way.
 *
 *   - Entry:        short, well-scoped gigs (≤ 1 week total, ≤ 5 hrs/wk)
 *   - Intermediate: multi-week projects or weekly cadence
 *   - Experienced:  long, recurring, or high-rate engagements
 */
export type ExperienceLevel = 'Entry' | 'Intermediate' | 'Experienced';

export const EXP_LEVELS: ExperienceLevel[] = [
  'Entry',
  'Intermediate',
  'Experienced',
];

export function experienceLevelFor(job: BriefInput): ExperienceLevel {
  const hoursUpper = parseHoursUpperBound(job.hours) ?? 0;
  const totalWeeks = parseDurationWeeks(job.duration);

  // Long-running or high-rate → Experienced
  if (totalWeeks !== null && totalWeeks >= 8) return 'Experienced';
  if (job.budget.type === 'hourly' && job.budget.amount >= 50) {
    return 'Experienced';
  }
  if (job.budget.type === 'fixed' && job.budget.amount >= 2000) {
    return 'Experienced';
  }

  // Small, well-scoped → Entry
  const isShort =
    /less than 1 week/i.test(job.duration) ||
    (totalWeeks !== null && totalWeeks <= 1) ||
    hoursUpper <= 5;
  if (isShort) return 'Entry';

  return 'Intermediate';
}

/**
 * Budget range — bucketed for the filter UI. The labels are coarse on
 * purpose: the marketplace is small, the spread of budgets is wide, and
 * the filter is a way to hide briefs that are clearly outside the user's
 * range, not a precise calculator.
 */
export type BudgetRange = 'under-500' | '500-1500' | '1500-5000' | 'over-5000';

export const BUDGET_RANGES: { value: BudgetRange; label: string }[] = [
  { value: 'under-500', label: 'Under $500' },
  { value: '500-1500', label: '$500 – $1,500' },
  { value: '1500-5000', label: '$1,500 – $5,000' },
  { value: 'over-5000', label: '$5,000+' },
];

/**
 * Estimate the *total* budget for a brief. Fixed-price briefs return
 * the amount directly. Hourly briefs are estimated as
 *   hours/wk × duration-weeks × hourly rate
 * using the band midpoints so we don't need a separate field on the
 * brief. This estimate is shown in the filter UI, not in the budget
 * label on the card — the card stays truthful to its own amount.
 */
export function estimatedTotalBudget(job: BriefInput): number {
  if (job.budget.type === 'fixed') return job.budget.amount;

  const hoursMid = parseHoursMidpoint(job.hours);
  const weeks = parseDurationWeeks(job.duration);
  if (hoursMid === null || weeks === null) {
    // Fall back to one month of mid-range hours so the brief still
    // sorts sensibly; we never want a null bucket.
    return job.budget.amount * 40;
  }
  return job.budget.amount * hoursMid * weeks;
}

export function matchesBudgetRange(
  job: BriefInput,
  range: BudgetRange | 'All',
): boolean {
  if (range === 'All') return true;
  const total = estimatedTotalBudget(job);
  switch (range) {
    case 'under-500':
      return total < 500;
    case '500-1500':
      return total >= 500 && total < 1500;
    case '1500-5000':
      return total >= 1500 && total < 5000;
    case 'over-5000':
      return total >= 5000;
  }
}

/**
 * Recency filter — "last 7 days" / "last 30 days" / "any time".
 * Reference date is fixed (see formatRelativeDate) so server-rendered
 * buckets don't drift from build to build.
 */
export type Recency = '7' | '30' | 'any';

export function matchesRecency(
  iso: string,
  recency: Recency,
  reference: string = '2026-06-05',
): boolean {
  if (recency === 'any') return true;
  const ref = new Date(reference + 'T00:00:00Z').getTime();
  const posted = new Date(iso + 'T00:00:00Z').getTime();
  const days = Math.round((ref - posted) / (1000 * 60 * 60 * 24));
  if (recency === '7') return days <= 7;
  if (recency === '30') return days <= 30;
  return true;
}

/**
 * Numeric upper-bound (USD) implied by a budget range value. Returns
 * `Infinity` for `over-5000`. Used by the Find Work page to push the
 * predicate into a data attribute so the client-side filter pass stays
 * a single numeric comparison per brief.
 */
export function budgetRangeUpperBound(range: BudgetRange): number {
  switch (range) {
    case 'under-500':
      return 500;
    case '500-1500':
      return 1500;
    case '1500-5000':
      return 5000;
    case 'over-5000':
      return Infinity;
  }
}

/**
 * Render an ISO date as a relative phrase ("3 days ago") using a fixed
 * reference date. We deliberately do not call `new Date()` here so the
 * server-rendered output never drifts from the build timestamp.
 */
export function formatRelativeDate(iso: string, reference: string = '2026-06-05'): string {
  const then = new Date(iso + 'T00:00:00Z').getTime();
  const ref = new Date(reference + 'T00:00:00Z').getTime();
  const days = Math.round((ref - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 7) return `Posted ${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `Posted ${w} week${w === 1 ? '' : 's'} ago`;
  }
  const m = Math.floor(days / 30);
  return `Posted ${m} month${m === 1 ? '' : 's'} ago`;
}

/* ─── Internal: duration / hours parsers ─────────────────────── */

/**
 * Parse the upper bound (hours/week) implied by a band string, or null
 * if it cannot be parsed. `20+` bands are treated as Infinity.
 */
function parseHoursUpperBound(band: string): number | null {
  const m = band.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return Number(m[2]);
  const single = band.match(/(\d+)/);
  if (single) return Number(single[1]);
  if (/20\+/i.test(band)) return Infinity;
  return null;
}

/**
 * Midpoint of a `X-Y` band. `20+` bands cap at 20 (the realistic
 * weekly ceiling for a student). `Less than 1 week` durations are
 * handled by the duration parser, not here.
 */
function parseHoursMidpoint(band: string): number | null {
  const m = band.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const single = band.match(/(\d+)/);
  if (single) return Number(single[1]);
  if (/20\+/i.test(band)) return 20;
  return null;
}

/**
 * Best-effort duration parser. Returns whole weeks; `Less than 1 week`
 * resolves to 1, `1 month` resolves to 4. Returns null when the string
 * has no number we can pin a duration to.
 */
function parseDurationWeeks(duration: string): number | null {
  if (/less than 1 week/i.test(duration)) return 1;
  const m = duration.match(/(\d+)\s*[-–]\s*(\d+)\s*(week|month)/i);
  if (m) {
    const avg = (Number(m[1]) + Number(m[2])) / 2;
    return m[3].toLowerCase() === 'month' ? avg * 4 : avg;
  }
  const single = duration.match(/(\d+)\s*(week|month)/i);
  if (single) {
    const n = Number(single[1]);
    return single[2].toLowerCase() === 'month' ? n * 4 : n;
  }
  return null;
}
