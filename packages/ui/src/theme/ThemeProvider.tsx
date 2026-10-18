import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeSetting = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const storageKey = "wayline.theme";
const darkQuery = "(prefers-color-scheme: dark)";

function readSetting(): ThemeSetting {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "light" || value === "dark") return value;
  } catch {
    // Storage can be blocked. Fall back to the system setting.
  }
  return "system";
}

function writeSetting(setting: ThemeSetting) {
  try {
    if (setting === "system") localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, setting);
  } catch {
    // Storage can be blocked. The choice then lasts for this page only.
  }
}

// Runs outside of React effects, so the attribute is set before children
// read resolved CSS variables.
function applySetting(setting: ThemeSetting) {
  const root = document.documentElement;
  if (setting === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", setting);
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(darkQuery).matches ? "dark" : "light";
}

type ThemeContextValue = {
  theme: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeSetting) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>(() => {
    const setting = readSetting();
    applySetting(setting);
    return setting;
  });
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    const query = window.matchMedia(darkQuery);
    const onChange = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: ThemeSetting) => {
    applySetting(next);
    writeSetting(next);
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme: theme === "system" ? system : theme,
      setTheme,
    }),
    [theme, system, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme needs a ThemeProvider");
  return value;
}
