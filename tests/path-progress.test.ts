import { test } from "node:test";
import assert from "node:assert/strict";
import { pathProgress } from "../src/lib/path-progress";
import { initialMission } from "../src/lib/missions";
import { treeVersion } from "../src/lib/development-tree";
import { initialState } from "../src/lib/projects";
import type { Work } from "../src/lib/journey";
function work(id: string, complete = true): Work {
  return {
    id,
    userId: "owner",
    slug: "digital-products",
    context: "WORKSHOP",
    startKey: null,
    parentVersionId: null,
    hintsUsed: [],
    configVersion: 1,
    revision: 1,
    state: {},
    interest: "UNDECIDED",
    conditions: "",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    versions: [
      {
        id: `${id}-v1`,
        attemptId: id,
        revision: 1,
        state: JSON.parse(
          JSON.stringify({
            ...initialState,
            screens: ["event", "profile", "confirm"],
            requiredPhone: !complete,
          }),
        ),
        feedback: {},
        completed: complete,
        ruleVersion: 2,
        hintsUsed: [],
        saveKey: null,
        basedOnRevision: 0,
        createdAt: new Date(0),
      },
    ],
  };
}
test("Личный прогресс: повторения, черновик, выбранная версия и исчезнувшее основание", () => {
  const a = work("a"),
    b = work("b"),
    draft = work("draft", false);
  assert.equal(pathProgress([draft], []).total, 0);
  assert.equal(pathProgress([a, b], []).total, 10);
  const step = {
    recommendation: {
      kind: "EXPLAIN",
      attemptId: a.id,
      versionId: a.versions[0].id,
    },
    selfCompletedAt: new Date(),
    note: "Проверяю доступность до контакта, чтобы человек не вводил лишние данные.",
  };
  assert.equal(pathProgress([a], [step, step]).total, 15);
  assert.equal(pathProgress([a], [{ ...step, note: "" }]).total, 10);
  assert.equal(
    pathProgress([a], [{ ...step, selfCompletedAt: null }]).total,
    10,
  );
  assert.equal(pathProgress([], [step]).total, 0);
  assert.equal(pathProgress([b], [step]).total, 10);
  const moved = { ...a, userId: "registered-owner" };
  assert.deepEqual(pathProgress([moved], [step]), pathProgress([a], [step]));
  const extraVersion = {
    ...a,
    versions: [a.versions[0], { ...a.versions[0], id: "v2", revision: 2 }],
  };
  assert.equal(pathProgress([extraVersion], [step]).total, 15);
  assert.ok(
    pathProgress([a], [step]).awards.every(
      (a) =>
        a.href.includes("version=1") && a.ruleVersion === "personal-path-v2",
    ),
  );
});

test("Практика навыка: результат начисляет пять один раз, чужая и удалённая работа не начисляют", () => {
  const a = work("practice", false);
  const mission = initialMission("digital-products");
  mission.plan.verification =
    "Проверю путь от поиска книги до подтверждения передачи.";
  mission.tests = [
    {
      phase: "INITIAL",
      plan: structuredClone(mission.plan),
      checks: [],
    },
  ];
  a.versions[0].state = { ...initialState, mission };
  a.configVersion = 3;
  const step = {
    recommendation: {},
    selfCompletedAt: null,
    note: "",
    treeNode: "test",
    treeConfig: treeVersion,
    treeState: {
      resourceId: "stvp-lean",
      resourceVersion: 1,
      attemptId: a.id,
      events: [],
    },
  };
  assert.equal(pathProgress([a], [step, step]).total, 5);
  const emptyRun = structuredClone(a);
  const emptyMission = initialMission("digital-products");
  emptyMission.tests = [
    { phase: "INITIAL", plan: structuredClone(emptyMission.plan), checks: [] },
  ];
  emptyRun.versions[0].state = { ...initialState, mission: emptyMission };
  assert.equal(pathProgress([emptyRun], [step]).total, 0);
  assert.equal(pathProgress([], [step]).total, 0);
  assert.equal(pathProgress([work("other", false)], [step]).total, 0);
  assert.equal(
    pathProgress([a], [{ ...step, treeConfig: "unknown" }]).total,
    0,
  );
  a.versions[0].state = {
    ...initialState,
    mission: initialMission("digital-products"),
  };
  assert.equal(pathProgress([a], [step]).total, 0);
});
