/**
 * Shared jobs data source
 *
 * Centralized catalog of briefs the marketplace knows about until the
 * real API is wired. Both /student/find-work and /jobs/[id] import from
 * here so the listing and the detail page never disagree.
 *
 * Notes:
 *   - Every brief has a stable slug used as the route param.
 *   - `category` matches the values from /jobs/post so filters line up
 *     with the post-brief flow.
 *   - `postedAt` is an ISO date — render with the formatRelative helper
 *     below; never derive "X days ago" client-side from `new Date()` to
 *     avoid hydration drift.
 *   - `verified` indicates the company has completed work-email
 *     verification (truthful signal — not all do).
 */

export type JobCategory =
  | 'Web Development'
  | 'Mobile Development'
  | 'UI/UX Design'
  | 'Graphic Design'
  | 'Video Editing'
  | 'Content Writing'
  | 'Copywriting'
  | 'SEO'
  | 'Digital Marketing'
  | 'Social Media Management'
  | 'Data Entry'
  | 'Virtual Assistant'
  | 'AI / Machine Learning'
  | 'Automation'
  | 'Cybersecurity'
  | 'DevOps'
  | 'Game Development'
  | 'WordPress'
  | 'Shopify'
  | 'E-commerce'
  | 'Customer Support'
  | 'Sales'
  | 'Business Research'
  | 'Finance'
  | 'Accounting'
  | 'Tutoring'
  | 'Other';

export type BudgetType = 'fixed' | 'hourly';

export interface Job {
  /** URL slug — also used as the [id] route param */
  id: string;
  title: string;
  company: string;
  /** Short blurb that appears in the listing */
  summary: string;
  /** Full description shown on the detail page */
  description: string;
  category: JobCategory;
  budget: { type: BudgetType; amount: number };
  duration: string;
  hours: string;
  skills: string[];
  /** ISO 8601 publish date */
  postedAt: string;
  /** ISO 3166-1 alpha-2 country code for the role's location */
  location: string;
  remote: boolean;
  /** Has the company verified their work email? */
  verified: boolean;
}

