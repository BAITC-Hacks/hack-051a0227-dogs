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
  emptyCredential,
  entSubjectPair,
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
import { IntakeVision } from "./intake-vision";
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
  const [purpose, setPurpose] = useState<MaterialPurpose>("IDENTITY");
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
  const [submitHint, setSubmitHint] = useState("");
  const task = useTask();
  const router = useRouter();
  const linkDocument = (selectedPurpose: MaterialPurpose, id: string) => {
    setFields((current) => {
      const intake = current.intake ?? emptyIntake;
      if (selectedPurpose === "EDUCATION") return { ...current, intake: { ...intake, education: { ...intake.education, materialId: id } } };
      if (selectedPurpose === "GRADES") return { ...current, intake: { ...intake, gpa: { ...intake.gpa, materialId: id } } };
      if (selectedPurpose === "ESSAY") return { ...current, intake: { ...intake, essay: { ...intake.essay, materialId: id } } };
      if (selectedPurpose === "EXAM") {
        const index = intake.exams.findIndex((exam) => exam.type.toUpperCase() === "ЕНТ");
        const exams = index < 0
          ? [...intake.exams, { ...emptyCredential, type: "ЕНТ", scaleMin: "0", scaleMax: "140", period: entSubjectPair[programSlug] ?? "", materialId: id }]
          : intake.exams.map((exam, currentIndex) => currentIndex === index ? { ...exam, materialId: id } : exam);
        return { ...current, intake: { ...intake, exams } };
      }
      if (selectedPurpose === "OTHER_EXAM") {
        const index = intake.exams.findLastIndex((exam) => exam.type.toUpperCase() !== "ЕНТ");
        if (index >= 0) return { ...current, intake: { ...intake, exams: intake.exams.map((exam, currentIndex) => currentIndex === index ? { ...exam, materialId: id } : exam) } };
      }
      return current;
    });
  };
  const unlinkDocument = (id: string) => setFields((current) => {
    if (!current.intake) return current;
    const intake = current.intake;
    const clear = (value: string) => value === id ? "" : value;
    return { ...current, intake: {
      ...intake,
      education: { ...intake.education, materialId: clear(intake.education.materialId) },
      gpa: { ...intake.gpa, materialId: clear(intake.gpa.materialId) },
      essay: { ...intake.essay, materialId: clear(intake.essay.materialId) },
      english: { ...intake.english, certificate: { ...intake.english.certificate, materialId: clear(intake.english.certificate.materialId) } },
      exams: intake.exams.map((exam) => ({ ...exam, materialId: clear(exam.materialId) })),
    } };
  });
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
  const checks = preflight(
      fields,
      materials,
      rules,
      programSlug,
      app?.language?.status,
    ),
    issues = checks.filter((i) => i.group === "BLOCK");
  const go = (i: number, field?: string) =>
    task.run(async () => {
      await save(i);
      setStep(i);
      requestAnimationFrame(() => {
        const target = document.getElementById(field ?? "");
        target?.scrollIntoView({ block: "center", behavior: "auto" });
        target?.focus();
      });
    });
  return (
    <div className="page wrap">
      <div className="page-title">
        <div>
          <h1>Давай познакомимся ближе</h1>
          <p>
            Расскажи о своём образовании, опыте и выборе программы. Черновик
            сохраняется по мере заполнения.
          </p>
        </div>
        <div className="application-title-actions">
          <IntakeVision onNavigate={go} />
          <Tag>{revision ? `Заявка · версия ${revision}` : "Твоя заявка"}</Tag>
        </div>
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
                  инициативы. Масштаб деятельности не важнее твоего действия.
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
                <h2>Документы для поступления</h2>
                <p>
                  Файлы доступны тебе и уполномоченным сотрудникам после
                  отправки заявки. Максимум 25 МБ на файл.
                </p>
                <p className="subtle">
                  Подготовь удостоверение личности или паспорт, аттестат и выписку оценок,
                  сертификат ЕНТ для бакалавриата при гражданстве Казахстана,
                  а также сертификат английского, если выбрал этот способ проверки.
                  При наличии можно приложить результат другого экзамена и сведения о поддержке.
                  Видеопрезентацию добавь ссылкой или файлом ниже.
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
                            linkDocument(purpose, m.id);
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
                                    unlinkDocument(m.id);
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
              </>
            )}
            {step === 4 && (
              <>
                <CertificateFields {...intakeProps} />
                {intake.english.method === "CERTIFICATE" && (
                  <label className="upload-zone intake-certificate-upload">
                    Загрузить языковой сертификат · PDF, JPEG, PNG
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      disabled={task.busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        task.run(async () => {
                          await save(4);
                          const material = await upload(file, "document", {
                            purpose: "LANGUAGE",
                            requestKey: crypto.randomUUID(),
                          });
                          setMaterials((current) => [...current, material]);
                          setFields((current) => ({
                            ...current,
                            intake: {
                              ...current.intake!,
                              english: {
                                ...current.intake!.english,
                                certificate: {
                                  ...current.intake!.english.certificate,
                                  materialId: material.id,
                                },
                              },
                            },
                          }));
                        }, "Сертификат прикреплён к языковому результату.");
                      }}
                    />
                  </label>
                )}
                {intake.english.method === "INTERNAL" && (
                  <div className="language-entry">
                    <p>
                      {app?.language?.status === "PENDING_REVIEW" ||
                      app?.language?.status === "REVIEWED"
                        ? "Ответы на английском сохранены для проверки."
                        : "Для отправки заявки ответь на вопросы и сохрани две записи на английском."}
                    </p>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={fields.audioConsent}
                        onChange={(e) =>
                          update("audioConsent", e.target.checked)
                        }
                      />
                      Разрешаю запись и хранение моих устных ответов для
                      языковой проверки сотрудником.
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!fields.audioConsent || task.busy}
                      onClick={() =>
                        task.run(async () => {
                          await save(4);
                          router.push("/apply/english");
                        })
                      }
                    >
                      {app?.language?.status === "PENDING_REVIEW" ||
                      app?.language?.status === "REVIEWED"
                        ? "Открыть языковые ответы"
                        : "Ответить на английском"}
                    </button>
                  </div>
                )}
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
                <h2>Проверка перед отправкой</h2>
                <p>
                  {issues.length
                    ? `Осталось исправить ${issues.length} ${issues.length === 1 ? "обязательный пункт" : issues.length < 5 ? "обязательных пункта" : "обязательных пунктов"}. Нажми на замечание, чтобы открыть нужное поле.`
                    : "Обязательные поля заполнены. Проверь ответы и подтверди отправку."}
                </p>
                <div className="preflight" aria-live="polite">
                  <section
                    className={
                      issues.length ? "preflight-blockers" : "preflight-ready"
                    }
                  >
                    <h3>
                      {issues.length
                        ? `Обязательно исправить · ${issues.length}`
                        : "Можно отправлять"}
                    </h3>
                    {issues.length ? (
                      issues.map((issue) => (
                        <button
                          type="button"
                          key={issue.key}
                          onClick={() => go(issue.section, issue.field)}
                          className="preflight-item"
                        >
                          <span>{steps[issue.section]}</span>
                          {issue.text}
                        </button>
                      ))
                    ) : (
                      <p>Формальных замечаний нет.</p>
                    )}
                  </section>
                  {checks.some((issue) => issue.group !== "BLOCK") && (
                    <details className="preflight-other">
                      <summary>Советы и материалы на проверке</summary>
                      {(["SUGGEST", "PENDING"] as const).map((group) => {
                        const items = checks.filter(
                          (issue) => issue.group === group,
                        );
                        return items.length ? (
                          <section key={group}>
                            <h3>
                              {group === "SUGGEST"
                                ? "Можно уточнить"
                                : "Ожидает проверки"}
                            </h3>
                            {items.map((issue) => (
                              <button
                                type="button"
                                key={issue.key}
                                onClick={() => go(issue.section, issue.field)}
                                className="preflight-item"
                              >
                                {issue.text}
                              </button>
                            ))}
                          </section>
                        ) : null;
                      })}
                    </details>
                  )}
                </div>
                <details
                  className="application-review-details"
                  key={issues.length ? "incomplete" : "ready"}
                  open={issues.length === 0}
                >
                  <summary>Посмотреть введённые ответы</summary>
                  <p>
                    После отправки эта версия фиксируется. Дополнительные
                    сведения можно будет передать в переписке.
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
                    ].map(([label, value]) => (
                      <div className="review-item" key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
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
                      id="ai-summary-consent"
                      checked={intake.aiConsent}
                      onChange={(e) =>
                        update("intake", {
                          ...intake,
                          aiConsent: e.target.checked,
                        })
                      }
                    />
                    Разрешаю Vision подготовить сводку моих ответов для комиссии
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
                      id="review-confirmed"
                      checked={confirmed}
                      onChange={(e) => {
                        setConfirmed(e.target.checked);
                        setSubmitHint("");
                      }}
                    />
                    Я просмотрел заявку и подтверждаю отправку этой версии.
                  </label>
                </div>
                <button
                  type="button"
                  className="button primary large"
                  disabled={task.busy}
                  style={{ marginTop: 24 }}
                  onClick={() => {
                    if (issues.length) {
                      go(issues[0].section, issues[0].field);
                      return;
                    }
                    if (!confirmed) {
                      setSubmitHint(
                        "Подтверди просмотр заявки перед отправкой.",
                      );
                      document.getElementById("review-confirmed")?.focus();
                      return;
                    }
                    task.run(async () => {
                      const saved = await save();
                      await action("application.submit", {
                        confirm: true,
                        revision: saved.revision,
                        rulesVersion: rules.version,
                      });
                      router.push("/apply/complete");
                      router.refresh();
                    });
                  }}
                >
                  {issues.length
                    ? `Исправить обязательное · ${issues.length}`
                    : "Отправить заявку"}
                </button>
                {submitHint && (
                  <p role="alert" className="application-submit-hint">
                    {submitHint}
                  </p>
                )}
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
              <div className="form-bottom-actions">
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
            </div>
          </form>
          <Feedback task={task} />
        </div>
        <aside className="application-aside">
          <h3>Что нужно заполнить</h3>
          <p>
            {intake.entryType === "FOUNDATION" ? "Foundation" : "Бакалавриат"} ·{" "}
            {rules.intake}
          </p>
          <p className="subtle">
            Правила набора проверены {rules.checkedAt}. GPA, эссе и способ
            проверки английского обязательны для этой заявки; это не отдельные
            пороги университета.
          </p>
          <h3>Перед отправкой</h3>
          <p>
            Укажи образование и GPA в исходной шкале. Если школа не использует
            GPA, добавь исходные оценки или табель.
          </p>
          <p>
            Напиши эссе и выбери подтверждение английского: сертификат с файлом
            или языковые ответы в заявке.
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
