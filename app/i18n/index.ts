import { createToolkitI18nCatalog } from "@agent-native/toolkit/app/i18n";

import enUS from "./en-US";

export const i18nCatalog = createToolkitI18nCatalog({
  messages: enUS,
  localeLoaders: {},
});
