import { useState } from "react";

type Theme = "light" | "dark" | "system";
const storageKey = "indooro-theme";
const validTheme = (value: unknown): value is Theme => value === "light" || value === "dark" || value === "system";

function applyTheme(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
}

// Run before React mounts. CSS handles live OS preference changes in System mode.
export function initializeTheme(): Theme {
  let theme: Theme = "system";
  try {
    const stored = localStorage.getItem(storageKey);
    if (validTheme(stored)) theme = stored;
  } catch { /* Storage can be unavailable in private or embedded contexts. */ }
  applyTheme(theme);
  return theme;
}

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(() => {
    const value = document.documentElement.dataset.theme;
    return validTheme(value) ? value : "system";
  });
  return <label className="theme-control"><span className="theme-label">Darstellung</span>
    <svg className="theme-icon" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
    <select aria-label="Darstellung" value={theme} onChange={(event) => {
      const value = event.target.value;
      if (!validTheme(value)) return;
      setTheme(value);
      applyTheme(value);
      try { localStorage.setItem(storageKey, value); } catch { /* The selection still works without persistence. */ }
    }}>
      <option value="light">Hell</option>
      <option value="dark">Dunkel</option>
      <option value="system">System</option>
    </select>
  </label>;
}