export const JOBS: Job[] = [
  {
    id: 'brand-designer-webflow',
    title: 'Brand designer for a 4-page Webflow site',
    company: 'Linear Labs',
    summary:
      'Translate our existing Figma system into a polished Webflow site. Two-week engagement, fixed price.',
    description:
      'We have an approved Figma file for our marketing site (4 pages: home, product, pricing, contact). We are looking for a designer who can take ownership of the Webflow build end-to-end: setting up the design system in Webflow, translating the Figma to responsive Webflow components, and tightening the final QA pass.\n\nYou will work directly with our marketing lead. We will provide brand assets, copy, and a 30-minute kickoff. We expect ~10–20 hours per week over 1–2 weeks.',
    category: 'UI/UX Design',
    budget: { type: 'fixed', amount: 1200 },
    duration: '1–2 weeks',
    hours: '10–20 hrs / week',
    skills: ['Figma', 'Webflow', 'CSS', 'Brand design'],
    postedAt: '2026-05-28',
    location: 'US',
    remote: true,
    verified: true,
  },
  {
    id: 'data-viz-dashboard',
    title: 'Data viz dashboard for a research dataset',
    company: 'Atlas Research',
    summary: 'Build an interactive dashboard over a public education dataset. ~3 week engagement.',
    description:
      'Atlas Research is publishing a dataset on college outcomes and we need an interactive dashboard so readers can slice it by state, major, and year. We have a CSV, a list of questions we want answered, and a Streamlit deploy target. You will own the build, the chart design, and a short README.',
    category: 'AI / Machine Learning',
    budget: { type: 'hourly', amount: 45 },
    duration: '2–4 weeks',
    hours: '10–20 hrs / week',
    skills: ['Python', 'Streamlit', 'Pandas', 'Data visualization'],
    postedAt: '2026-05-30',
    location: 'US',
    remote: true,
    verified: true,
  },
  {
    id: 'marketing-copy-launch',
    title: 'Marketing copy for a product launch',
    company: 'Plaid',
    summary: 'Three launch emails, a landing page, and a press release. ~1 week.',
    description:
      'We are launching a new product next month and need sharp, conversion-focused copy across three surfaces: a launch email sequence (3 emails), the landing page hero + sub, and a press release. Voice: confident, plain-spoken, a little dry. References will be provided.',
    category: 'Copywriting',
    budget: { type: 'fixed', amount: 900 },
    duration: '1 week',
    hours: '5–10 hrs / week',
    skills: ['Copywriting', 'Email', 'B2B SaaS'],
    postedAt: '2026-05-22',
    location: 'US',
    remote: true,
    verified: true,
  },
  {
    id: 'tutor-linear-algebra',
    title: 'Weekly Linear Algebra tutor (remote)',
    company: 'Maya P.',
    summary:
      'Sophomore at UCLA needs weekly 1-on-1 Linear Algebra tutoring through finals. Recurring gig.',
    description:
      'I am a sophomore at UCLA taking MATH 33A (Linear Algebra) and looking for a tutor who can meet twice a week for an hour each. I am comfortable with the basics but I struggle with proof-style questions. Ideal cadence: 2 sessions of 60 minutes, Tuesday and Thursday evenings Pacific.',
    category: 'Tutoring',
    budget: { type: 'hourly', amount: 30 },
    duration: '1–3 months',
    hours: '1–5 hrs / week',
    skills: ['Linear Algebra', 'Math tutoring', 'Proofs'],
    postedAt: '2026-05-26',
    location: 'US',
    remote: true,
    verified: false,
  },
  {
    id: 'react-native-bugfix',
    title: 'React Native bug fix: Android push notifications',
    company: 'Cobalt Health',
    summary: 'Small, well-scoped engagement to fix a known Android push notification issue.',
    description:
      'We have a known regression in our React Native app: push notifications are not delivered on Android after the app is background-killed. We have a reduced repro and a hypothesis. Looking for someone who has shipped RN apps to Android to fix and ship the patch this week.',
    category: 'Mobile Development',
    budget: { type: 'fixed', amount: 450 },
    duration: 'Less than 1 week',
    hours: '5–10 hrs / week',
    skills: ['React Native', 'Android', 'Push notifications', 'JavaScript'],
    postedAt: '2026-06-01',
    location: 'CA',
    remote: true,
    verified: true,
  },
  {
    id: 'video-edit-testimonials',
    title: 'Edit 6 short testimonial videos for the homepage',
    company: 'Crescent Studio',
    summary: 'Rough iPhone cuts → polished 30–45s vertical videos with captions and music.',
    description:
      'We shot six short testimonial videos on an iPhone. Looking for a video editor to trim, add captions, score with royalty-free music, and export vertical 30–45s cuts for our homepage. Source files are in Google Drive.',
    category: 'Video Editing',
    budget: { type: 'fixed', amount: 600 },
    duration: '1–2 weeks',
    hours: '5–10 hrs / week',
    skills: ['Premiere Pro', 'Capcut', 'Captions', 'Short-form video'],
    postedAt: '2026-05-24',
    location: 'US',
    remote: true,
    verified: false,
  },
  {
    id: 'ux-research-mobile-banking',
    title: 'UX research assistant: mobile banking study',
    company: 'North River Labs',
    summary: 'Help run a 6-week diary study with 12 participants for a banking client.',
    description:
      'We are running a 6-week diary study for a regional bank and need a research assistant to help with participant recruitment, weekly check-ins, and tagging notes in Dovetail. Prior diary-study experience is a plus but not required — we will teach you our process.',
    category: 'Business Research',
    budget: { type: 'hourly', amount: 28 },
    duration: '1–3 months',
    hours: '5–10 hrs / week',
    skills: ['UX research', 'Recruiting', 'Dovetail', 'Notetaking'],
    postedAt: '2026-05-19',
    location: 'US',
    remote: true,
    verified: true,
  },
  {
    id: 'seo-blog-posts',
    title: 'Four SEO-focused blog posts for a SaaS launch',
    company: 'Slate',
    summary: 'Long-form posts targeting comparison keywords in the project management space.',
    description:
      'We need four 1,200-word blog posts targeting "X vs Y" comparison keywords in the project-management space. You will receive an outline, a target keyword, and three reference posts per piece. Voice: clear, technical, second-person.',
    category: 'SEO',
    budget: { type: 'fixed', amount: 800 },
    duration: '1–2 weeks',
    hours: '5–10 hrs / week',
    skills: ['SEO writing', 'B2B SaaS', 'Long-form'],
    postedAt: '2026-05-31',
    location: 'US',
    remote: true,
    verified: true,
  },
  {
    id: 'illustrate-12-spot-illustrations',
    title: 'Illustrate 12 spot illustrations for a fintech app',
    company: 'Hatch',
    summary: 'Twelve on-brand spot illustrations used across empty states and onboarding.',
    description:
      'We need twelve 1x illustrations used across empty states, onboarding, and error screens in our fintech iOS app. Style: clean, geometric, two-tone. We will provide a style frame and a color palette. Final files should be SVG with named layers.',
    category: 'Graphic Design',
    budget: { type: 'fixed', amount: 2400 },
    duration: '1–3 months',
    hours: '5–10 hrs / week',
    skills: ['Illustration', 'Figma', 'SVG', 'Geometric'],
    postedAt: '2026-05-15',
    location: 'US',
    remote: true,
    verified: true,
  },
  {
    id: 'soc2-policy-drafting',
    title: 'Help draft 3 SOC 2 security policies',
    company: 'Greenline',
    summary: 'Adapt three policies (Access Control, Vendor Risk, Incident Response) for our stack.',
    description:
      'We are working toward SOC 2 Type 1 and need help adapting three security policies — Access Control, Vendor Risk Management, and Incident Response — to our actual stack (Vercel, AWS, Linear, Notion, GitHub). You will draft v1; our vCISO will review.',
    category: 'Cybersecurity',
    budget: { type: 'hourly', amount: 55 },
    duration: '2–4 weeks',
    hours: '5–10 hrs / week',
    skills: ['Security', 'SOC 2', 'Policy writing', 'AWS'],
    postedAt: '2026-05-29',
    location: 'US',
    remote: true,
    verified: true,
  },
  {
    id: 'tiktok-channel-management',
    title: 'Run a 30-day TikTok experiment for a DTC brand',
    company: 'Marlow Goods',
    summary: 'Shoot, edit, and post 20 short-form videos with a clear hook formula.',
    description:
      'We want to test TikTok as a channel for our DTC brand. Looking for someone to shoot, edit, and post 20 short-form videos over 30 days, following a hook template we will provide. We will ship product samples and brand guidelines.',
    category: 'Social Media Management',
    budget: { type: 'fixed', amount: 1500 },
    duration: '1 month',
    hours: '10–20 hrs / week',
    skills: ['TikTok', 'Short-form video', 'Content strategy', 'DTC'],
    postedAt: '2026-06-02',
    location: 'US',
    remote: true,
    verified: false,
  },
  {
    id: 'ml-experiment-helper',
    title: 'ML research assistant: hyperparameter sweeps',
    company: 'Polaris AI Lab',
    summary: 'Run scheduled sweeps over a small set of vision models, log results, summarize.',
    description:
      'We are a 4-person lab and need a part-time research assistant to run scheduled hyperparameter sweeps over a small set of vision models, log results in Weights & Biases, and write a short weekly summary. Must be comfortable with PyTorch and the W&B CLI.',
    category: 'AI / Machine Learning',
    budget: { type: 'hourly', amount: 40 },
    duration: '1–3 months',
    hours: '5–10 hrs / week',
    skills: ['PyTorch', 'Weights & Biases', 'Computer vision', 'Python'],
    postedAt: '2026-05-27',
    location: 'US',
    remote: true,
    verified: true,
  },
];

