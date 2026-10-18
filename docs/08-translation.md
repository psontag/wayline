# Translation

The UI is in English. All text is prepared for translation from the start, so adding a language is only adding a file.

## Library

i18next with react-i18next. It also works in React Native.

## Rules

- No text in components. All UI text comes from translation files.
- English is the source language. Other languages fall back to English for missing keys.
- Keys are grouped by screen or feature: `tripEditor.exportGpx`, `stage.title`.
- Plurals and variables use i18next syntax: `"stageCount": "{{count}} stages"`.
- Place names, hotel names and other provider data are not translated.

## Files

App strings:

```
apps/web/src/i18n/
  en/
    common.json
    tripEditor.json
    ...
```

`packages/ui` holds only component strings, e.g. labels of shared components. They use the `ui` namespace and the app merges them into its resources.

Keys are typed. A wrong key is a TypeScript error.

## Formatting

Numbers, dates and times use the `Intl` APIs with the current locale. Units are always metric. All formatting goes through the shared functions in `packages/ui`.

## Language choice

- Default: browser language if supported, otherwise English.
- The user can change it in settings. The choice is stored in local storage.

## Enforcement

| Rule | How |
|---|---|
| No literal text in JSX | ESLint `i18next/no-literal-string` |
| No missing or unused keys | Check script in CI |
| Valid keys only | Typed keys |
