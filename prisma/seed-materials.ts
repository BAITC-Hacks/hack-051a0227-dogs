import { PrismaClient } from "@prisma/client";
export function makePdf(lines: string[]) {
  const safe = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream =
    "BT /F1 13 Tf 50 750 Td " +
    lines
      .map((s, i) => (i ? "0 -24 Td " : "") + "(" + safe(s) + ") Tj")
      .join("\n") +
    " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}
const notes = [
  [
    "aigerim",
    "Interview journal",
    "I wrote down eight interviews in detail.",
    "Four short conversations were not written down.",
    "We removed the mandatory phone number field.",
  ],
  [
    "timur",
    "Greenhouse measurement log",
    "I assembled the sensor with my physics teacher.",
    "I compared its readings with manual measurements.",
    "Another team member designed the enclosure.",
  ],
  [
    "sofia",
    "Editorial notes",
    "I recorded three interviews with library visitors.",
    "The librarian corrected the opening date.",
    "I updated the date before publishing the stories.",
  ],
  [
    "madina",
    "School travel survey",
    "I surveyed twenty students from my own class.",
    "The sample does not represent the whole district.",
    "My next step is to interview students in other classes.",
  ],
  [
    "nurislam",
    "Exhibition stand notes",
    "I compared two types of plywood joints.",
    "The team used the stand at a school exhibition.",
    "We did not measure the maximum structural load.",
  ],
  [
    "alina",
    "Navigation observations",
    "Four visitors tried to find an exhibition stand.",
    "I observed where they hesitated.",
    "I changed two section names after their feedback.",
  ],
];
export async function supplementSeed(db: PrismaClient) {
  for (const [alias, ...lines] of notes) {
    const user = await db.user.findUnique({
      where: { email: alias + "@candidate.local" },
      include: {
        application: { include: { episodes: true, materials: true } },
      },
    });
    const app = user?.application;
    if (
      !user ||
      !app ||
      user.origin !== "SEED" ||
      app.materials.some((m) => m.name === "Рабочий дневник.pdf")
    )
      continue;
    const bytes = makePdf(lines);
    await db.material.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        name: "Рабочий дневник.pdf",
        mime: "application/pdf",
        size: bytes.length,
        kind: "document",
        bytes,
        sources: {
          create: {
            applicationId: app.id,
            episodeId: app.episodes[0]?.id,
            title: "Оригинал рабочего дневника",
            kind: "Документ",
            content: lines.join("\n"),
            provenance: "SEED_CANDIDATE_ACCOUNT",
          },
        },
      },
    });
  }
  const decided = await db.application.findMany({
    where: { origin: "SEED", stage: "DECIDED" },
    include: { interviews: true, decisions: true, user: true },
  });
  for (const app of decided)
    if (!app.interviews.length)
      await db.interview.create({
        data: {
          applicationId: app.id,
          scheduledAt: new Date("2026-09-12T09:00:00+05:00"),
          status: "COMPLETED",
          notes: {
            a1: "Рассмотрен эпизод из заявки.",
            t: "Уточнена личная роль.",
            o: "Сопоставлены слова кандидата с материалами.",
            l: "Обсуждены ограничения описанного результата.",
            a2: "Определён следующий шаг.",
            observation:
              "Сотрудник зафиксировал наблюдения по проведённому разговору.",
            assessment: app.decisions[0]?.reason ?? "Разговор завершён.",
          },
        },
      });
}
