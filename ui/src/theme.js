// Synchronous theme initialization executed before app mount
export function initTheme() {
  try {
    const saved = localStorage.getItem('workflow-theme');
    const supportDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = (saved === 'light' || saved === 'dark') ? saved : (supportDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.add('preload');
    return theme;
  } catch {
    return 'dark';
  }
}

// Immediate execution on module import
initTheme();
