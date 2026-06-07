/**
 * applicants
 *
 * Client-side wiring for /company/applicants:
 *   - Status filter chips: hide applicant cards whose data-applicant-status
 *     does not match the active filter.
 *   - Manage button: toggles the action row open/closed.
 *   - Action buttons (Shortlist / Hire / Reject): write through to
 *     `store.applications.updateStatus` (or `.hire` for the hire case,
 *     which auto-rejects the rest of the brief), then update the DOM
 *     in place — no full page reload, no flash.
 *   - Reject uses an inline confirm pattern: clicking "Reject" morphs
 *     the button to "Confirm reject?" for 3 seconds. A second click
 *     commits; otherwise it reverts.
 *
 * The script is a no-op if the page has no [data-applicants-root]
 * marker, so it's safe to import from any dashboard page.
 */

import { store, type Application, type ApplicationStatus } from './store';
import { toast } from './toast';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: 'New',
  shortlisted: 'Shortlisted',
  hired: 'Hired',
  rejected: 'Rejected',
};

const STATUS_PILL_CLASS: Record<ApplicationStatus, string> = {
  new: 'dash-pill dash-pill--cyan',
  shortlisted: 'dash-pill dash-pill--violet',
  hired: 'dash-pill dash-pill--success',
  rejected: 'dash-pill dash-pill--warning',
};

const STATUS_AVATAR_COLOR: Record<ApplicationStatus, string> = {
  new: 'cyan',
  shortlisted: 'violet',
  hired: 'link',
  rejected: 'ink',
};

const REJECT_CONFIRM_MS = 3000;

interface State {
  activeFilter: 'all' | ApplicationStatus;
  rejectTimers: Map<string, number>;
}

const state: State = {
  activeFilter: 'all',
  rejectTimers: new Map(),
};

function findRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-applicants-root]');
}

function findFilters(): NodeListOf<HTMLButtonElement> {
  return document.querySelectorAll<HTMLButtonElement>('[data-applicants-filters] [data-filter]');
}

function findCards(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>('[data-applicant-card]');
}

/* ─── Filter chips ──────────────────────────────────────────── */

function applyFilter() {
  const cards = findCards();
  cards.forEach((card) => {
    const status = card.getAttribute('data-applicant-status') as ApplicationStatus | null;
    const match = state.activeFilter === 'all' || status === state.activeFilter;
    card.classList.toggle('is-hidden', !match);
  });
  // If a brief group ends up with zero visible cards, hide the group
  // too so the layout does not show an empty card with just a header.
  document.querySelectorAll<HTMLElement>('[data-brief-id]').forEach((group) => {
    const visible = group.querySelectorAll<HTMLElement>('[data-applicant-card]:not(.is-hidden)').length;
    group.style.display = visible === 0 ? 'none' : '';
  });
}

function setActiveFilter(value: 'all' | ApplicationStatus) {
  state.activeFilter = value;
  findFilters().forEach((chip) => {
    const isActive = chip.getAttribute('data-filter') === value;
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  applyFilter();
}

function wireFilters() {
  findFilters().forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.getAttribute('data-filter');
      if (v === 'all' || v === 'new' || v === 'shortlisted' || v === 'hired' || v === 'rejected') {
        setActiveFilter(v);
      }
    });
  });
}

/* ─── Manage button + action row ───────────────────────────── */

function closeManageRows(except?: HTMLElement) {
  document.querySelectorAll<HTMLElement>('[data-applicant-manage]').forEach((manage) => {
    if (manage === except) return;
    const row = manage.querySelector<HTMLElement>('.apps__manage-row');
    const toggle = manage.querySelector<HTMLButtonElement>('[data-manage-toggle]');
    if (row && !row.hasAttribute('hidden')) {
      row.setAttribute('hidden', '');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });
}

function wireManageToggles() {
  document.querySelectorAll<HTMLElement>('[data-applicant-manage]').forEach((manage) => {
    const toggle = manage.querySelector<HTMLButtonElement>('[data-manage-toggle]');
    const row = manage.querySelector<HTMLElement>('.apps__manage-row');
    if (!toggle || !row) return;
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = !row.hasAttribute('hidden');
      closeManageRows(isOpen ? undefined : manage);
      if (isOpen) {
        row.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        row.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Click-outside closes any open row.
  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target) return;
    if (target.closest('[data-applicant-manage]')) return;
    closeManageRows();
  });

  // Escape closes any open row.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeManageRows();
  });
}

/* ─── Status updates (Shortlist / Hire / Reject) ──────────── */

function setCardStatus(card: HTMLElement, status: ApplicationStatus) {
  card.setAttribute('data-applicant-status', status);
  const pill = card.querySelector<HTMLElement>('[data-applicant-status-pill]');
  if (pill) {
    pill.className = STATUS_PILL_CLASS[status];
    pill.textContent = STATUS_LABELS[status];
  }
  const avatar = card.querySelector<HTMLElement>('.dash-list-avatar');
  if (avatar) avatar.setAttribute('data-color', STATUS_AVATAR_COLOR[status]);
}

