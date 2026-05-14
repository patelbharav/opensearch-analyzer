import { useCallback, useEffect, useState } from "react";
import { applyMode, Mode } from "@cloudscape-design/global-styles";

const STORAGE_KEY = "osa-theme";

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark") return true;
      if (stored === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    applyMode(dark ? Mode.Dark : Mode.Light);
    try { localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light"); } catch { /* */ }
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);

  return { dark, toggle };
}
