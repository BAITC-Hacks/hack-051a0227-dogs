import { z } from "zod";
import { intakeFieldsSchema } from "./intake-contract";
export const fieldsSchema = z
  .object({
    intake: intakeFieldsSchema.optional(),
    name: z.string().max(160),
    email: z.string().max(160),
    city: z.string().max(120),
    citizenship: z.string().max(120),
    experience: z.string().max(8000),
    personalRole: z.string().max(4000),
    motivation: z.string().max(6000),
    videoUrl: z.string().max(1000),
    most: z.string().max(1),
    least: z.string().max(1),
    processing: z.boolean(),
    research: z.boolean(),
    audioConsent: z.boolean(),
    documentNote: z.string().max(2000),
  })
  .refine(
    (v) => !v.most || !v.least || v.most !== v.least,
    "Выберите разные утверждения.",
  );
export const emptyFields = {
  name: "",
  email: "",
  city: "",
  citizenship: "Казахстан",
  experience: "",
  personalRole: "",
  motivation: "",
  videoUrl: "",
  most: "",
  least: "",
  processing: false,
  research: false,
  audioConsent: false,
  documentNote: "",
};
export function applicationRequirements(
  fields: typeof emptyFields,
  materialKinds: string[],
) {
  return [
    {
      title: "Имя, почта и город",
      complete:
        fields.name.trim().length >= 3 &&
        z.email().safeParse(fields.email).success &&
        !!fields.city.trim(),
      issue: "Заполните имя, почту и город.",
    },
    {
      title: "Опыт и личная роль",
      complete:
        fields.experience.trim().length >= 30 &&
        fields.personalRole.trim().length >= 15,
      issue: "Опишите опыт и свою личную роль.",
    },
    {
      title: "Мотивация",
      complete: fields.motivation.trim().length >= 30,
      issue: "Расскажите о мотивации.",
    },
    {
      title: "Два разных утверждения",
      complete:
        ["0", "1", "2", "3"].includes(fields.most) &&
        ["0", "1", "2", "3"].includes(fields.least) &&
        fields.most !== fields.least,
      issue: "Выберите два разных утверждения.",
    },
    {
      title: "Согласие на рассмотрение",
      complete: fields.processing,
      issue: "Подтвердите согласие на обработку заявки.",
    },
    {
      title: "Видеопрезентация",
      complete:
        /^https:\/\//.test(fields.videoUrl) || materialKinds.includes("video"),
      issue: "Добавьте видеопрезентацию: файл или ссылку.",
    },
    {
      title: "Документы или пояснение",
      complete:
        materialKinds.includes("document") || !!fields.documentNote.trim(),
      issue:
        "Добавьте документы или объясните, какие материалы требуют уточнения.",
    },
  ];
}
export function submissionIssues(
  fields: typeof emptyFields,
  materialKinds: string[],
) {
  return applicationRequirements(fields, materialKinds)
    .filter((r) => !r.complete)
    .map((r) => r.issue);
}
export const fileTypes: Record<string, string[]> = {
  document: ["application/pdf", "image/jpeg", "image/png"],
  video: ["video/mp4", "video/webm"],
  oral: ["audio/webm", "audio/ogg", "audio/wav", "audio/mp4"],
  followup: ["audio/webm", "audio/ogg", "audio/wav", "audio/mp4"],
};
export function validSignature(bytes: Buffer, mime: string) {
  if (mime === "application/pdf")
    return bytes.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/png")
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime.endsWith("webm"))
    return bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  if (mime === "audio/ogg") return bytes.subarray(0, 4).toString() === "OggS";
  if (mime === "audio/wav")
    return (
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WAVE"
    );
  if (mime.endsWith("mp4")) return bytes.subarray(4, 8).toString() === "ftyp";
  return false;
}
