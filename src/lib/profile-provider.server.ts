import "server-only";
import {
  profileAnswerSchema,
  type ProfileAnswer,
  type ProfileTopic,
  type ProfileSource,
} from "./profile-contract";
import { type ProfileContext, sourceRef } from "./profile-context.server";
import { developmentRecommendations } from "./development.server";
export interface ProfileProvider {
  readonly id: "local" | "external";
  answer(
    context: ProfileContext,
    request: { topic: ProfileTopic | null; previous?: ProfileAnswer },
  ): Promise<unknown>;
}
export function dependenciesFor(c: ProfileContext, keys: string[]) {
  const refs = new Map<string, { key: string; version: string }>();
  const visit = (key: string) => {
    if (refs.has(key)) return;
    const source = c.sources.find((s) => s.key === key);
    if (!source) throw new Error("PROFILE_SOURCE_NOT_ALLOWED");
    refs.set(key, { key, version: source.version });
    for (const dep of source.dependencies) {
      if (c.sources.find((s) => s.key === dep.key)?.version !== dep.version)
        throw new Error("PROFILE_DEPENDENCY_CHANGED");
      visit(dep.key);
    }
  };
  keys.forEach(visit);
  return [...refs.values()];
}
export function validateProfileAnswer(
  value: unknown,
  c: ProfileContext,
): ProfileAnswer {
  const r = profileAnswerSchema.parse(value);
  for (const claim of r.claims)
    for (const ref of claim.refs) {
      const s = c.sources.find(
        (s) => s.key === ref.key && s.version === ref.version,
      );
      if (!s || !ref.quote || !s.text.includes(ref.quote))
        throw new Error("PROFILE_QUOTE_NOT_SUPPORTED");
    }
  const required = dependenciesFor(
    c,
    r.claims.flatMap((x) => x.refs.map((r) => r.key)),
  );
  for (const d of [...required, ...r.dependencies])
    if (c.sources.find((s) => s.key === d.key)?.version !== d.version)
      throw new Error("PROFILE_CONTEXT_CHANGED");
  for (const a of r.actions) {
    if (
      a.kind === "ATOLA" &&
      !c.questions.some(
        (q) =>
          q.action.key === a.key &&
          q.action.runId === a.runId &&
          q.action.questionId === a.questionId &&
          q.action.sourceId === a.sourceId,
      )
    )
      throw new Error("PROFILE_ACTION_NOT_ALLOWED");
    if (a.kind === "FEEDBACK" && c.feedbackAction?.key !== a.key)
      throw new Error("PROFILE_ACTION_NOT_ALLOWED");
    if (
      a.kind === "LINK" &&
      (!a.href || !a.href.startsWith("/") || a.href.startsWith("//"))
    )
      throw new Error("PROFILE_LINK_NOT_ALLOWED");
  }
  return {
    ...r,
    dependencies: [
      ...new Map(
        [...required, ...r.dependencies].map((d) => [d.key, d]),
      ).values(),
    ],
  };
}
/** Templates operate on typed facts. Arbitrary questions and source text never become instructions. */
export class LocalProfileProvider implements ProfileProvider {
  readonly id = "local" as const;
  async answer(
    c: ProfileContext,
    request: { topic: ProfileTopic | null; previous?: ProfileAnswer },
  ) {
    const topic = request.topic ?? "result";
    const answer: ProfileAnswer = {
      topic,
      text: "",
      claims: [],
      actions: [],
      dependencies: [],
      supported: request.topic !== null,
    };
    if (!request.topic)
      return {
        ...answer,
        text: "Уточни вопрос: выбери работу и одно из действий ниже. Здесь можно разобрать сохранённый результат, изменения, передачу материалов или опубликованную обратную связь. Произвольные выводы о человеке не строятся.",
        dependencies: request.previous?.dependencies ?? [],
      };
    const claim = (s: ProfileSource, text = s.text, origin = s.origin) =>
      answer.claims.push({
        text: `${s.title}. ${origin}. ${text}`,
        refs: [
          sourceRef(s),
          ...s.dependencies.flatMap((d) => {
            const original = c.sources.find(
              (x) => x.key === d.key && x.version === d.version,
            );
            return original ? [sourceRef(original)] : [];
          }),
        ],
      });
    const group = (...groups: ProfileSource["group"][]) =>
      c.sources.filter((s) => groups.includes(s.group));
    const work = c.works[0],
      workSource = work
        ? c.sources.find((s) => s.key === work.sourceKey)
        : undefined;
    const link = (href: string, label: string) =>
      answer.actions.push({ key: href, kind: "LINK", href, label });
    if (topic === "result" || topic === "changes") {
      answer.text =
        "Разбор выбранной сохранённой версии учебной работы. Это не оценка личности.";
      if (work && workSource) {
        if (topic === "changes") {
          const before = c.sources.find((s) => s.key === work.beforeKey);
          answer.claims.push({
            text: work.changes.length
              ? `Изменены: ${work.changes.join("; ")}. Сама переработка не означает улучшение.`
              : "Содержательных изменений относительно доступной исходной версии не обнаружено.",
            refs: [
              sourceRef(workSource),
              ...(before ? [sourceRef(before)] : []),
            ],
          });
          if (before)
            claim(before, `До:\n${before.text.split("\nУсловия:")[0]}`);
        }
        claim(
          workSource,
          `${topic === "changes" ? "После:\n" : ""}${workSource.text.split("\nУсловия:")[0]}\n\n${work.feedback.summary}`,
        );
        link(work.href, "Открыть эту версию работы");
      } else
        answer.text =
          "Выбери сохранённую работу, чтобы разобрать её результат и версии.";
    } else if (topic === "next") {
      answer.text =
        "Личные продолжения опираются на условия работы. Они не меняют рассмотрение заявки.";
      for (const r of developmentRecommendations(c)
        .filter((r) => !work || r.attemptId === work.id)
        .slice(0, 3)) {
        const s = c.sources.find((s) => s.key === r.source.key)!;
        claim(
          s,
          `${r.title}\nОснование: ${r.basis}\n${r.purpose}\nЗавершение: ${r.completion}`,
        );
      }
      if (!answer.claims.length)
        answer.text =
          "Сохрани свою работу или открой опубликованное сообщение, чтобы выбрать связанный личный шаг.";
    } else if (topic === "direction") {
      answer.text =
        "Связь с программой объясняется выполненной деятельностью. Интерес сохраняется только по твоему выбору.";
      if (work && workSource) {
        claim(workSource, `Ты работал над задачей «${work.title}».`);
        const p = c.sources.find((s) => s.key === `program:${work.slug}`);
        if (p) claim(p);
        link(
          `/programs/${work.slug}`,
          "Посмотреть программу и выбрать интерес",
        );
      }
      group("interest").forEach((s) => claim(s));
    } else if (topic === "transferred") {
      answer.text =
        "Показаны только явно переданные версии. Учебные работы не становятся реальными жизненными достижениями.";
      group("transfer").forEach((s) => claim(s));
      if (!answer.claims.length)
        answer.text =
          "Переданных работ в доступном контексте нет. Передача выбранной версии требует отдельного подтверждения кандидата.";
      if (c.audience === "CANDIDATE")
        link("/my#my-projects", "Выбрать версию в моих проектах");
    } else if (topic === "feedback") {
      answer.text =
        "Это опубликованная обратная связь комиссии. Личная подготовка по ней не отправляет ответ сотруднику.";
      group("publication")
        .slice(0, 3)
        .forEach((s) => claim(s));
      if (!answer.claims.length)
        answer.text =
          "Опубликованной обратной связи с доступными основаниями пока нет.";
      link("/my#application-messages", "Открыть переписку по заявке");
    } else if (topic === "application") {
      answer.text = "Сохранённые сведения и опубликованное состояние заявки.";
      group("application", "clarification")
        .slice(0, 8)
        .forEach((s) => claim(s));
      link("/apply/status", "Открыть заявку и исправление факта");
      if (!answer.claims.length) {
        answer.text =
          "Сохранённой заявки нет. Мастерские не обязательны для поступления.";
        answer.actions = [];
        link("/apply", "Перейти к заявке");
      }
    } else if (topic === "grounds") {
      answer.text =
        "Основания доступны в собственных версиях. Точная цитата подтверждает извлечение текста, а не истинность рассказа.";
      const keys = request.previous?.claims.flatMap((x) =>
        x.refs.map((r) => r.key),
      );
      const related = keys?.length
        ? c.sources.filter((s) => keys.includes(s.key))
        : c.audience === "STAFF"
          ? c.sources.filter((s) => s.key.startsWith("evidence:") && s.current)
          : workSource
            ? [workSource]
            : group("publication");
      related.slice(0, 8).forEach((s) => claim(s));
      if (!answer.claims.length)
        answer.text =
          "Выбери конкретный результат или источник, чтобы открыть основания.";
    } else if (topic === "assessment" || topic === "clarification") {
      answer.text =
        topic === "assessment"
          ? "Предложение системы и человеческая интерпретация показаны отдельно. Непубликованный результат остаётся внутренним."
          : "Сравнение сохранённых состояний. Новый ответ не переписывает отправленную заявку или прежнее заключение.";
      const entries = group("scoring", "human");
      if (!entries.some((s) => s.current))
        answer.text +=
          " Актуального анализа по текущим материалам нет; прежние версии приведены как история.";
      entries
        .slice(0, topic === "clarification" ? 6 : 3)
        .forEach((s) =>
          claim(
            s,
            `${s.current ? "Текущие материалы" : "Историческая версия"}.\n${s.text}`,
          ),
        );
      if (topic === "clarification")
        group("clarification")
          .slice(-4)
          .forEach((s) => claim(s));
      if (c.feedbackAction) answer.actions.push(c.feedbackAction);
    } else if (topic === "gaps" || topic === "contradictions") {
      answer.text =
        topic === "gaps"
          ? "Вопросы относятся к материалам и отмеченным пробелам. Добавление в ATOLA требует отдельного действия."
          : "Сведения о согласованности относятся к сохранённой интерпретации, а не доказывают достоверность рассказа.";
      group("review")
        .filter((s) => s.current)
        .slice(0, 4)
        .forEach((s) => claim(s));
      const scoring = group("human", "scoring")
        .filter((s) => s.current)
        .sort(
          (a, b) => Number(b.group === "human") - Number(a.group === "human"),
        )[0];
      if (topic === "contradictions")
        for (const item of c.consistency) {
          const s = c.sources.find((s) => s.key === item.sourceKey)!;
          claim(s, item.text);
        }
      if (topic === "gaps")
        for (const q of c.questions) {
          const s = c.sources.find((s) => s.key === q.sourceKey)!;
          claim(
            s,
            `Пробел: ${q.gap}\nВопрос: ${q.text}`,
            "Предложено уточнение по этому материалу",
          );
          if (scoring)
            answer.claims[answer.claims.length - 1].refs.push(
              sourceRef(scoring),
            );
          answer.actions.push(q.action);
        }
      if (!answer.claims.length)
        answer.text =
          "Нет актуальной интерпретации по этим материалам. Открой карту проверки или обнови анализ в карточке.";
    } else if (topic === "interview") {
      answer.text =
        "План и состоявшаяся встреча — разные записи. Подготовительные вопросы не являются наблюдениями.";
      group("plan", "interview").forEach((s) => {
        claim(s);
        if (s.href) link(s.href, "Открыть ATOLA");
      });
      if (!answer.claims.length)
        answer.text =
          "Сохранённого плана или результата встречи нет. Назначение интервью остаётся отдельным действием комиссии.";
    }
    answer.claims = answer.claims.slice(0, 30);
    answer.actions = answer.actions.slice(0, 20);
    return validateProfileAnswer(answer, c);
  }
}
export function configuredProfileProvider(): ProfileProvider {
  const mode = process.env.PROFILE_PROVIDER ?? "local";
  if (mode !== "local") throw new Error("PROFILE_PROVIDER_UNAVAILABLE");
  return new LocalProfileProvider();
}
