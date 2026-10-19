import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "../../components/PagePlaceholder";

export function TripEditorPage() {
  const { t } = useTranslation("tripEditor");
  return <PagePlaceholder title={t("title")} text={t("placeholder")} />;
}