function refreshHeaderCounts() {
  // Recompute the four-cell stats grid in the page header from the
  // DOM (single source of truth = the cards we just updated).
  const all = findCards();
  const counts = { new: 0, shortlisted: 0, hired: 0, rejected: 0 };
  all.forEach((card) => {
    const s = card.getAttribute('data-applicant-status') as ApplicationStatus | null;
    if (s && s in counts) counts[s] += 1;
  });
  // The header renders four cells in the order: New, Shortlisted,
  // Hired, Rejected — see FILTERS in applicants.astro.
  const cells = document.querySelectorAll<HTMLElement>('.apps-stats__value');
  const ordered: ApplicationStatus[] = ['new', 'shortlisted', 'hired', 'rejected'];
  cells.forEach((cell, i) => {
    const key = ordered[i];
    if (key) cell.textContent = String(counts[key]);
  });
  // Also refresh the chip counts.
  const chips = document.querySelectorAll<HTMLButtonElement>('[data-applicants-filters] [data-filter]');
  chips.forEach((chip) => {
    const v = chip.getAttribute('data-filter');
    const countEl = chip.querySelector<HTMLElement>('.apps__chip-count');
    if (!countEl) return;
    if (v === 'all') {
      countEl.textContent = String(all.length);
    } else if (v && v in counts) {
      countEl.textContent = String(counts[v as ApplicationStatus]);
    }
  });
}

function applyAction(action: 'shortlist' | 'hire' | 'reject', applicantId: string) {
  const card = document.querySelector<HTMLElement>(`[data-applicant-card][data-applicant-id="${CSS.escape(applicantId)}"]`);
  if (!card) return;

  if (action === 'hire') {
    // store.hire auto-rejects every other open application on the
    // same brief; we mirror that in the DOM so the user sees the
    // whole brief settle, not just the one card.
    const result = store.applications.hire(applicantId);
    if (!result.hired) {
      toast.error('Could not hire applicant', 'Please refresh and try again.');
      return;
    }
    setCardStatus(card, 'hired');
    result.autoRejected.forEach((rejected: Application) => {
      const other = document.querySelector<HTMLElement>(
        `[data-applicant-card][data-applicant-id="${CSS.escape(rejected.id)}"]`,
      );
      if (other) setCardStatus(other, 'rejected');
    });
    const name = result.hired.applicantName;
    const extra = result.autoRejected.length;
    toast.success(
      `${name} hired`,
      extra > 0
        ? `Other ${extra} application${extra === 1 ? '' : 's'} on this brief were auto-rejected.`
        : 'Funds will be held in escrow until you approve the work.',
    );
  } else {
    const target: ApplicationStatus = action === 'shortlist' ? 'shortlisted' : 'rejected';
    const updated = store.applications.updateStatus(applicantId, target);
    if (!updated) {
      toast.error('Could not update applicant', 'Please refresh and try again.');
      return;
    }
    setCardStatus(card, target);
    if (target === 'shortlisted') {
      toast.info(`Shortlisted ${updated.applicantName}`, 'They will see the change next time they sign in.');
    } else {
      toast.info(`Rejected ${updated.applicantName}`, 'They will be notified by email.');
    }
  }

  refreshHeaderCounts();
  // Re-apply the active filter so a status change that puts a card
  // outside the filter hides it.
  applyFilter();
  // Collapse the action row so the result is visible.
  closeManageRows();
}

function wireActions() {
  document.querySelectorAll<HTMLButtonElement>('[data-applicant-manage] [data-action]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const action = btn.getAttribute('data-action') as 'shortlist' | 'hire' | 'reject' | null;
      const id = btn.getAttribute('data-applicant-id');
      if (!action || !id) return;
      if (!cardMatchesFilter(action, id)) return;

      if (action === 'reject') {
        const confirming = btn.getAttribute('data-confirming') === 'true';
        if (confirming) {
          // Clear the pending timer; the action is committed.
          const pending = state.rejectTimers.get(id);
          if (pending) {
            window.clearTimeout(pending);
            state.rejectTimers.delete(id);
          }
          btn.removeAttribute('data-confirming');
          btn.textContent = 'Reject';
          applyAction('reject', id);
          return;
        }
        // Enter confirm mode.
        btn.setAttribute('data-confirming', 'true');
        btn.textContent = 'Confirm reject?';
        const timer = window.setTimeout(() => {
          btn.removeAttribute('data-confirming');
          btn.textContent = 'Reject';
          state.rejectTimers.delete(id);
        }, REJECT_CONFIRM_MS);
        state.rejectTimers.set(id, timer);
        return;
      }

      applyAction(action, id);
    });
  });
}

/**
 * The Reject confirm can only start if the card is currently visible
 * (matches the active filter). Otherwise the user is filtering out
 * rejected rows and clicking a stale button would be confusing.
 */
function cardMatchesFilter(action: string, id: string): boolean {
  if (action === 'reject' && state.activeFilter === 'rejected') return false;
  const card = document.querySelector<HTMLElement>(
    `[data-applicant-card][data-applicant-id="${CSS.escape(id)}"]`,
  );
  if (!card) return false;
  if (card.classList.contains('is-hidden')) return false;
  return true;
}

/* ─── Mount ─────────────────────────────────────────────────── */

export function mountApplicants() {
  if (!findRoot()) return;
  wireFilters();
  wireManageToggles();
  wireActions();
  applyFilter();
}
