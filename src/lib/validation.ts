import { z } from "zod";
export const fieldsSchema = z
  .object({
    name: z.string().max(160),
    email: z.string().max(160),
    city: z.string().max(120),
    citizenship: z.string().max(120),
    experience: z.string().max(8000),
    personalRole: z.string().max(4000),
    motivation: z.string().max(6000),
    videoUrl: z
      .string()
      .max(1000)
      .refine(
        (v) => !v || /^https:\/\//.test(v),
        "Ссылка должна начинаться с https://",
      ),
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
export function submissionIssues(
  fields: typeof emptyFields,
  materialKinds: string[],
) {
  const issues: string[] = [];
  if (
    fields.name.trim().length < 3 ||
    !z.email().safeParse(fields.email).success ||
    !fields.city.trim()
  )
    issues.push("Заполните имя, почту и город.");
  if (
    fields.experience.trim().length < 30 ||
    fields.personalRole.trim().length < 15
  )
    issues.push("Опишите опыт и свою личную роль.");
  if (fields.motivation.trim().length < 30)
    issues.push("Расскажите о мотивации.");
  if (
    !["0", "1", "2", "3"].includes(fields.most) ||
    !["0", "1", "2", "3"].includes(fields.least) ||
    fields.most === fields.least
  )
    issues.push("Выберите два разных утверждения.");
  if (!fields.processing)
    issues.push("Подтвердите согласие на обработку заявки.");
  if (!fields.videoUrl && !materialKinds.includes("video"))
    issues.push("Добавьте видеопрезентацию: файл или ссылку.");
  if (!materialKinds.includes("document") && !fields.documentNote.trim())
    issues.push(
      "Добавьте документы или объясните, какие материалы требуют уточнения.",
    );
  return issues;
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
