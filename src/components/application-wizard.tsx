"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Check, Paperclip, Save } from "lucide-react";
import type { myData } from "@/lib/data";
import { programs, forcedStatements, programFor } from "@/lib/catalog";
import type { ApplicationFields } from "@/lib/types";
import { emptyFields } from "@/lib/validation";
import { action, upload } from "@/lib/client";
import { Feedback, useTask, Tag } from "./ui";
import {
  emptyIntake,
  preflight,
  routeFor,
  type IntakeRules,
  type MaterialPurpose,
} from "@/lib/intake-contract";
import {
  EducationFields,
  MotivationFields,
  CertificateFields,
  IntakeSummary,
  materialPurposes,
} from "./intake-fields";
import "./intake.css";
const steps = [
  "О себе",
  "Образование и результаты",
  "Программа и опыт",
  "Материалы",
  "Проверки",
  "Обзор и отправка",
];
export function ApplicationWizard({
  data,
  selectedProgram,
  rules,
  initialSection,
  initialField,
}: {
  data: NonNullable<Awaited<ReturnType<typeof myData>>>;
  selectedProgram?: string;
  rules: IntakeRules;
  initialSection?: string;
  initialField?: string;
}) {
  const app = data.application;
  const [fields, setFields] = useState<ApplicationFields>({
    ...emptyFields,
    name: data.user.name,
    email: data.user.email ?? "",
    ...((app?.fields as object) ?? {}),
    intake: {
      ...emptyIntake,
      ...((app?.fields as unknown as ApplicationFields)?.intake ?? {}),
      intake: rules.intake,
    },
  });
  const [programSlug, setProgramSlug] = useState(
    app?.programSlug ??
      (programFor(selectedProgram ?? "")
        ? selectedProgram!
        : "digital-products"),
  );
  const [revision, setRevision] = useState(app?.revision ?? 0);
  const [applicationId, setApplicationId] = useState(app?.id ?? "");
  const [step, setStep] = useState(
    initialSection && /^[0-5]$/.test(initialSection)
      ? Number(initialSection)
      : (app?.formSection ?? 0),
  );
  const [purpose, setPurpose] = useState<MaterialPurpose>("GENERAL");
  const [saveState, setSaveState] = useState("Все изменения сохранены");
  const [saveError, setSaveError] = useState("");
  const revRef = useRef(app?.revision ?? 0),
    pending = useRef(
      Promise.resolve({ id: app?.id ?? "", revision: app?.revision ?? 0 }),
    );
  const lastSaved = useRef("");
  const fieldRef = useRef(app?.formField ?? "");
  const [materials, setMaterials] = useState(app?.materials ?? []);
  const [removing, setRemoving] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attached, setAttached] = useState(
    app?.transfers.map((t) => t.attemptId) ?? [],
  );
  const [attachId, setAttachId] = useState("");
  const task = useTask();
  const router = useRouter();
  const update = <K extends keyof ApplicationFields>(
    k: K,
    v: ApplicationFields[K],
  ) => {
    setFields((s) => ({ ...s, [k]: v }));
    task.setNotice("");
  };
  const intake = fields.intake!;
  const intakeProps = {
    value: intake,
    onChange: (v: typeof intake) => update("intake", v),
    materials,
    rules,
    program: programSlug,
  };
  function save(destination?: number) {
    const snapshot = {
      fields,
      programSlug,
      section: destination ?? step,
      field: fieldRef.current,
    };
    const signature = JSON.stringify(snapshot);
    pending.current = pending.current
      .catch(() => ({ id: applicationId, revision: revRef.current }))
      .then(async (prior) => {
        if (signature === lastSaved.current) return prior;
        setSaveState("Сохраняем…");
        try {
          const res = await action<{ id: string; revision: number }>(
            "application.save",
            { ...snapshot, revision: revRef.current },
          );
          revRef.current = res.revision;
          setRevision(res.revision);
          setApplicationId(res.id);
          lastSaved.current = signature;
          setSaveState("Все изменения сохранены");
          setSaveError("");
          return res;
        } catch (e) {
          setSaveState("Изменения пока не сохранены");
          setSaveError(e instanceof Error ? e.message : "Повтори сохранение.");
          throw e;
        }
      });
    return pending.current;
  }
  useEffect(() => {
    if (saveError) return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 1100);
    return () => clearTimeout(timer);
    // Saving is serialized and reads the latest server revision through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, programSlug, step]);
  useEffect(() => {
    const field = initialField ?? app?.formField;
    if (field) document.getElementById(field)?.focus();
  }, [app?.formField, initialField]);
  const checks = preflight(fields, materials, rules, programSlug),
    issues = checks.filter((i) => i.group === "BLOCK");
  const go = (i: number, field?: string) =>
    task.run(async () => {
      await save(i);
      setStep(i);
      requestAnimationFrame(() =>
        document.getElementById(field ?? "")?.focus(),
      );
    });
  return (
    <div className="page wrap">
      <div className="page-title">
        <div>
          <h1>Давай познакомимся ближе</h1>
          <p>
            Расскажи о своём выборе и опыте. Проектное знакомство проходить
            необязательно.
          </p>
        </div>
        <Tag>{revision ? `Заявка · версия ${revision}` : "Твоя заявка"}</Tag>
      </div>
      <div className="draft-save-state" role="status">
        {saveState}
        {saveError && (
          <>
            <p role="alert">{saveError}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                task.run(async () => {
                  await save();
                })
              }
            >
              Повторить сохранение
            </button>
            <button
              type="button"
              className="button quiet"
              onClick={() => {
                const blob = new Blob(
                  [JSON.stringify({ fields, programSlug }, null, 2)],
                  { type: "application/json" },
                );
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = "моя-заявка.json";
                link.click();
                URL.revokeObjectURL(link.href);
              }}
            >
              Скачать введённый текст
            </button>
          </>
        )}
      </div>
      <nav className="steps" aria-label="Шаги заявки">
        {steps.map((s, i) => (
          <button
            key={s}
            aria-current={step === i ? "step" : undefined}
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await save(i);
                setStep(i);
              })
            }
          >
            <span className="step-number">{i + 1}</span>
            {s}
          </button>
        ))}
      </nav>
      <div className="application-layout">
        <div className="form-section">
          <form
            onFocusCapture={(e) => {
              if (e.target instanceof HTMLElement && e.target.id)
                fieldRef.current = e.target.id;
            }}
            onSubmit={(e) => {
              e.preventDefault();
              task.run(async () => {
                await save(Math.min(5, step + 1));
                if (step < 5) setStep(step + 1);
              }, "Данные сохранены.");
            }}
          >
            {step === 0 && (
              <>
                <h2>Твои данные и программа</h2>
                <p>
                  Подтверди сведения и выбери одно направление. К этому шагу
                  можно вернуться до отправки.
                </p>
                <div className="form-grid two">
                  <label className="field">
                    Тип поступления
                    <select
                      id="entry-type"
                      value={intake.entryType}
                      onChange={(e) => {
                        const entryType = e.target
                          .value as typeof intake.entryType;
                        const r = routeFor(rules, entryType, programSlug);
                        update("intake", {
                          ...intake,
                          entryType,
                          essay: {
                            ...intake.essay,
                            questionId: r.essay.id,
                            questionVersion: r.essay.version,
                          },
                        });
                      }}
                    >
                      <option value="BACHELOR">Бакалавриат</option>
                      <option value="FOUNDATION">Foundation</option>
                    </select>
                  </label>
                  <label className="field">
                    Набор
                    <input id="intake" value={rules.intake} readOnly />
                  </label>
                  <label className="field">
                    Телефон для связи
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={intake.phone}
                      onChange={(e) =>
                        update("intake", { ...intake, phone: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Имя и фамилия
                    <input
                      required
                      minLength={3}
                      maxLength={160}
                      autoComplete="name"
                      id="name"
                      value={fields.name}
                      onChange={(e) => update("name", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Электронная почта
                    <input
                      required
                      type="email"
                      value={fields.email}
                      onChange={(e) => update("email", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Город
                    <input
                      required
                      maxLength={120}
                      value={fields.city}
                      onChange={(e) => update("city", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Гражданство
                    <input
                      required
                      maxLength={120}
                      value={fields.citizenship}
                      onChange={(e) => update("citizenship", e.target.value)}
                    />
                  </label>
                </div>
                <label className="field" style={{ marginTop: 22 }}>
                  Программа
                  <select
                    value={programSlug}
                    onChange={(e) => setProgramSlug(e.target.value)}
                  >
                    {programs.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {step === 1 && <EducationFields {...intakeProps} />}
            {step === 2 && (
              <>
                <h2>Опиши опыт своими словами</h2>
                <p>
                  Выбери один конкретный эпизод из учёбы, работы, кружка или
                  инициативы. Масштаб проекта не важнее твоего действия.
                </p>
                <div className="stack">
                  <label className="field">
                    Что произошло и что вы сделали?
                    <textarea
                      id="experience"
                      maxLength={8000}
                      rows={6}
                      value={fields.experience}
                      onChange={(e) => update("experience", e.target.value)}
                      placeholder="Задача, участники, действия и наблюдаемый результат"
                    />
                  </label>
                  <label className="field">
                    За что отвечал лично ты?
                    <textarea
                      id="personalRole"
                      maxLength={4000}
                      value={fields.personalRole}
                      onChange={(e) => update("personalRole", e.target.value)}
                      placeholder="Что сделал ты и какую часть сделали другие"
                    />
                  </label>
                </div>
                <p className="subtle" style={{ marginTop: 16 }}>
                  Учебную работу из знакомства можно приложить отдельно. Она
                  сохраняет своё обозначение и не заменяет жизненный опыт.
                </p>
              </>
            )}
            {step === 2 && (
              <>
                <h3>Почему это направление?</h3>
                <p>
                  Свяжи выбор с тем, что хочешь изучать и пробовать. Нам
                  интересны твои основания, а не идеальный ответ.
                </p>
                <label className="field">
                  Мотивация
                  <textarea
                    id="motivation"
                    maxLength={6000}
                    rows={9}
                    value={fields.motivation}
                    onChange={(e) => update("motivation", e.target.value)}
                    placeholder="Почему эта программа и какой вопрос тебе хочется исследовать?"
                  />
                </label>
                <MotivationFields {...intakeProps} />
                <Link
                  href={"/programs/" + programSlug}
                  className="text-link"
                  style={{ marginTop: 20 }}
                >
                  Вернуться к описанию программы
                </Link>
              </>
            )}
            {step === 3 && (
              <>
                <h2>Материалы к твоей истории</h2>
                <p>
                  Файлы доступны тебе и уполномоченным сотрудникам после
                  отправки заявки. Максимум 25 МБ на файл.
                </p>
                <div className="stack">
                  <label className="field">
                    Назначение документа
                    <select
                      id="material-purpose"
                      value={purpose}
                      onChange={(e) =>
                        setPurpose(e.target.value as MaterialPurpose)
                      }
                    >
                      {Object.entries(materialPurposes)
                        .filter(([k]) => k !== "VIDEO")
                        .map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                    </select>
                    <small>
                      Удостоверение и сведения о поддержке доступны только для
                      административной проверки и не передаются AI.
                    </small>
                  </label>
                  <label className="upload-zone">
                    Документы · PDF, JPEG, PNG
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      disabled={task.busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file)
                          task.run(async () => {
                            await save();
                            const m = await upload(file, "document", {
                              purpose,
                              requestKey: crypto.randomUUID(),
                            });
                            setMaterials((a) => [...a, m]);
                          }, "Документ загружен.");
                      }}
                    />
                  </label>
                  <label className="field">
                    Если какой-то документ требует уточнения
                    <textarea
                      maxLength={2000}
                      value={fields.documentNote}
                      onChange={(e) => update("documentNote", e.target.value)}
                      placeholder="Укажи, какие документы будут доступны и когда"
                    />
                  </label>
                  <label className="field">
                    Ссылка на видеопрезентацию
                    <input
                      type="url"
                      id="videoUrl"
                      value={fields.videoUrl}
                      onChange={(e) => update("videoUrl", e.target.value)}
                      placeholder="https://"
                    />
                    <small>
                      Проверь, что комиссия сможет открыть ссылку. Можно вместо
                      ссылки загрузить файл.
                    </small>
                  </label>
                  <label className="upload-zone">
                    Видеопрезентация · MP4, WebM
                    <input
                      type="file"
                      accept="video/mp4,video/webm"
                      disabled={task.busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file)
                          task.run(async () => {
                            await save();
                            const m = await upload(file, "video", {
                              purpose: "VIDEO",
                              requestKey: crypto.randomUUID(),
                            });
                            setMaterials((a) => [...a, m]);
                          }, "Видеопрезентация загружена.");
                      }}
                    />
                  </label>
                </div>
                <div className="file-list">
                  {materials.map((m) => (
                    <div
                      className="material-entry"
                      id={"material-" + m.id}
                      tabIndex={-1}
                      key={m.id}
                    >
                      <small>
                        {materialPurposes[m.purpose as MaterialPurpose] ??
                          "Материал"}{" "}
                        · версия {m.version ?? 1} · добавлен тобой{" "}
                        {new Date(m.createdAt).toLocaleDateString("ru")}
                      </small>
                      <a
                        className="file-row"
                        href={"/api/files/" + m.id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Paperclip size={16} />
                        <span>{m.name}</span>
                        <span className="subtle">
                          {m.size < 1024 * 1024
                            ? `${Math.max(1, Math.ceil(m.size / 1024))} КБ`
                            : `${(m.size / 1024 / 1024).toFixed(1)} МБ`}
                        </span>
                      </a>
                      {["document", "video"].includes(m.kind) &&
                        (removing === m.id ? (
                          <div className="material-confirm">
                            <p>
                              Удалить «{m.name}» из черновика? При необходимости
                              файл можно загрузить заново.
                            </p>
                            <div className="row">
                              <button
                                type="button"
                                className="button secondary"
                                disabled={task.busy}
                                onClick={() =>
                                  task.run(async () => {
                                    await action("material.delete", {
                                      id: m.id,
                                    });
                                    setMaterials((items) =>
                                      items.filter((item) => item.id !== m.id),
                                    );
                                    setRemoving("");
                                  }, "Файл удалён из черновика.")
                                }
                              >
                                Подтвердить удаление
                              </button>
                              <button
                                type="button"
                                className="button quiet"
                                disabled={task.busy}
                                onClick={() => setRemoving("")}
                              >
                                Оставить файл
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="button quiet"
                            disabled={task.busy}
                            aria-label={`Удалить ${m.name} из черновика`}
                            onClick={() => setRemoving(m.id)}
                          >
                            Удалить из черновика
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
                <div className="stack" style={{ marginTop: 28 }}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={fields.audioConsent}
                      onChange={(e) => update("audioConsent", e.target.checked)}
                    />
                    Разрешаю запись и хранение моих устных ответов для языковой
                    проверки сотрудником. Записи не используются для анализа
                    личности.
                  </label>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!fields.audioConsent || task.busy}
                    onClick={() =>
                      task.run(async () => {
                        await save();
                        router.push("/apply/english");
                      })
                    }
                  >
                    Перейти к языковой проверке
                  </button>
                </div>
                {data.attempts.length > 0 && (
                  <div className="artifact-summary">
                    <h3>Добавить учебную работу</h3>
                    <p className="subtle">
                      Это отдельное решение. Упражнение не становится жизненным
                      достижением.
                    </p>
                    <label className="field" style={{ marginTop: 16 }}>
                      Версия работы
                      <select
                        value={attachId}
                        onChange={(e) => setAttachId(e.target.value)}
                      >
                        <option value="">Выбери работу для передачи</option>
                        {data.attempts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {programFor(a.slug)?.artifact} · версия {a.revision}
                            {attached.includes(a.id) ? " · приложено" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={
                        !attachId || attached.includes(attachId) || task.busy
                      }
                      style={{ marginTop: 16 }}
                      onClick={() =>
                        task.run(async () => {
                          await save();
                          await action("work.transfer", {
                            attemptId: attachId,
                            revision: data.attempts.find(
                              (a) => a.id === attachId,
                            )?.revision,
                            consent: true,
                          });
                          setAttached((a) => [...a, attachId]);
                        }, "Учебная работа приложена с твоего разрешения.")
                      }
                    >
                      Подтверждаю передачу этой работы
                    </button>
                  </div>
                )}
              </>
            )}
            {step === 4 && (
              <>
                <CertificateFields {...intakeProps} />
                <h2>Как ты подходишь к работе?</h2>
                <p className="subtle">
                  Дополнительный ответ, если он не включён в обязательные
                  условия набора.
                </p>
                <p>
                  Из четырёх утверждений выбери одно, которое больше похоже на
                  тебя, и одно, которое меньше. Один вариант нельзя выбрать
                  дважды.
                </p>
                <table className="forced-table">
                  <thead>
                    <tr>
                      <th scope="col">Утверждение</th>
                      <th scope="col">Больше похоже</th>
                      <th scope="col">Меньше похоже</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forcedStatements.map((s, i) => (
                      <tr key={s}>
                        <td>{s}</td>
                        <td>
                          <input
                            aria-label={"Больше: " + s}
                            type="radio"
                            name="most"
                            value={i}
                            checked={fields.most === String(i)}
                            disabled={fields.least === String(i)}
                            onChange={() => update("most", String(i))}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={"Меньше: " + s}
                            type="radio"
                            name="least"
                            value={i}
                            checked={fields.least === String(i)}
                            disabled={fields.most === String(i)}
                            onChange={() => update("least", String(i))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="subtle" style={{ marginTop: 20 }}>
                  Выбор сохраняется как ответ. Итоговые решения принимает
                  комиссия на основании заявки и источников.
                </p>
              </>
            )}
            {step === 5 && (
              <>
                <h2>Посмотри на заявку целиком</h2>
                <p>
                  После отправки эта версия фиксируется. Дополнительные сведения
                  и исправления можно будет передать в переписке.
                </p>
                <IntakeSummary fields={fields} rules={rules} />
                <dl>
                  {[
                    ["Имя", fields.name],
                    ["Почта", fields.email],
                    ["Город", fields.city],
                    ["Программа", programFor(programSlug)?.title ?? ""],
                    ["Опыт", fields.experience],
                    ["Личная роль", fields.personalRole],
                    ["Мотивация", fields.motivation],
                    [
                      "Видеопрезентация",
                      fields.videoUrl ||
                        materials.find((m) => m.kind === "video")?.name ||
                        "Добавь ссылку или файл",
                    ],
                    [
                      "Документы",
                      materials
                        .filter((m) => m.kind === "document")
                        .map((m) => m.name)
                        .join(", ") ||
                        fields.documentNote ||
                        "Не приложены",
                    ],
                    [
                      "Выбор",
                      `Больше: ${fields.most ? forcedStatements[Number(fields.most)] : "не выбрано"}. Меньше: ${fields.least ? forcedStatements[Number(fields.least)] : "не выбрано"}.`,
                    ],
                    [
                      "Учебные работы",
                      attached.length
                        ? `${attached.length} · переданы с отдельным разрешением`
                        : "Не приложены",
                    ],
                  ].map(([label, value]) => (
                    <div className="review-item" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="stack" style={{ marginTop: 26 }}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      id="processing"
                      checked={fields.processing}
                      onChange={(e) => update("processing", e.target.checked)}
                    />
                    Разрешаю обрабатывать данные и материалы этой заявки для
                    рассмотрения приёмной комиссией. Доступ предоставляется
                    уполномоченным сотрудникам.
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={intake.aiConsent}
                      onChange={(e) =>
                        update("intake", {
                          ...intake,
                          aiConsent: e.target.checked,
                        })
                      }
                    />
                    Разрешаю OpenAI подготовить фактическую сводку из
                    отправленного опыта, мотивации, эссе и последующих уточнений
                    для комиссии. Удостоверение, контакты и сведения о поддержке
                    не передаются. Это необязательно; разрешение можно отозвать
                    после отправки.
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={fields.research}
                      onChange={(e) => update("research", e.target.checked)}
                    />
                    Добровольно согласен участвовать в исследовании
                    образовательного опыта. Отказ не влияет на поступление.
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Я просмотрел заявку и подтверждаю отправку этой версии.
                  </label>
                </div>
                <div className="preflight" aria-live="polite">
                  {(
                    [
                      ["BLOCK", "Обязательно исправить"],
                      ["SUGGEST", "Можно уточнить"],
                      ["PENDING", "Ожидает проверки"],
                    ] as const
                  ).map(([group, title]) => (
                    <section key={group}>
                      <h3>{title}</h3>
                      {checks.filter((i) => i.group === group).length ? (
                        checks
                          .filter((i) => i.group === group)
                          .map((i) => (
                            <button
                              type="button"
                              key={i.key}
                              onClick={() => go(i.section, i.field)}
                              className="preflight-item"
                            >
                              {i.text}
                            </button>
                          ))
                      ) : (
                        <p className="subtle">Замечаний нет</p>
                      )}
                    </section>
                  ))}
                </div>
                <button
                  type="button"
                  className="button primary large"
                  disabled={!confirmed || issues.length > 0 || task.busy}
                  style={{ marginTop: 24 }}
                  onClick={() =>
                    task.run(async () => {
                      const saved = await save();
                      await action("application.submit", {
                        confirm: true,
                        revision: saved.revision,
                        rulesVersion: rules.version,
                      });
                      router.push("/apply/status");
                      router.refresh();
                    })
                  }
                >
                  Отправить заявку
                </button>
              </>
            )}
            <div className="form-bottom">
              {step > 0 ? (
                <button
                  type="button"
                  className="button quiet"
                  disabled={task.busy}
                  onClick={() =>
                    task.run(async () => {
                      await save();
                      setStep(step - 1);
                    })
                  }
                >
                  <ArrowLeft size={16} />
                  Назад
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="button secondary"
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
                    await save();
                  }, "Прогресс сохранён.")
                }
              >
                <Save size={16} />
                Сохранить
              </button>
              {step < 5 && (
                <button
                  className="button dark"
                  type="submit"
                  disabled={task.busy}
                >
                  Дальше
                </button>
              )}
            </div>
          </form>
          <Feedback task={task} />
        </div>
        <aside className="application-aside">
          <h3>Условия твоего набора</h3>
          <p>
            {intake.entryType === "FOUNDATION" ? "Foundation" : "Бакалавриат"} ·{" "}
            {rules.intake}
          </p>
          <p className="subtle">
            Сведения проверены {rules.checkedAt}. Это условия указанного набора;
            будущие сроки и условия уточняются у комиссии.
          </p>
          <p>
            GPA и письменное эссе{" "}
            {routeFor(rules, intake.entryType, programSlug).gpaRequired ||
            routeFor(rules, intake.entryType, programSlug).essay.required
              ? "зависят от правил набора"
              : "можно добавить по желанию"}
            .
          </p>
          <h3>Три отдельных взгляда</h3>
          <p>
            <strong>Готовность</strong>
            <br />
            Документы и язык рассматриваются по требованиям программы.
          </p>
          <p>
            <strong>Выбор и мотивация</strong>
            <br />
            Что ты хочешь изучать и почему.
          </p>
          <p>
            <strong>Опыт</strong>
            <br />
            Конкретные действия, личная роль и источники.
          </p>
          <hr className="divider" />
          <p>
            Решение принимает человек. Проектное знакомство и языковой ответ не
            превращаются в скрытый общий балл.
          </p>
          <Link
            href={routeFor(rules, intake.entryType, programSlug).source}
            target="_blank"
            className="text-link"
          >
            Требования университета
          </Link>
          {applicationId && (
            <p className="inline subtle" style={{ marginTop: 22 }}>
              <Check size={16} />
              Заявка сохраняется на сервере
            </p>
          )}
          <p className="inline subtle">
            <FileText size={16} />
            Можно вернуться в любой момент
          </p>
        </aside>
      </div>
    </div>
  );
}
