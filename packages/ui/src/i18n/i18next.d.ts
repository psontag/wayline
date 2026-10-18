// Typed keys when checking this package alone. Apps declare their own
// resources, which include the "ui" namespace.
import "i18next";
import type { uiResources } from "./index";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "ui";
    resources: (typeof uiResources)["en"];
  }
}
