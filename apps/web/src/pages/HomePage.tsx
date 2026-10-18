import { useTranslation } from "react-i18next";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-2 px-6 py-10">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {t("app.name")}
      </h1>
      <p className="text-text-muted">{t("app.tagline")}</p>
    </div>
  );
}
