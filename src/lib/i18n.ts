export type Locale = "ru" | "kk";
export const defaultLocale: Locale = "ru";
const ru = {
  projects: "Проекты",
  path: "Мой путь",
  application: "Заявка",
  save: "Сохранить",
  saved: "Сохранено",
  retry: "Повторить",
};
export type Messages = typeof ru;
// New locales must provide the complete, reviewed message catalog before exposure.
export const messages: Partial<Record<Locale, Messages>> = { ru };
export const getMessages = (locale: Locale) => messages[locale] ?? ru;
