"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { action, upload } from "@/lib/client";
import { materialPurposes, type MaterialPurpose } from "@/lib/intake-contract";
import { Feedback, useTask } from "./ui";
export function ApplicationSupplement({
  applicationId,
  materials,
  consent,
}: {
  applicationId: string;
  materials: { id: string; name: string; purpose: string; version: number }[];
  consent: unknown;
}) {
  const task = useTask(),
    router = useRouter(),
    [purpose, setPurpose] = useState<MaterialPurpose>("GENERAL"),
    [previousId, setPreviousId] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [confirm, setConfirm] = useState(false);
  const permission = consent as {
    granted?: boolean;
    revision?: number;
    sourceIds?: string[];
  } | null;
  return (
    <details className="panel">
      <summary>Дополнить материалы заявки</summary>
      <div className="stack" style={{ marginTop: 18 }}>
        <p>
          Новый файл сохранится отдельно. Отправленная ранее версия и история
          рассмотрения останутся в заявке.
        </p>
        <label className="field">
          Назначение
          <select
            value={purpose}
            onChange={(e) => {
              setPurpose(e.target.value as MaterialPurpose);
              setPreviousId("");
              setConfirm(false);
            }}
          >
            {Object.entries(materialPurposes)
              .filter(([k]) => k !== "VIDEO")
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          Какой материал дополняет
          <select
            value={previousId}
            onChange={(e) => {
              setPreviousId(e.target.value);
              setConfirm(false);
            }}
          >
            <option value="">Новый документ</option>
            {materials
              .filter((m) => m.purpose === purpose)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · версия {m.version}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          Файл · PDF, PNG, JPEG
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setConfirm(false);
            }}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          Передать выбранный файл комиссии как дополнение к заявке
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={task.busy || !file || !confirm}
          onClick={() =>
            task.run(async () => {
              await upload(file!, "document", {
                purpose,
                previousId,
                release: "true",
              });
              setFile(null);
              setConfirm(false);
              router.refresh();
            }, "Материал передан и сохранён отдельной версией.")
          }
        >
          Передать материал
        </button>
        {permission?.granted && (
          <button
            type="button"
            className="button quiet"
            onClick={() =>
              task.run(async () => {
                await action("desk.consent", {
                  applicationId,
                  granted: false,
                  sourceIds: [],
                  revision: permission.revision,
                });
                router.refresh();
              }, "Новая внешняя подготовка остановлена.")
            }
          >
            Остановить внешнюю подготовку моих ответов
          </button>
        )}
        <Feedback task={task} />
      </div>
    </details>
  );
}
