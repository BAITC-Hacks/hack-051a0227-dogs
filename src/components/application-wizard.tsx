"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  FileText,
  Check,
  Paperclip,
  Save,
  ArrowUpRight,
} from "lucide-react";
import type { myData } from "@/lib/data";
import { programs, forcedStatements, programFor } from "@/lib/catalog";
import type { ApplicationFields } from "@/lib/types";
import { emptyFields, submissionIssues } from "@/lib/validation";
import { action, upload } from "@/lib/client";
import { Feedback, useTask, Tag } from "./ui";
const steps = ["Данные", "Опыт", "Мотивация", "Материалы", "Выбор", "Обзор"];
export function ApplicationWizard({
  data,
  selectedProgram,
}: {
  data: NonNullable<Awaited<ReturnType<typeof myData>>>;
  selectedProgram?: string;
}) {
  const app = data.application;
  const [fields, setFields] = useState<ApplicationFields>(
    app
      ? (app.fields as unknown as ApplicationFields)
      : { ...emptyFields, name: data.user.name, email: data.user.email ?? "" },
  );
  const [programSlug, setProgramSlug] = useState(
    app?.programSlug ??
      (programFor(selectedProgram ?? "")
        ? selectedProgram!
        : "digital-products"),
  );
  const [revision, setRevision] = useState(app?.revision ?? 0);
  const [applicationId, setApplicationId] = useState(app?.id ?? "");
  const [step, setStep] = useState(0);
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
  async function save() {
    const res = await action<{ id: string; revision: number }>(
      "application.save",
      { fields, programSlug, revision },
    );
    setRevision(res.revision);
    setApplicationId(res.id);
    return res;
  }
  const issues = submissionIssues(
    fields,
    materials.map((m) => m.kind),
  );
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
      <nav className="steps" aria-label="Шаги заявки">
        {steps.map((s, i) => (
          <button
            key={s}
            aria-current={step === i ? "step" : undefined}
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await save();
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
            onSubmit={(e) => {
              e.preventDefault();
              task.run(async () => {
                await save();
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
                    Имя и фамилия
                    <input
                      required
                      minLength={3}
                      maxLength={160}
                      autoComplete="name"
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
            {step === 1 && (
              <>
                <h2>Опыт — своими словами</h2>
                <p>
                  Выбери один конкретный эпизод из учёбы, работы, кружка или
                  инициативы. Масштаб проекта не важнее твоего действия.
                </p>
                <div className="stack">
                  <label className="field">
                    Что произошло и что вы сделали?
                    <textarea
                      required
                      minLength={30}
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
                      required
                      minLength={15}
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
                <h2>Почему это направление?</h2>
                <p>
                  Свяжи выбор с тем, что хочешь изучать и пробовать. Нам
                  интересны твои основания, а не идеальный ответ.
                </p>
                <label className="field">
                  Мотивация
                  <textarea
                    required
                    minLength={30}
                    maxLength={6000}
                    rows={9}
                    value={fields.motivation}
                    onChange={(e) => update("motivation", e.target.value)}
                    placeholder="Почему inVision U, почему эта программа и какой вопрос тебе хочется исследовать?"
                  />
                </label>
                <Link
                  href={"/programs/" + programSlug}
                  className="text-link"
                  style={{ marginTop: 20 }}
                >
                  Вернуться к описанию программы <ArrowUpRight size={16} />
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
                            const m = await upload(file, "document");
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
                            const m = await upload(file, "video");
                            setMaterials((a) => [...a, m]);
                          }, "Видеопрезентация загружена.");
                      }}
                    />
                  </label>
                </div>
                <div className="file-list">
                  {materials.map((m) => (
                    <div className="material-entry" key={m.id}>
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
                        <ArrowUpRight size={16} />
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
                    Перейти к языковой проверке <ArrowRight size={17} />
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
                <h2>Как ты подходишь к работе?</h2>
                <p>
                  Из четырёх утверждений выбери одно, которое больше похоже на
                  тебя, и одно — которое меньше. Один вариант нельзя выбрать
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
                        "Добавь документы или пояснение",
                    ],
                    [
                      "Выбор",
                      `Больше: ${forcedStatements[Number(fields.most)] ?? "не выбрано"}. Меньше: ${forcedStatements[Number(fields.least)] ?? "не выбрано"}.`,
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
                {issues.length > 0 && (
                  <div className="notice info" style={{ marginTop: 22 }}>
                    <InfoText items={issues} />
                  </div>
                )}
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
                      });
                      router.push("/apply/status");
                      router.refresh();
                    })
                  }
                >
                  Отправить заявку <ArrowUpRight size={20} />
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
                  Дальше <ArrowRight size={17} />
                </button>
              )}
            </div>
          </form>
          <Feedback task={task} />
        </div>
        <aside className="application-aside">
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
            href="https://www.invisionu.education/ru/undergraduate"
            target="_blank"
            className="text-link"
          >
            Требования университета <ArrowUpRight size={15} />
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
function InfoText({ items }: { items: string[] }) {
  return (
    <div>
      <strong>Перед отправкой</strong>
      <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
