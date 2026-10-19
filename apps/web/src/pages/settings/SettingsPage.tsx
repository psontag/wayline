import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "../../components/PagePlaceholder";

export function SettingsPage() {
  const { t } = useTranslation("settings");
  return <PagePlaceholder title={t("title")} text={t("placeholder")} />;
}
