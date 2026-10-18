import { useTranslation } from "react-i18next";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-xl font-semibold">{t("app.name")}</h1>
      <p className="text-text-muted">{t("app.tagline")}</p>
    </main>
  );
}
