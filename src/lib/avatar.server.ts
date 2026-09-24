import "server-only";
import sharp from "sharp";
import { z } from "zod";
import type { User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./security";
export const avatarLimit = 5 * 1024 * 1024;
export const cropSchema = z.object({
  zoom: z.number().finite().min(1).max(4),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});
export async function prepareAvatar(
  bytes: Buffer,
  mime: string,
  crop: z.infer<typeof cropSchema>,
) {
  crop = cropSchema.parse(crop);
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!formats[mime])
    throw new AppError("Выбери фотографию JPEG, PNG или WebP.", 415);
  if (!bytes.length || bytes.length > avatarLimit)
    throw new AppError("Фото должно быть не больше 5 МБ.", 413);
  try {
    const image = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
    });
    const meta = await image.metadata();
    if (meta.format !== formats[mime] || (meta.pages ?? 1) !== 1)
      throw new Error("format");
    // Decode and orient before cropping. No EXIF/ICC/XMP or original bytes are retained.
    const { data, info } = await image
      .rotate()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (
      Math.min(info.width, info.height) < 64 ||
      Math.max(info.width, info.height) > 8000
    )
      throw new Error("dimensions");
    const edge = Math.floor(Math.min(info.width, info.height) / crop.zoom);
    const source = sharp(data, { raw: info }).extract({
      left: Math.round((info.width - edge) * crop.x),
      top: Math.round((info.height - edge) * crop.y),
      width: edge,
      height: edge,
    });
    const [small, display] = await Promise.all(
      [96, 384].map((size) =>
        source.clone().resize(size, size).webp({ quality: 84 }).toBuffer(),
      ),
    );
    return { small, display };
  } catch {
    throw new AppError(
      "Не удалось прочитать фото. Выбери неповреждённое изображение от 64 px, не больше 16 мегапикселей.",
      422,
    );
  }
}
export async function saveAvatar(
  u: User,
  revision: number,
  image: Awaited<ReturnType<typeof prepareAvatar>> | null,
) {
  if (!["CANDIDATE", "STAFF"].includes(u.role))
    throw new AppError("Войди в аккаунт, чтобы сохранить фото.", 401);
  return db.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id: u.id, avatarRevision: revision },
      data: { avatarRevision: { increment: 1 }, avatarPhoto: !!image },
    });
    if (!changed.count)
      throw new AppError(
        "Фото изменилось в другой вкладке. Обнови страницу перед заменой.",
        409,
      );
    if (image)
      await tx.userAvatar.upsert({
        where: { userId: u.id },
        create: { userId: u.id, ...image },
        update: image,
      });
    else await tx.userAvatar.deleteMany({ where: { userId: u.id } });
    return { revision: revision + 1, hasPhoto: !!image };
  });
}
export async function readAvatar(
  u: User,
  ownerId: string,
  revision: number,
  large: boolean,
) {
  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: {
      role: true,
      avatarPhoto: true,
      avatarRevision: true,
      application: { select: { submittedAt: true } },
    },
  });
  let permitted = ownerId === u.id;
  if (!permitted && u.role === "STAFF" && owner?.application?.submittedAt)
    permitted = true;
  if (!permitted && owner?.role === "STAFF" && u.role === "CANDIDATE")
    permitted = !!(await db.message.findFirst({
      where: { authorId: ownerId, application: { userId: u.id } },
      select: { id: true },
    }));
  if (!permitted || !owner?.avatarPhoto || owner.avatarRevision !== revision)
    throw new AppError("Фото недоступно.", 404);
  const image = await db.userAvatar.findUnique({
    where: { userId: ownerId },
    select: { display: true, small: true },
  });
  if (!image) throw new AppError("Фото недоступно.", 404);
  return large ? image.display! : image.small!;
}
