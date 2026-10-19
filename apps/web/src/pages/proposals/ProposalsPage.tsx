import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "../../components/PagePlaceholder";

export function ProposalsPage() {
  const { t } = useTranslation("proposals");
  return <PagePlaceholder title={t("title")} text={t("placeholder")} />;
}
