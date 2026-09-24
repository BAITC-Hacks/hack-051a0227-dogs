"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import type { AvatarIdentity } from "@/lib/avatar";
import { UserAvatar } from "./user-avatar";
import { Feedback, useTask } from "./ui";
export function AvatarEditor({
  user,
  compact = false,
}: {
  user: AvatarIdentity & { name: string };
  compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    router = useRouter(),
    task = useTask(),
    uid = useId();
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState("");
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 }),
    [ready, setReady] = useState(false);
  const [crop, setCrop] = useState({ x: 0.5, y: 0.5, zoom: 1 });
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const close = () => {
    dialog.current?.close();
    setFile(null);
    setUrl("");
    setReady(false);
    trigger.current?.focus();
  };
  const frame = 208,
    scale = (frame * crop.zoom) / Math.min(dimensions.width, dimensions.height);
  async function save(remove = false) {
    const body = new FormData();
    if (file) body.set("photo", file);
    body.set("crop", JSON.stringify(crop));
    body.set("revision", String(user.avatarRevision ?? 0));
    const res = await fetch("/api/avatar", {
      method: remove ? "DELETE" : "POST",
      headers: remove ? { "Content-Type": "application/json" } : undefined,
      body: remove
        ? JSON.stringify({ revision: user.avatarRevision ?? 0 })
        : body,
    });
    const result = await res.json();
    if (!res.ok)
      throw new Error(
        result.error ?? "Не удалось сохранить фото. Повтори попытку.",
      );
    close();
    router.refresh();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`avatar-edit-trigger ${compact ? "compact" : ""}`}
        aria-label="Изменить фото профиля"
        onClick={() => dialog.current?.showModal()}
      >
        <UserAvatar user={user} size={compact ? 34 : 72} />
        <Camera size={compact ? 12 : 17} />
      </button>
      <dialog
        ref={dialog}
        className="avatar-dialog"
        aria-labelledby={`${uid}-title`}
        onCancel={close}
      >
        <div className="avatar-dialog-heading">
          <h2 id={`${uid}-title`}>Фото профиля</h2>
          <button
            className="icon-button"
            aria-label="Закрыть фото профиля"
            onClick={close}
          >
            <X size={22} />
          </button>
        </div>
        <p>
          Необязательно. Фото помогает узнавать тебя в кабинете и сообщениях.
          Оно не участвует в оценивании.
        </p>
        {!file && (
          <div className="avatar-current">
            <UserAvatar user={user} size={112} />
          </div>
        )}
        <label className="field">
          {user.avatarPhoto ? "Заменить фотографию" : "Выбрать фотографию"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              task.run(async () => {
                if (
                  !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
                  f.size > 5 * 1024 * 1024
                )
                  throw new Error("Выбери JPEG, PNG или WebP до 5 МБ.");
                setReady(false);
                setCrop({ x: 0.5, y: 0.5, zoom: 1 });
                setFile(f);
                setUrl(URL.createObjectURL(f));
              });
            }}
          />
          <span className="subtle">
            JPEG, PNG или WebP, до 5 МБ. Можно обойтись без фото.
          </span>
        </label>
        {file && url && (
          <div className="avatar-crop-controls">
            <div
              className="avatar-crop"
              style={{ width: frame, height: frame }}
              aria-label="Предпросмотр кадрирования"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Выбранное фото"
                onLoad={(e) => {
                  setDimensions({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight,
                  });
                  setReady(true);
                }}
                onError={() => {
                  setReady(false);
                  task.run(async () => {
                    throw new Error("Фото не открывается. Выбери другой файл.");
                  });
                }}
                style={{
                  width: dimensions.width * scale,
                  height: dimensions.height * scale,
                  left: -(dimensions.width * scale - frame) * crop.x,
                  top: -(dimensions.height * scale - frame) * crop.y,
                }}
              />
            </div>
            <p className="subtle">
              В карточках будет видна круглая часть кадра. Ползунками можно
              управлять стрелками клавиатуры.
            </p>
            {(
              [
                ["zoom", "Масштаб", 1, 4],
                ["x", "По горизонтали", 0, 1],
                ["y", "По вертикали", 0, 1],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key} className="field">
                {label}
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.01}
                  value={crop[key]}
                  onChange={(e) =>
                    setCrop({ ...crop, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
        )}
        <Feedback task={task} />
        <div className="button-row">
          <button
            className="button dark"
            disabled={!file || !ready || task.busy}
            onClick={() => task.run(() => save())}
          >
            {task.busy ? "Сохраняем…" : "Сохранить фото"}
          </button>
          {user.avatarPhoto && (
            <button
              className="button secondary"
              disabled={task.busy}
              onClick={() => task.run(() => save(true))}
            >
              Удалить фото
            </button>
          )}
          <button className="button quiet" disabled={task.busy} onClick={close}>
            Отмена
          </button>
        </div>
      </dialog>
    </>
  );
}
