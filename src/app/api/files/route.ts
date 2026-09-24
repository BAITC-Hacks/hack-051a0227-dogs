import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AppError, checkOrigin, rateLimit } from "@/lib/security";
import { fileTypes, validSignature } from "@/lib/validation";
import type { ApplicationFields } from "@/lib/types";
import { decodeAudio, AudioError } from "@/lib/audio-media.server";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const u = await requireUser();
    await rateLimit("files:" + u.id, 20);
    if (u.role !== "CANDIDATE")
      throw new AppError("Файлы загружает кандидат.", 403);
    if (Number(req.headers.get("content-length")) > 26 * 1024 * 1024)
      throw new AppError("Максимальный размер файла: 25 МБ.", 413);
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind"));
    if (!(file instanceof File) || !fileTypes[kind])
      throw new AppError("Выберите поддерживаемый файл.");
    const mime = file.type.split(";")[0];
    if (
      !fileTypes[kind].includes(mime) ||
      file.size === 0 ||
      file.size > 25 * 1024 * 1024
    )
      throw new AppError("Проверьте тип и размер файла. Максимум: 25 МБ.");
    const app = await db.application.findUnique({ where: { userId: u.id } });
    if (!app) throw new AppError("Сначала сохраните данные заявки.");
    if (app.submittedAt && !["oral", "followup"].includes(kind))
      throw new AppError(
        "Материалы отправленной заявки зафиксированы. Для уточнений используйте сообщения.",
        409,
      );
    if (
      ["oral", "followup"].includes(kind) &&
      !(app.fields as unknown as ApplicationFields).audioConsent
    )
      throw new AppError("Сначала подтвердите согласие на запись голоса.");
    const size = await db.material.aggregate({
      where: { userId: u.id },
      _sum: { size: true },
    });
    if ((size._sum.size ?? 0) + file.size > 150 * 1024 * 1024)
      throw new AppError(
        "Достигнут предел материалов: 150 МБ. Обратитесь к комиссии.",
        413,
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!validSignature(bytes, mime))
      throw new AppError("Содержимое файла не соответствует его типу.");
    let audioMetadata: { durationMs: number; sha256: string } | undefined;
    if (["oral", "followup"].includes(kind)) {
      try {
        const decoded = await decodeAudio(bytes, mime);
        audioMetadata = {
          durationMs: decoded.durationMs,
          sha256: decoded.sha256,
        };
      } catch (e) {
        throw new AppError(
          e instanceof AudioError && e.code === "INVALID_DURATION"
            ? "Запись должна длиться от четверти секунды до 3 минут."
            : "Запись не удалось прочитать. Прослушайте её и загрузите исправный аудиофайл.",
        );
      }
    }
    const material = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${app.id} FOR UPDATE`;
      const current = await tx.application.findUniqueOrThrow({
        where: { id: app.id },
      });
      if (current.submittedAt && !["oral", "followup"].includes(kind))
        throw new AppError("Отправленная версия зафиксирована.", 409);
      if (
        ["oral", "followup"].includes(kind) &&
        !(current.fields as unknown as ApplicationFields).audioConsent
      )
        throw new AppError(
          "Подтвердите согласие на хранение устного ответа.",
          403,
        );
      const latestSize = await tx.material.aggregate({
        where: { userId: u.id },
        _sum: { size: true },
      });
      if ((latestSize._sum.size ?? 0) + file.size > 150 * 1024 * 1024)
        throw new AppError("Достигнут предел материалов: 150 МБ.", 413);
      const m = await tx.material.create({
        data: {
          userId: u.id,
          applicationId: app.id,
          name: file.name.replace(/[^\p{L}\p{N}._ ()-]/gu, "_").slice(0, 180),
          mime,
          kind,
          size: bytes.length,
          bytes,
          ...audioMetadata,
        },
      });
      if (current.submittedAt)
        await tx.source.create({
          data: {
            applicationId: app.id,
            materialId: m.id,
            title: m.name,
            kind: "Оригинал аудио",
            content:
              "Дополнительный устный ответ. Откройте оригинальную запись.",
          },
        });
      return m;
    });
    return NextResponse.json({
      ok: true,
      data: {
        id: material.id,
        name: material.name,
        mime: material.mime,
        size: material.size,
        kind: material.kind,
        createdAt: material.createdAt,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof AppError
            ? e.message
            : "Загрузка прервалась. Повторите попытку.",
      },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