/* ─── Derived helpers ─────────────────────────────────────────── */

export const JOB_CATEGORIES: JobCategory[] = [
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

/** Slugs that /jobs/[id] should pre-render at build time. */
export function getAllJobIds(): string[] {
  return JOBS.map((job) => job.id);
}

export function getJobById(id: string): Job | undefined {
  return JOBS.find((job) => job.id === id);
}

/**
 * Listing-level filter. Each criterion is optional; an undefined
 * criterion means "no filter on that dimension."
 *
 * The keyword check is intentionally simple — title + company + summary,
 * case-insensitive. Real search will move to the API.
 */
export interface JobFilter {
  keyword?: string;
  category?: JobCategory | 'All';
  budgetType?: BudgetType | 'All';
  maxHoursPerWeek?: 5 | 10 | 20;
  remoteOnly?: boolean;
}

export function filterJobs(filter: JobFilter = {}): Job[] {
  const keyword = filter.keyword?.trim().toLowerCase();
  return JOBS.filter((job) => {
    if (filter.category && filter.category !== 'All' && job.category !== filter.category) {
      return false;
    }
    if (filter.budgetType && filter.budgetType !== 'All' && job.budget.type !== filter.budgetType) {
      return false;
    }
    if (filter.remoteOnly && !job.remote) {
      return false;
    }
    if (filter.maxHoursPerWeek !== undefined) {
      // Each job's `hours` is a band string. Compare upper bound of band
      // against the user's ceiling.
      const upper = parseHoursUpperBound(job.hours);
      if (upper === null || upper > filter.maxHoursPerWeek) return false;
    }
    if (keyword) {
      const haystack = `${job.title} ${job.company} ${job.summary} ${job.skills.join(' ')}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

/**
 * Returns the upper bound (hours/week) implied by a band string, or null
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

/* ─── Display helpers ────────────────────────────────────────── */

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

export function formatBudget(job: Job): string {
  if (job.budget.type === 'fixed') {
    return `$${job.budget.amount.toLocaleString()} fixed`;
  }
  return `$${job.budget.amount}/hr`;
}
