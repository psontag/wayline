import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "../../components/PagePlaceholder";

export function NewTripPage() {
  const { t } = useTranslation("newTrip");
  return <PagePlaceholder title={t("title")} text={t("placeholder")} />;
}
