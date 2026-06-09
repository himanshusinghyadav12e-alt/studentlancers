/**
 * profile-completion
 *
 * Client-side wiring for the ProfileCompletionCard. Animates the
 * progress bar fill from 0 to the computed percentage on page load,
 * and handles the "Complete Profile" CTA interaction.
 */

export function mountProfileCompletion() {
  const bars = document.querySelectorAll<HTMLElement>('[data-pc-fill]');
  if (!bars.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const bar = entry.target as HTMLElement;
          const target = bar.getAttribute('data-pc-fill');
          if (target) {
            requestAnimationFrame(() => {
              bar.style.width = target;
            });
          }
          io.unobserve(bar);
        }
      });
    },
    { threshold: 0.2 },
  );

  bars.forEach((bar) => {
    bar.style.width = '0%';
    io.observe(bar);
  });
}
