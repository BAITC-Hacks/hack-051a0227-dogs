import "dotenv/config";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { emptyFields } from "../src/lib/validation";
import {
  assessmentStories,
  preparedStory,
  type StoryKey,
} from "../src/lib/scoring-scenarios.server";
import { scoringInput, digest } from "../src/lib/scoring-input.server";
import { assertPreparedScope } from "../src/lib/scoring-provider.server";
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Assessment fixtures require a local application origin.");
assertPreparedScope("ASSESSMENT_QA");
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function prepare(
  applicationId: string,
  key: StoryKey,
  clarified = false,
) {
  const input = await scoringInput(db, applicationId);
  const result = preparedStory(input, key, clarified);
  await db.scoringFixture.upsert({
    where: {
      applicationId_inputHash: { applicationId, inputHash: digest(input) },
    },
    create: {
      applicationId,
      inputHash: digest(input),
      scenarioVersion: `${key}-${clarified ? "clarified" : "submitted"}-v1`,
      result: json(result),
    },
    update: {},
  });
}
async function main() {
  try {
    if (process.argv[2] === "--prepare-base") {
      const app = await db.application.findUniqueOrThrow({
        where: { id: process.argv[3] },
      });
      assertPreparedScope(app.origin);
      const key = process.argv[4] as StoryKey;
      if (!assessmentStories[key]) throw new Error("Unknown story");
      await prepare(app.id, key);
      console.log("Prepared exact submitted input:", app.id);
    } else if (process.argv[2] === "--prepare-answer") {
      const applicationId = process.argv[3];
      const app = await db.application.findUniqueOrThrow({
        where: { id: applicationId },
      });
      assertPreparedScope(app.origin);
      await prepare(app.id, "unclear", true);
      console.log("Prepared exact clarification input:", app.id);
    } else {
      for (const key of Object.keys(assessmentStories) as StoryKey[]) {
        const story = assessmentStories[key],
          email = `assessment.${key}.20260917@candidate.local`;
        let user = await db.user.findUnique({ where: { email } });
        if (user) {
          const app = await db.application.findUniqueOrThrow({
            where: { userId: user.id },
          });
          assertPreparedScope(app.origin);
          console.log(key, app.id, "existing; unchanged");
          continue;
        }
        let cookie = "";
        const call = async (type: string, data: Record<string, unknown>) => {
          const r = await fetch(origin + "/api/action", {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              Cookie: cookie,
            },
            body: JSON.stringify({ type, ...data }),
          });
          if (r.headers.get("set-cookie"))
            cookie = r.headers.get("set-cookie")!.split(";")[0];
          const b = await r.json();
          if (!r.ok) throw new Error(JSON.stringify(b));
          return b.data;
        };
        await call("register", {
          name: story.name,
          email,
          password: "AssessmentPath2026!",
        });
        user = await db.user.update({
          where: { email },
          data: { origin: "ASSESSMENT_QA" },
        });
        const app = await call("application.save", {
          revision: 0,
          programSlug: "digital-products",
          fields: {
            ...emptyFields,
            ...story,
            email,
            city: "Алматы",
            processing: true,
            most: "0",
            least: "2",
            documentNote:
              "Документ будет обсуждаться по отдельному запросу комиссии.",
            videoUrl: "https://example.org/assessment-video",
          },
        });
        await db.application.update({
          where: { id: app.id },
          data: { origin: "ASSESSMENT_QA" },
        });
        await call("application.submit", {
          revision: app.revision,
          confirm: true,
        });
        if (key === "conflict" || key === "language")
          await db.languageCheck.create({
            data: {
              applicationId: app.id,
              status: "PENDING_REVIEW",
              result: "Ответ ожидает отдельной проверки сотрудником",
              state: json({
                written:
                  "I compared two service routes and asked five participants to try them.",
                writtenNote:
                  "Кандидат просит уточнить условия языкового задания.",
              }),
            },
          });
        if (key === "language")
          await db.source.create({
            data: {
              applicationId: app.id,
              title: "Письменный языковой ответ",
              kind: "Язык",
              content:
                "I compared two service routes and asked six participants to try them.",
              provenance: "CANDIDATE_ACCOUNT",
            },
          });
        await prepare(app.id, key);
        console.log(key, app.id, email);
      }
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
