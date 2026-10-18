// The augmentation below needs i18next in the program.
import type {} from "i18next";
import common from "./en/common.json";

export const defaultNS = "common";

export const resources = {
  en: { common },
} as const;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)["en"];
  }
}
