import { uiResources } from "@wayline/ui/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "./en/common.json";
import devComponents from "./en/devComponents.json";
import map from "./en/map.json";

export const defaultNS = "common";

export const resources = {
  en: { ...uiResources.en, common, devComponents, map },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  defaultNS,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    // React escapes output already.
    escapeValue: false,
  },
});

export default i18n;
