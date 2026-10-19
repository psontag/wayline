import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "../../components/PagePlaceholder";

export function TripListPage() {
  const { t } = useTranslation("tripList");
  return <PagePlaceholder title={t("title")} text={t("placeholder")} />;
}
