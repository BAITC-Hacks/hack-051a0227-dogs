// Targeted fictional showcase histories. Never changes an existing WorldSave.
import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { initialWorldState, type WorldState } from "../src/lib/world/model";
const db = new PrismaClient();
const origin = "WORLD_SEED_20260928";
function state(kind: "partial" | "complete" | "first"): WorldState {
  const value = initialWorldState();
  if (kind === "partial") {
    value.x = 30 * 32;
    value.y = 17 * 32;
    value.flags = {
      ...value.flags,
      coordinator: true,
      board: true,
      talks: ["aruzhan", "timur"],
      crate: true,
    };
    value.items = ["materials"];
    value.npc = { aruzhan: 1, timur: 1, saniya: 1 };
    value.openedLocations = ["square", "maker"];
    value.visitedDistricts = ["maker"];
    value.npcStates = { aida: "working", nursultan: "patrolling" };
    value.npcMemoryFlags = { "met:aida": true, "met:nursultan": true };
    value.persistentPropStates = { "maker-kinetic": true };
    value.discoveredSecrets = ["maker-bird"];
  }
  if (kind === "complete") {
    value.x = 24 * 32;
    value.y = 14 * 32;
    value.flags = {
      coordinator: true,
      board: true,
      talks: ["dana", "amir"],
      crate: true,
      display: true,
      choice: "delegate",
      delivered: true,
      completed: true,
      cafeVisited: true,
    };
    value.npc = { saniya: 2, dana: 1, amir: 2 };
    value.openedLocations = ["square", "cafe"];
    value.openedLocations.push("urban", "urban-room", "house");
    value.visitedDistricts = ["urban", "house"];
    value.visitedInteriors = ["cafe", "urban-room"];
    value.npcStates = { zhanerke: "working", daniyar: "patrolling" };
    value.npcMemoryFlags = { "met:zhanerke": true, "deep:zhanerke": true, "met:daniyar": true };
    value.persistentPropStates = { "urban-model": true };
    value.discoveredSecrets = ["urban-ticket"];
  }
  return value;
}
async function main() {
  for (const [email, kind] of [
    ["intake.browser.20260927@candidate.local", "partial"],
    ["ruslan@candidate.local", "complete"],
    ["intake.dana@candidate.local", "first"],
  ] as const) {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, origin: true, role: true },
    });
    if (
      !user ||
      user.role !== "CANDIDATE" ||
      !["SEED", "INTAKE_BROWSER_20260927", "INTAKE_EXAMPLES_20260927"].includes(
        user.origin,
      )
    )
      continue;
    const existing = await db.worldSave.findUnique({
      where: { userId: user.id },
    });
    if (existing) continue;
    await db.$transaction(async (tx) => {
      await tx.worldSave.create({
        data: {
          userId: user.id,
          state: state(kind) as unknown as Prisma.InputJsonValue,
          origin,
        },
      });
      if (kind === "complete") {
        const event = await tx.worldEvent.create({
          data: {
            userId: user.id,
            eventKey: randomUUID(),
            kind: "finish",
            payload: { choice: "delegate", worldVersion: 1 },
            origin,
          },
        });
        await tx.uPointEntry.create({
          data: {
            userId: user.id,
            source: "WORLD",
            nodeId: "world:before-opening",
            rewardVersion: 1,
            amount: 60,
            reason: "Завершено событие «Перед открытием»",
            idempotencyKey: `world:${user.id}:before-opening:v1`,
            worldEventId: event.id,
          },
        });
      }
    });
    console.log(email, kind);
  }
  await db.$disconnect();
}
main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exitCode = 1;
});
