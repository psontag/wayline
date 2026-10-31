import {
  FormField,
  Input,
  SegmentedControl,
  type ThemeSetting,
  useTheme,
} from "@wayline/ui";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useHomeStation } from "../../data/homeStation";

const themes: ThemeSetting[] = ["system", "light", "dark"];

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const { t: tUi } = useTranslation("ui");
  const id = useId();
  const themeId = useId();
  const [home, setHome] = useHomeStation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 p-5">
      <h1 className="text-xl font-bold">{t("title")}</h1>
      <FormField
        label={t("homeStation.label")}
        htmlFor={id}
        hint={t("homeStation.hint")}
      >
        <Input
          id={id}
          defaultValue={home}
          placeholder={t("homeStation.placeholder")}
          onBlur={(event) => setHome(event.currentTarget.value)}
        />
      </FormField>
      <FormField label={t("theme")} labelId={themeId}>
        <SegmentedControl
          aria-labelledby={themeId}
          stretch
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeSetting)}
          options={themes.map((value) => ({
            value,
            label: tUi(`theme.${value}`),
          }))}
        />
      </FormField>
    </div>
  );
}
