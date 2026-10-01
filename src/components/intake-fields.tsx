"use client";
import {
  additionalExamTypes,
  certificateScaleIssue,
  emptyCredential,
  entSubjectPair,
  materialPurposes,
  routeFor,
  wordCount,
  type IntakeFields,
  type IntakeRules,
} from "@/lib/intake-contract";
import type { ApplicationFields } from "@/lib/types";
type Material = { id: string; name: string; purpose?: string };
type Props = {
  value: IntakeFields;
  onChange: (v: IntakeFields) => void;
  materials: Material[];
  rules: IntakeRules;
  program: string;
};
function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  className,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`field ${className ?? ""}`}>
      {label}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Proof({
  value,
  onChange,
  materials,
  purpose,
  className,
}: {
  value: string;
  onChange: (s: string) => void;
  materials: Material[];
  purpose: string;
  className?: string;
}) {
  return (
    <label className={`field ${className ?? ""}`}>
      {purpose === "EXAM" ? "Сертификат ЕНТ" : purpose === "OTHER_EXAM" ? "Документ с результатом экзамена" : "Подтверждающий файл"}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Пока не приложен</option>
        {materials
          .filter((m) => m.purpose === purpose || m.purpose === "GENERAL")
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>
      <small>
        {purpose === "LANGUAGE"
          ? "Загрузи сертификат ниже или выбери уже добавленный файл."
          : "Добавить файл можно в разделе «Материалы»."}
      </small>
    </label>
  );
}
export function EducationFields({ value: v, onChange: set, materials, rules, program }: Props) {
  const r = routeFor(rules, v.entryType, program);
  const entIndex = v.exams.findIndex((exam) => exam.type.toUpperCase() === "ЕНТ");
  const ent = entIndex < 0 ? { ...emptyCredential, type: "ЕНТ", scaleMin: "0", scaleMax: "140", period: entSubjectPair[program] ?? "" } : v.exams[entIndex];
  const setEnt = (patch: Partial<typeof ent>) => {
    const updated = { ...ent, ...patch };
    set({ ...v, exams: entIndex < 0 ? [...v.exams, updated] : v.exams.map((exam, index) => index === entIndex ? updated : exam) });
  };
  const setOtherExam = (index: number, patch: Partial<IntakeFields["exams"][number]>) =>
    set({ ...v, exams: v.exams.map((exam, current) => current === index ? { ...exam, ...patch } : exam) });
  const entRequired = r.exams.some((exam) => exam.type === "ЕНТ" && exam.required);
  return (
    <div className="stack intake-fields">
      <h2>Образование и результаты</h2>
      <p>
        Сохрани исходные сведения. Разные системы оценок не переводятся в общий
        балл.
      </p>
      <div className="form-grid two">
        <Field
          id="institution"
          label="Учебное заведение"
          value={v.education.institution}
          onChange={(institution) =>
            set({ ...v, education: { ...v.education, institution } })
          }
        />
        <Field
          id="education-system"
          label="Система или программа обучения"
          value={v.education.system}
          onChange={(system) =>
            set({ ...v, education: { ...v.education, system } })
          }
        />
        <Field
          id="graduation-year"
          label="Год окончания"
          value={v.education.graduationYear}
          onChange={(graduationYear) =>
            set({
              ...v,
              education: {
                ...v.education,
                graduationYear: graduationYear.slice(0, 4),
              },
            })
          }
        />
        <label className="field">
          Состояние обучения
          <select
            value={v.education.status}
            onChange={(e) =>
              set({
                ...v,
                education: {
                  ...v.education,
                  status: e.target.value as "ONGOING" | "COMPLETED",
                },
              })
            }
          >
            <option value="ONGOING">Продолжаю учиться</option>
            <option value="COMPLETED">Обучение завершено</option>
          </select>
        </label>
        <Proof
          value={v.education.materialId}
          onChange={(materialId) =>
            set({ ...v, education: { ...v.education, materialId } })
          }
          materials={materials}
          purpose="EDUCATION"
        />
      </div>
      <h3>Средний балл / GPA</h3>
      <label className="field">
        Как указан результат
        <select
          id="gpa-state"
          value={v.gpa.state}
          onChange={(e) =>
            set({
              ...v,
              gpa: {
                ...v.gpa,
                state: e.target.value as IntakeFields["gpa"]["state"],
              },
            })
          }
        >
          <option value="UNSPECIFIED">Выбери вариант</option>
          <option value="PROVIDED">Есть средний балл</option>
          <option value="NOT_USED">В моей системе нет GPA</option>
        </select>
      </label>
      {v.gpa.state === "PROVIDED" && (
        <div className="form-grid two">
          {(
            [
              ["value", "Исходный балл"],
              ["min", "Минимум шкалы"],
              ["max", "Максимум шкалы"],
              ["scaleType", "Тип шкалы, например пятибалльная"],
              ["period", "Период, например 10 класс"],
            ] as const
          ).map(([k, l]) => (
            <Field
              key={k}
              id={"gpa-" + k}
              label={l}
              value={v.gpa[k]}
              onChange={(x) => set({ ...v, gpa: { ...v.gpa, [k]: x } })}
            />
          ))}
          <label className="field">
            Взвешенный результат
            <select
              value={v.gpa.weighted}
              onChange={(e) =>
                set({
                  ...v,
                  gpa: {
                    ...v.gpa,
                    weighted: e.target.value as IntakeFields["gpa"]["weighted"],
                  },
                })
              }
            >
              <option value="NOT_APPLICABLE">
                Не применяется / не указано
              </option>
              <option value="NO">Нет</option>
              <option value="YES">Да</option>
            </select>
          </label>
        </div>
      )}
      {v.gpa.state === "NOT_USED" && (
        <label className="field">
          Исходные оценки
          <textarea
            id="original-grades"
            value={v.gpa.originalGrades}
            maxLength={6000}
            onChange={(e) =>
              set({ ...v, gpa: { ...v.gpa, originalGrades: e.target.value } })
            }
          />
        </label>
      )}
      {v.gpa.state !== "UNSPECIFIED" && (
        <Proof
          value={v.gpa.materialId}
          onChange={(materialId) =>
            set({ ...v, gpa: { ...v.gpa, materialId } })
          }
          materials={materials}
          purpose="GRADES"
        />
      )}
      <h3 id="exams">Вступительные экзамены</h3>
      {v.entryType === "BACHELOR" && (
        <fieldset className="panel intake-exam-card">
          <legend>ЕНТ {entRequired ? "· для граждан Казахстана" : "· если сдавал"}</legend>
          <p className="subtle">Для бакалавриата inVision U указывает минимум 80 из 140 баллов. Профильные предметы для этой программы: {entSubjectPair[program] ?? "уточни у приёмной комиссии"}.</p>
          <div className="form-grid two">
            <Field id="ent-result" label="Результат ЕНТ · из 140" value={ent.value} onChange={(value) => setEnt({ value })} />
            <Field id="ent-date" label="Дата сдачи" type="date" value={ent.date} onChange={(date) => setEnt({ date })} />
            <Proof value={ent.materialId} onChange={(materialId) => setEnt({ materialId })} materials={materials} purpose="EXAM" className="intake-full-row" />
          </div>
          {entIndex >= 0 && <button type="button" className="button quiet" onClick={() => set({ ...v, exams: v.exams.filter((_, index) => index !== entIndex) })}>ЕНТ ещё не сдавал</button>}
        </fieldset>
      )}
      <p className="subtle">Если есть другой экзамен, добавь его отдельно. SAT, ACT и IB Diploma сохраняются в своих шкалах; они не заменяют требование ЕНТ для граждан Казахстана без решения приёмной комиссии.</p>
      {v.exams.map((exam, i) => exam.type.toUpperCase() === "ЕНТ" ? null : (
        <fieldset key={i} className="panel">
          <legend>Другой экзамен</legend>
          <div className="form-grid two">
            <label className="field intake-full-row">Название экзамена
              <select value={exam.type} onChange={(event) => {
                const type = event.target.value as keyof typeof additionalExamTypes;
                const scale = additionalExamTypes[type];
                setOtherExam(i, { type, scaleMin: scale?.min ?? "", scaleMax: scale?.max ?? "", materialId: "" });
              }}>
                <option value="">Выбери экзамен</option>
                {!Object.keys(additionalExamTypes).includes(exam.type) && exam.type && <option value={exam.type}>{exam.type}</option>}
                {Object.entries(additionalExamTypes).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
              </select>
            </label>
            {(
              [
                ["value", "Результат"],
                ["date", "Дата"],
              ] as const
            ).map(([k, l]) => (
              <Field
                key={k}
                id={`exam-${i}-${k}`}
                type={k === "date" ? "date" : "text"}
                label={l}
                value={exam[k]}
                onChange={(x) => setOtherExam(i, { [k]: x })}
              />
            ))}
            <p className="subtle intake-full-row">Шкала: {exam.scaleMin || "—"}–{exam.scaleMax || "—"}. Значение и документ проверит сотрудник.</p>
            <Proof
              value={exam.materialId}
              onChange={(materialId) => setOtherExam(i, { materialId })}
              materials={materials}
              purpose="OTHER_EXAM"
              className="intake-full-row"
            />
          </div>
          <button
            type="button"
            className="button quiet"
            onClick={() =>
              set({ ...v, exams: v.exams.filter((_, j) => j !== i) })
            }
          >
            Убрать экзамен
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={v.exams.length >= 8}
        onClick={() =>
          set({ ...v, exams: [...v.exams, { ...emptyCredential }] })
        }
      >
        Добавить другой экзамен
      </button>
    </div>
  );
}
export function MotivationFields({
  value: v,
  onChange: set,
  materials,
  rules,
  program,
}: Props) {
  const r = routeFor(rules, v.entryType, program);
  return (
    <div className="stack intake-fields">
      <div className="form-grid two">
        <Field
          id="experience-title"
          label="Название деятельности или инициативы"
          value={v.experienceTitle}
          onChange={(experienceTitle) => set({ ...v, experienceTitle })}
        />
        <Field
          id="experience-period"
          label="Период участия"
          value={v.experiencePeriod}
          onChange={(experiencePeriod) => set({ ...v, experiencePeriod })}
        />
      </div>
      {(
        [
          ["universityReason", "Почему inVision U?"],
          ["goals", "Твои цели"],
          ["experienceResult", "Какой результат ты наблюдал?"],
        ] as const
      ).map(([k, l]) => (
        <label key={k} className="field">
          {l}
          <textarea
            value={v[k]}
            maxLength={k === "experienceResult" ? 4000 : 6000}
            onChange={(e) => set({ ...v, [k]: e.target.value })}
          />
        </label>
      ))}
      <section className="panel">
        <h3>Эссе {r.essay.required ? "· обязательно" : "· по желанию"}</h3>
        <p>{r.essay.question}</p>
        <small>
          Вопрос {r.essay.version}. Дополнительный письменный ответ сохраняется
          без редактирования моделью.
        </small>
        <label className="field">
          Язык
          <select
            value={v.essay.language}
            onChange={(e) =>
              set({ ...v, essay: { ...v.essay, language: e.target.value } })
            }
          >
            <option value="ru">Русский</option>
            <option value="kk">Қазақша</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          Твой ответ
          <textarea
            id="essay"
            rows={12}
            maxLength={40000}
            value={v.essay.text}
            onChange={(e) =>
              set({
                ...v,
                essay: {
                  ...v.essay,
                  text: e.target.value,
                  questionId: r.essay.id,
                  questionVersion: r.essay.version,
                },
              })
            }
          />
          <small>
            {wordCount(v.essay.text)} слов
            {r.essay.minWords !== null ? " · минимум " + r.essay.minWords : ""}
            {r.essay.maxWords !== null ? " · максимум " + r.essay.maxWords : ""}
            . Черновик сохраняется автоматически.
          </small>
        </label>
        {r.essay.allowFile && (
          <Proof
            value={v.essay.materialId}
            onChange={(materialId) =>
              set({
                ...v,
                essay: {
                  ...v.essay,
                  materialId,
                  questionId: r.essay.id,
                  questionVersion: r.essay.version,
                },
              })
            }
            materials={materials}
            purpose="ESSAY"
          />
        )}
      </section>
    </div>
  );
}
export function CertificateFields({
  value: v,
  onChange: set,
  materials,
  rules,
  program,
}: Props) {
  const r = routeFor(rules, v.entryType, program),
    c = v.english.certificate,
    scaleIssue =
      v.english.method === "CERTIFICATE" ? certificateScaleIssue(c) : null;
  return (
    <section className="stack intake-fields">
      <h2>Английский</h2>
      <p className="subtle">{r.language.note}</p>
      <label className="field">
        Способ проверки
        <select
          id="certificate"
          value={v.english.method}
          onChange={(e) =>
            set({
              ...v,
              english: {
                ...v.english,
                method: e.target.value as IntakeFields["english"]["method"],
              },
            })
          }
        >
          <option value="UNDECIDED">
            {r.language.required
              ? "Выбери способ проверки"
              : "Уточню способ проверки"}
          </option>
          {r.language.methods.map((m) => (
            <option key={m} value={m}>
              {m === "INTERNAL" ? "Ответы в приложении" : "Языковой сертификат"}
            </option>
          ))}
        </select>
      </label>
      <p className="subtle">
        Нет сертификата? Выбери «Ответы в приложении». После сохранения ответов
        заявку можно отправить; результат проверит сотрудник.
      </p>
      {v.english.method === "CERTIFICATE" && (
        <div className="form-grid two intake-certificate-fields">
          <p className="subtle intake-full-row">
            Укажи результат точно как в документе: число в числовой шкале или
            уровень A1–C2 в шкале CEFR. Приложи файл; сотрудник проверит его
            после отправки.
          </p>
          <label className="field intake-full-row">
            Тип сертификата
            <input
              id="language-type"
              list="language-certificate-types"
              value={c.type}
              onChange={(event) =>
                set({
                  ...v,
                  english: {
                    ...v.english,
                    certificate: { ...c, type: event.target.value },
                  },
                })
              }
            />
            <datalist id="language-certificate-types">
              {r.language.certificates.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <small>
              Выбери из списка или впиши название из своего документа.
            </small>
          </label>
          {(
            [
              ["value", "Результат", "intake-full-row"],
              ["scaleMin", "Минимум шкалы", ""],
              ["scaleMax", "Максимум шкалы", ""],
              ["date", "Дата экзамена", "intake-full-row"],
            ] as const
          ).map(([k, l, className]) => (
            <Field
              key={k}
              id={"language-" + k}
              label={l}
              className={className}
              type={k === "date" ? "date" : "text"}
              value={c[k]}
              onChange={(x) =>
                set({
                  ...v,
                  english: { ...v.english, certificate: { ...c, [k]: x } },
                })
              }
            />
          ))}
          {scaleIssue && (
            <p className="intake-full-row intake-field-error" role="alert">
              {scaleIssue.text}
            </p>
          )}
          <Proof
            value={c.materialId}
            onChange={(materialId) =>
              set({
                ...v,
                english: { ...v.english, certificate: { ...c, materialId } },
              })
            }
            materials={materials}
            purpose="LANGUAGE"
            className="intake-full-row"
          />
        </div>
      )}
    </section>
  );
}
export function IntakeSummary({
  fields,
  rules,
}: {
  fields: ApplicationFields;
  rules?: IntakeRules | null;
}) {
  const v = fields.intake;
  if (!v) return null;
  return (
    <section className="intake-summary">
      <h3>Образование, результаты и эссе</h3>
      <dl>
        {[
          [
            "Тип поступления",
            v.entryType === "FOUNDATION" ? "Foundation" : "Бакалавриат",
          ],
          ["Набор", v.intake],
          [
            "Образование",
            [
              v.education.institution,
              v.education.system,
              v.education.graduationYear,
              v.education.status === "ONGOING" ? "Учится" : "Завершено",
            ]
              .filter(Boolean)
              .join(" · "),
          ],
          [
            "Средний балл",
            v.gpa.state === "PROVIDED"
              ? `${v.gpa.value} в шкале ${v.gpa.min || "не указан"}–${v.gpa.max || "не указан"} · ${v.gpa.scaleType} · ${v.gpa.period} · взвешенный: ${{ YES: "да", NO: "нет", NOT_APPLICABLE: "не указан" }[v.gpa.weighted]}`
              : v.gpa.state === "NOT_USED"
                ? "Система без GPA. " + v.gpa.originalGrades
                : "Не указан",
          ],
          [
            "Экзамены",
            v.exams
              .map(
                (e) =>
                  `${e.type}: ${e.value} (${e.scaleMin}–${e.scaleMax}) · ${e.date}`,
              )
              .join("\n") || "Не указаны",
          ],
          [
            "Сертификат",
            v.english.method === "CERTIFICATE"
              ? `${v.english.certificate.type}: ${v.english.certificate.value} (${v.english.certificate.scaleMin}–${v.english.certificate.scaleMax}) · ${v.english.certificate.date}`
              : "Проверка отдельно",
          ],
          ["Почему университет", v.universityReason],
          ["Цели", v.goals],
          [
            "Деятельность",
            [v.experienceTitle, v.experiencePeriod, v.experienceResult]
              .filter(Boolean)
              .join("\n"),
          ],
          [
            "Эссе · " +
              v.essay.language +
              " · вопрос " +
              v.essay.questionVersion,
            v.essay.text ||
              (v.essay.materialId
                ? "Прикреплён файл, откройте оригинал"
                : "Не добавлено"),
          ],
          ["Правила", rules?.version ?? "Версия сохранена в заявке"],
        ].map(([k, x]) => (
          <div className="review-item" key={k}>
            <dt>{k}</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{x || "Не указано"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export { materialPurposes };
