import { readMission, describeMission } from "./missions";
import { equipmentSchema, equipmentNames } from "./equipment";
import type { ApplicationFields, ProjectState, LanguageState } from "./types";
import { screenNames, fragments, modules, testimonies } from "./projects";
import { programFor, forcedStatements } from "./catalog";
export function describeWork(
  slug: string,
  s: ProjectState,
  context = "WORKSHOP",
): string {
  const mission=readMission(s);
  if(mission) return describeMission(mission);
  if (context === "EQUIPMENT") {
    const b = equipmentSchema.parse(s);
    return `Бронирование оборудования: ${b.screens.map((k) => equipmentNames[k]).join(" → ")}\nТелефон: ${b.requiredPhone ? "обязателен" : "по желанию"}\nЗанятое время: ${b.unavailable === "alternatives" ? "предложить свободное" : "подтвердить без проверки"}\nНазвание и время в подтверждении: ${b.reservationDetails ? "да" : "нет"}`;
  }
  if (slug === "digital-products")
    return (
      "Маршрут: " +
      s.screens.map((k) => screenNames[k]).join(" → ") +
      "\nТелефон: " +
      (s.requiredPhone ? "обязателен" : "по желанию")
    );
  if (slug === "digital-media")
    return `Заголовок: ${s.headline}\nПодпись: ${s.caption}\nПоследовательность:\n${s.fragments.map((k, i) => `${i + 1}. ${fragments[k].title}`).join("\n")}`;
  if (slug === "creative-engineering")
    return (
      "Размещение модулей:\n" +
      s.modules
        .map(
          (m) =>
            `${modules[m.kind].title}: клетка ${m.cell + 1}, стоимость ${modules[m.kind].cost}`,
        )
        .join("\n")
    );
  if (slug === "sociology")
    return (
      testimonies
        .map(
          (t) =>
            `${t.text} — ${s.classifications[t.id] === "observation" ? "Наблюдение" : s.classifications[t.id] === "assumption" ? "Предположение" : "Ещё не выбрано"}`,
        )
        .join("\n") + `\n\nСледующий вопрос: ${s.question}\nЗаписка: ${s.note}`
    );
  return `Материалы: ${s.allocations[0]} ед.\nНаставники: ${s.allocations[1]} ед.\nТихие места: ${s.allocations[2]} ед.\n\nКомпромисс: ${s.explanation}`;
}
export function applicationSnapshotText(value: unknown) {
  const snap = value as {
    fields?: ApplicationFields;
    programSlug?: string;
    consent?: string;
    consentedAt?: string;
    materialIds?: string[];
    transfers?: unknown[];
  };
  const f = snap.fields;
  if (!f) return snap.consent ?? "Сохранённое состояние заявки";
  return [
    snap.consent,
    `Кандидат: ${f.name}`,
    `Почта: ${f.email}`,
    `Город: ${f.city}`,
    `Программа: ${programFor(snap.programSlug ?? "")?.title ?? "Сохранённый выбор программы"}`,
    `Опыт: ${f.experience}`,
    `Личная роль: ${f.personalRole}`,
    `Мотивация: ${f.motivation}`,
    `Видеопрезентация: ${f.videoUrl || "Отдельный материал"}`,
    `Пояснение к документам: ${f.documentNote}`,
    `Больше похоже: ${forcedStatements[Number(f.most)] ?? "Не выбрано"}`,
    `Меньше похоже: ${forcedStatements[Number(f.least)] ?? "Не выбрано"}`,
    `Согласие на рассмотрение: ${f.processing ? "Да" : "Нет"}`,
    `Согласие на запись: ${f.audioConsent ? "Да" : "Нет"}`,
    `Добровольное исследование: ${f.research ? "Да" : "Нет"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function languageSnapshot(value: unknown) {
  const snap = value as LanguageState & {
    response?: LanguageState;
    result?: string;
  };
  const response = snap.response ?? snap;
  return {
    oralId: response.oralId,
    followupId: response.followupId,
    text: [
      `Ответ по содержанию: ${response.comprehension === "later" ? "Зал освободится позже" : response.comprehension === "cancelled" ? "Встреча отменена" : response.comprehension === "paid" ? "Участие стало платным" : "Не выбран"}`,
      response.writtenNote ? `Условия выполнения: ${response.writtenNote}` : "",
      snap.result ? `Вывод сотрудника: ${snap.result}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
