"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeCtx);

/**
 * Inline script (runs before paint) that applies the theme — prevents a flash of the wrong theme.
 * Default is ALWAYS dark: we ignore the OS `prefers-color-scheme` so a user on a light-mode system
 * still lands on the dark theme. Dark is only overridden when the user has explicitly chosen light
 * (persisted as 'nexus-theme' = 'light' via the toggle).
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('nexus-theme');if(t!=='light'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Sync state from the class the init script already applied
  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const apply = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem("nexus-theme", t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => apply(document.documentElement.classList.contains("dark") ? "light" : "dark"), [apply]);

  return <ThemeCtx.Provider value={{ theme, toggle, setTheme: apply }}>{children}</ThemeCtx.Provider>;
}
