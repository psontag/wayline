import { defaultNS, resources } from "@wayline/ui/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

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
