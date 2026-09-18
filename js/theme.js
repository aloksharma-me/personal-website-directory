/* Light/dark theme: follows the system until the visitor picks one, then remembers it.
   Loaded in <head> without defer so data-theme is set before the page paints. */

(function () {
  const root = document.documentElement;
  const KEY = 'theme';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function apply(theme) {
    root.dataset.theme = theme;
    const button = document.querySelector('[data-theme-toggle]');
    if (button) {
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    }
  }

  apply(stored() || (systemDark.matches ? 'dark' : 'light'));

  // Keep following the system while the visitor hasn't chosen.
  systemDark.addEventListener('change', (e) => {
    if (!stored()) apply(e.matches ? 'dark' : 'light');
  });

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('[data-theme-toggle]');
    apply(root.dataset.theme);
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: just don't remember */ }
      apply(next);
    });
  });
})();
