import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme, type ThemeSetting } from "../theme/ThemeProvider";
import { IconButton } from "./IconButton";

const next: Record<ThemeSetting, ThemeSetting> = {
  system: "light",
  light: "dark",
  dark: "system",
};
const icons = { system: Monitor, light: Sun, dark: Moon };

/** Cycles system, light and dark. */
export function ThemeToggle() {
  const { t } = useTranslation("ui");
  const { theme, setTheme } = useTheme();
  const Icon = icons[theme];
  return (
    <IconButton
      label={t("theme.toggle", { theme: t(`theme.${theme}`) })}
      icon={<Icon aria-hidden />}
      onClick={() => setTheme(next[theme])}
    />
  );
}
