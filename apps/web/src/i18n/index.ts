import { uiResources } from "@wayline/ui/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "./en/common.json";
import devComponents from "./en/devComponents.json";
import importTrip from "./en/importTrip.json";
import map from "./en/map.json";
import newTrip from "./en/newTrip.json";
import proposals from "./en/proposals.json";
import settings from "./en/settings.json";
import tripEditor from "./en/tripEditor.json";
import tripList from "./en/tripList.json";

export const defaultNS = "common";

// One namespace per screen. Each screen owns its file.
export const resources = {
  en: {
    ...uiResources.en,
    common,
    devComponents,
    importTrip,
    map,
    newTrip,
    proposals,
    settings,
    tripEditor,
    tripList,
  },
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
