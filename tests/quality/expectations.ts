// Check annotations are intentionally outside the provider input and case assembly.
// These are developer-authored mechanical facts, not expert admissions judgements.
export const expectations = {
  rich: {
    action: "INTERVIEW",
    experienced: true,
    facts: ["12 участников", "48 участников"],
    limits: "Один эпизод; журнал независимо не проверен.",
  },
  generic: {
    action: "CLARIFICATION",
    experienced: false,
    facts: ["прирождённый лидер"],
    limits:
      "Самоописание не даёт основания для уровня; семантическое извлечение не выполняется.",
  },
  unclear: {
    action: "CLARIFICATION",
    experienced: false,
    facts: ["20 участников"],
    limits: "Результат команды не устанавливает личный вклад.",
  },
  duplicate: {
    action: "INTERVIEW",
    experienced: true,
    facts: ["12 участников"],
    limits: "Несколько источников одного эпизода, без роста уровня.",
  },
  conflict: {
    action: "CHECK",
    experienced: false,
    facts: ["30 участников", "18 участников"],
    limits: "Расхождение требует вопроса, не обвинения во лжи.",
  },
  missing: {
    action: "CLARIFICATION",
    experienced: false,
    facts: ["Результат ещё не описан"],
    limits: "Отсутствие сведений не ноль.",
  },
  clarified: {
    action: "INTERVIEW",
    experienced: true,
    facts: ["четырьмя одноклассниками"],
    limits: "Новое уточнение того же проекта, предыдущий анализ исторический.",
  },
  language: {
    action: "LANGUAGE",
    experienced: true,
    facts: ["шестью посетителями"],
    limits: "Язык отдельно; уровня английского нет.",
  },
  sensitive: {
    action: "INTERVIEW",
    experienced: true,
    facts: ["Не хочу раскрывать"],
    limits: "Нет снижения за отказ раскрывать личные обстоятельства.",
  },
  unavailable: {
    action: "CLARIFICATION",
    experienced: false,
    facts: [],
    limits: "Нет извлечённого текста документа; не считается прочитанным.",
  },
  criteria: {
    action: "CLARIFICATION",
    experienced: false,
    facts: ["12 участников"],
    limits: "Несовместимая рубрика; чужой подготовленный ответ не применяется.",
  },
  unknown: {
    action: "CLARIFICATION",
    experienced: false,
    facts: ["два дежурства"],
    limits:
      "Новая история получает факты и запрос проверки, без чужой интерпретации.",
  },
} as const;
export const twinExpectations = {
  style: "MATCH",
  background: "MATCH",
  duplicate: "MATCH",
  role: "DIFFERENT",
  language: "MATCH",
  "lost-fact": "INCOMPARABLE",
  criteria: "INCOMPARABLE",
  divergence: "DIFFERENT",
} as const;
// Human semantic annotations are recorded in WorkflowSession.annotations, never here as invented expert labels.
