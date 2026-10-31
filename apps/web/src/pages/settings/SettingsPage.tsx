import { FormField, Input } from "@wayline/ui";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useHomeStation } from "../../data/homeStation";

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const id = useId();
  const [home, setHome] = useHomeStation();

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
    </div>
  );
}
