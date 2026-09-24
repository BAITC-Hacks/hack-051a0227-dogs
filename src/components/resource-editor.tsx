"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "@/lib/client";
import { treeNodes } from "@/lib/development-tree";
import {
  resourceTypes,
  type ResourceCatalog,
  type LearningResource,
} from "@/lib/learning-resources";
import { Feedback, useTask } from "./ui";
const empty: LearningResource = {
  title: "",
  author: "",
  source: "",
  url: "",
  sourceUrl: "",
  type: "ARTICLE",
  language: "ru",
  topic: "",
  nodes: [],
  checkedAt: "",
  reason: "",
  description: "",
  origin: "EXTERNAL",
  embedding: "LINK_ONLY",
  embedUrl: "",
  available: true,
  published: false,
};
export function ResourceEditor({ initial }: { initial: ResourceCatalog }) {
  const router = useRouter(),
    task = useTask();
  const [id, setId] = useState<string>(),
    [form, setForm] = useState<LearningResource>(empty),
    [verified, setVerified] = useState(false),
    [embedVerified, setEmbedVerified] = useState(false);
  function edit(key: keyof LearningResource, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
    setVerified(false);
    setEmbedVerified(false);
  }
  return (
    <div className="page wrap resource-editor">
      <Link className="text-link" href="/settings">
        Настройки
      </Link>
      <h1>Материалы личного развития</h1>
      <p>
        Публикуй проверенные ссылки и короткое описание. Личные планы и заметки
        кандидатов здесь недоступны.
      </p>
      <div className="resource-editor-grid">
        <nav aria-label="Материалы каталога">
          <button
            className="button secondary"
            onClick={() => {
              setId(undefined);
              setForm(empty);
              setVerified(false);
            }}
          >
            Добавить материал
          </button>
          {initial.records.map((r) => (
            <button
              className={`resource-choice ${id === r.id ? "selected" : ""}`}
              key={r.id}
              onClick={() => {
                setId(r.id);
                setForm(r.versions.at(-1)!);
                setVerified(false);
                setEmbedVerified(false);
              }}
            >
              <strong>{r.versions.at(-1)!.title}</strong>
              <span>
                Версия {r.versions.length} ·{" "}
                {r.versions.at(-1)!.published
                  ? r.versions.at(-1)!.available
                    ? "Опубликован"
                    : "Недоступен"
                  : "Черновик"}
              </span>
            </button>
          ))}
        </nav>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void task.run(async () => {
              await action("resource.save", {
                id,
                revision: initial.revision,
                resource: form,
                verified,
                embedVerified,
              });
              router.refresh();
              setVerified(false);
            }, "Новая версия материала сохранена.");
          }}
        >
          <h2>{id ? "Редактировать ссылку" : "Новый материал"}</h2>
          {(
            [
              ["title", "Название"],
              ["author", "Автор или организация"],
              ["url", "Ссылка на материал"],
              ["source", "Официальный источник"],
              ["sourceUrl", "Ссылка на источник"],
              ["topic", "Тема"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                value={form[key]}
                onChange={(e) => edit(key, e.target.value)}
              />
            </label>
          ))}
          <div className="resource-fields">
            <label>
              Тип
              <select
                value={form.type}
                onChange={(e) => edit("type", e.target.value)}
              >
                {Object.entries(resourceTypes).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Язык
              <select
                value={form.language}
                onChange={(e) => edit("language", e.target.value)}
              >
                <option value="ru">Русский</option>
                <option value="en">Английский</option>
                <option value="kk">Казахский</option>
              </select>
            </label>
          </div>
          <label>
            Происхождение
            <select
              value={form.origin}
              onChange={(e) => edit("origin", e.target.value)}
            >
              <option value="EXTERNAL">Внешний образовательный ресурс</option>
              <option value="INVISION">Официальный материал inVision U</option>
              <option value="PARTNER">
                Подтверждённый преподаватель или партнёр
              </option>
            </select>
          </label>
          <label>
            Проверенное описание
            <textarea
              required
              rows={3}
              maxLength={1000}
              value={form.description}
              onChange={(e) => edit("description", e.target.value)}
            />
          </label>
          <label>
            Основание рекомендации
            <textarea
              required
              rows={3}
              maxLength={700}
              value={form.reason}
              onChange={(e) => edit("reason", e.target.value)}
            />
          </label>
          <fieldset>
            <legend>Связанные узлы</legend>
            <div className="resource-node-choices">
              {treeNodes.map((n) => (
                <label key={n.id}>
                  <input
                    type="checkbox"
                    checked={form.nodes.includes(n.id)}
                    onChange={(e) =>
                      edit(
                        "nodes",
                        e.target.checked
                          ? [...form.nodes, n.id]
                          : form.nodes.filter((x) => x !== n.id),
                      )
                    }
                  />
                  {n.title}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Дата проверки
            <input
              type="date"
              required
              value={form.checkedAt}
              onChange={(e) => edit("checkedAt", e.target.value)}
            />
          </label>
          <details>
            <summary>Встраивание видео</summary>
            <p>
              Не добавляй ID по догадке. Для видео без подтверждённого
              разрешения оставь ссылку на оригинал. Плеер не запускается
              автоматически.
            </p>
            <label>
              Доступность встраивания
              <select
                value={form.embedding}
                onChange={(e) => edit("embedding", e.target.value)}
              >
                <option value="LINK_ONLY">
                  Только оригинал / встраивание не подтверждено
                </option>
                <option value="YOUTUBE">Разрешённый YouTube-плеер</option>
              </select>
            </label>
            {form.embedding === "YOUTUBE" && (
              <>
                <label>
                  Проверенный адрес плеера
                  <input
                    value={form.embedUrl}
                    onChange={(e) => edit("embedUrl", e.target.value)}
                    placeholder="https://www.youtube-nocookie.com/embed/…"
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={embedVerified}
                    onChange={(e) => setEmbedVerified(e.target.checked)}
                  />
                  Встраивание проверено на странице автора и работает
                </label>
              </>
            )}
          </details>
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(e) => edit("available", e.target.checked)}
            />
            Материал доступен
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => edit("published", e.target.checked)}
            />
            Опубликовать для кандидатов
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            Я проверил ссылку, автора, происхождение и соответствие описания;
            материал не раскрывает закрытые ответы оценочных заданий
          </label>
          <Feedback task={task} />
          <button className="button dark" disabled={task.busy}>
            Сохранить новую версию
          </button>
          {id && (
            <details>
              <summary>Предыдущие версии описания</summary>
              {initial.records
                .find((r) => r.id === id)
                ?.versions.map((v) => (
                  <p key={v.version}>
                    Версия {v.version} · {v.title} · проверено {v.checkedAt} ·{" "}
                    {v.published ? "публикация" : "черновик"}
                  </p>
                ))}
            </details>
          )}
        </form>
      </div>
    </div>
  );
}
