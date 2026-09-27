import "dotenv/config";
import { randomBytes } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword, tokenHash } from "../src/lib/security";
import { saveApplicationDraft } from "../src/lib/application-draft.server";
import { emptyFields } from "../src/lib/validation";
import { emptyIntake, routeFor } from "../src/lib/intake-contract";
import { intakeRules } from "../src/lib/intake.server";
import { makePdf } from "../prisma/seed-materials";
const origin = process.env.APP_ORIGIN ?? "";
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (
    process.argv[2] !== "--apply" ||
    process.env.INTAKE_EXAMPLES_DB !== url.pathname.slice(1) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)
  )
    throw new Error(
      "Explicit isolated database, APP_ORIGIN and --apply required",
    );
  const rules = await intakeRules();
  const stories = [
    {
      alias: "leya",
      name: "Лея Соколова",
      entry: "FOUNDATION" as const,
      program: "sociology",
      school: "Школа Северная",
      citizenship: "Кыргызстан",
      value: "4,6",
      max: "5",
      essay:
        "Я помогала вести обмен книгами. Сначала мы считали все обращения результатом. Я сверила их с журналом и заметила повторы. После этого мы стали отдельно отмечать завершённую выдачу и запросы без книги. Хочу научиться строить исследование так, чтобы вывод можно было проверить.",
      role: "Я сверила записи журнала и выделила повторные обращения.",
      result: "В журнале отдельно сохранены 27 завершённых выдач.",
      avatar: "character-01",
    },
    {
      alias: "amir",
      name: "Амир Таласов",
      entry: "BACHELOR" as const,
      program: "creative-engineering",
      school: "Колледж Восточный",
      citizenship: "Кыргызстан",
      value: "87",
      max: "100",
      essay:
        "Я собрал держатель датчика для учебного стенда. На первой проверке крепление смещалось. Я сравнил два материала и записал положение датчика после пяти запусков. Устойчивость улучшилась, но испытаний на улице ещё не было. Хочу научиться выбирать проверку до изготовления детали.",
      role: "Я спроектировал держатель и записал результаты пяти запусков.",
      result: "Крепление не смещалось в пяти испытаниях внутри помещения.",
      avatar: "character-02",
    },
    {
      alias: "dana",
      name: "Дана Озёрная",
      entry: "FOUNDATION" as const,
      program: "digital-media",
      school: "Лицей Парк",
      citizenship: "Казахстан",
      value: "",
      max: "",
      essay:
        "Я готовила заметку о школьной библиотеке. Участница назвала одну дату открытия, а журнал другую. Я спросила библиотекаря, сохранила обе исходные записи и исправила дату перед публикацией. Я хочу научиться проверять сведения и честно показывать, что ещё неизвестно.",
      role: "Я сопоставила интервью и журнал, затем исправила дату.",
      result: "Заметка опубликована после сверки даты с библиотекарем.",
      avatar: "character-03",
    },
  ];
  for (const story of stories) {
    const email = `intake.${story.alias}@candidate.local`;
    if (await db.user.findUnique({ where: { email } })) {
      console.log("Сохранена существующая история:", email);
      continue;
    }
    const user = await db.user.create({
      data: {
        name: story.name,
        email,
        role: "CANDIDATE",
        origin: "INTAKE_EXAMPLES_20260927",
        passwordHash: await hashPassword("IntakePath2026!"),
      },
    });
    const v = structuredClone(emptyIntake),
      r = routeFor(rules, story.entry, story.program);
    v.entryType = story.entry;
    v.intake = rules.intake;
    v.education = {
      institution: story.school,
      system: story.value
        ? "Среднее образование"
        : "Описательная оценка достижений",
      graduationYear: "2026",
      status: "COMPLETED",
      materialId: "",
    };
    v.gpa = {
      ...v.gpa,
      state: story.value ? "PROVIDED" : "NOT_USED",
      value: story.value,
      min: story.value ? "0" : "",
      max: story.max,
      scaleType: story.value ? "Исходная шкала" : "",
      period: "2025–2026",
      originalGrades: story.value
        ? ""
        : "Математика: освоено; исследовательская работа: выполнено с пояснением.",
    };
    v.essay = {
      questionId: r.essay.id,
      questionVersion: r.essay.version,
      language: "ru",
      text: story.essay,
      materialId: "",
    };
    v.universityReason =
      "Хочу учиться через проекты с проверяемыми результатами.";
    v.goals =
      "Научиться планировать проверку и объяснять ограничения результата.";
    v.experienceTitle = "Исследование и проверка рабочего решения";
    v.experiencePeriod = "Март–май 2026";
    v.experienceResult = story.result;
    if (story.entry === "BACHELOR")
      v.english = {
        method: "CERTIFICATE",
        certificate: {
          type: "IELTS",
          value: "6.5",
          scaleMin: "0",
          scaleMax: "9",
          date: "2026-05-12",
          materialId: "",
          period: "2026",
        },
      };
    const fields = {
      ...emptyFields,
      name: story.name,
      email,
      city: story.citizenship === "Казахстан" ? "Алматы" : "Бишкек",
      citizenship: story.citizenship,
      experience: story.essay,
      personalRole: story.role,
      motivation:
        "Выбираю " +
        story.program +
        " для работы с наблюдениями и проверкой решений.",
      videoUrl: "https://example.org/" + story.alias + "-presentation",
      processing: true,
      intake: v,
    };
    let saved = await saveApplicationDraft(user, {
      fields,
      programSlug: story.program,
      revision: 0,
      section: 5,
    });
    await db.application.update({
      where: { id: saved.id },
      data: { origin: "INTAKE_EXAMPLES_20260927" },
    });
    for (const purpose of [
      "EDUCATION",
      "GRADES",
      "ESSAY",
      ...(story.entry === "BACHELOR" ? ["IDENTITY", "LANGUAGE"] : []),
    ]) {
      const lines =
        purpose === "GRADES"
          ? [
              `Academic record: ${story.alias}`,
              story.value
                ? `Original average ${story.value} of ${story.max}, minimum 0.`
                : "No GPA. Mathematics: achieved. Research practice: completed.",
              "Period: 2025-2026. Verification pending.",
            ]
          : purpose === "LANGUAGE"
            ? [
                "Candidate-submitted language result",
                "IELTS: 6.5 of 9. Date: 2026-05-12.",
                "Verification pending.",
              ]
            : purpose === "IDENTITY"
              ? [
                  "Administrative identity record",
                  "Candidate: Amir Talasov. Citizenship: Kyrgyzstan.",
                  "For administrative review only.",
                ]
              : purpose === "ESSAY"
                ? [
                    "Reflection on a project",
                    "I checked the original records before drawing a conclusion.",
                    "The complete original Russian answer is saved in the application.",
                  ]
                : [
                    "Education record",
                    `Institution: ${story.alias} school. Graduation: 2026.`,
                    "Submitted by candidate. Verification pending.",
                  ];
      const bytes = makePdf(lines),
        m = await db.material.create({
          data: {
            userId: user.id,
            applicationId: saved.id,
            name:
              (
                {
                  EDUCATION: "Образование",
                  GRADES: "Исходные оценки",
                  ESSAY: "Пояснение к эссе",
                  IDENTITY: "Административные сведения",
                  LANGUAGE: "Языковой результат",
                } as Record<string, string>
              )[purpose] + ".pdf",
            kind: "document",
            purpose,
            section: purpose === "IDENTITY" ? "administration" : "education",
            mime: "application/pdf",
            bytes,
            size: bytes.length,
          },
        });
      if (purpose === "EDUCATION") v.education.materialId = m.id;
      if (purpose === "GRADES") v.gpa.materialId = m.id;
      if (purpose === "ESSAY") v.essay.materialId = m.id;
      if (purpose === "LANGUAGE") v.english.certificate.materialId = m.id;
    }
    saved = await saveApplicationDraft(user, {
      fields,
      programSlug: story.program,
      revision: saved.revision,
      section: 5,
    });
    const token = randomBytes(32).toString("base64url");
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    try {
      const response = await fetch(origin + "/api/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: "leader_session=" + token,
        },
        body: JSON.stringify({
          type: "application.submit",
          revision: saved.revision,
          rulesVersion: rules.version,
          confirm: true,
        }),
      });
      if (!response.ok)
        throw new Error(
          "Example submission failed: " + (await response.text()),
        );
    } finally {
      await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    }
    console.log(story.name, email, saved.id);
  }
}
main().finally(() => db.$disconnect());
