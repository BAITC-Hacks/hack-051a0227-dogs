import "server-only";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/security";
import {
  WORLD_REWARD,
  WORLD_VERSION,
  applyWorldEvent,
  initialWorldState,
  points,
  safePosition,
  spawn,
  type WorldChoice,
  type WorldEventKind,
  type WorldScene,
  type WorldState,
} from "./model";

const sceneSchema = z.enum(["square", "cafe"]);
const kindSchema = z.enum([
  "coordinator",
  "board",
  "aruzhan",
  "timur",
  "dana",
  "amir",
  "crate",
  "display",
  "choose",
  "deliver",
  "finish",
  "visit_cafe",
]);
const inputSchema = z.object({
  type: z.enum(["world.get", "world.move", "world.event"]),
  revision: z.number().int().positive().optional(),
  scene: sceneSchema.optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  kind: kindSchema.optional(),
  choice: z.enum(["repair", "delegate", "relocate"]).optional(),
  eventKey: z.string().uuid().optional(),
});

function parseState(raw: unknown): WorldState {
  const value = raw as WorldState;
  if (
    !value ||
    value.version !== WORLD_VERSION ||
    !value.flags ||
    !Array.isArray(value.items)
  )
    return initialWorldState();
  const scene: WorldScene = value.scene === "cafe" ? "cafe" : "square";
  return { ...value, scene, ...safePosition(scene, value.x, value.y) };
}
const encode = (state: WorldState) => state as unknown as Prisma.InputJsonValue;

export async function worldAction(raw: unknown, user: User) {
  const input = inputSchema.parse(raw);
  if (input.type === "world.get") {
    const save = await db.worldSave.upsert({
      where: { userId: user.id },
      create: { userId: user.id, state: encode(initialWorldState()) },
      update: {},
    });
    const sum = await db.uPointEntry.aggregate({
      where: { userId: user.id },
      _sum: { amount: true },
    });
    return {
      userId: user.id,
      state: parseState(save.state),
      revision: save.revision,
      savedAt: save.updatedAt,
      points: sum._sum.amount ?? 0,
    };
  }
  if (!input.revision)
    throw new AppError("Обнови мир и повтори действие.", 409);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const save = await tx.worldSave.findUnique({
        where: { userId: user.id },
      });
      if (!save) throw new AppError("Сначала открой мир.", 409);
      if (input.type === "world.event" && input.eventKey) {
        const previous = await tx.worldEvent.findUnique({
          where: {
            userId_eventKey: { userId: user.id, eventKey: input.eventKey },
          },
        });
        if (previous)
          return {
            state: parseState(save.state),
            revision: save.revision,
            savedAt: save.updatedAt,
            repeated: true,
          };
      }
      if (save.revision !== input.revision)
        throw new AppError(
          "Мир открыт в другой вкладке. Обнови состояние, чтобы продолжить.",
          409,
        );
      let state = parseState(save.state);
      if (input.type === "world.move") {
        if (input.x === undefined || input.y === undefined || !input.scene)
          throw new AppError("Неизвестная позиция.");
        if (input.scene !== state.scene) {
          const atDoor =
            state.scene === "square"
              ? Math.hypot(state.x - 10 * 32, state.y - 24 * 32) < 130
              : Math.hypot(state.x - 9 * 32, state.y - 9 * 32) < 130;
          if (!atDoor) throw new AppError("До перехода нужно подойти к двери.");
          state = { ...state, scene: input.scene, ...spawn[input.scene] };
        } else {
          const safe = safePosition(input.scene, input.x, input.y);
          if (safe.x !== input.x || safe.y !== input.y)
            throw new AppError("Эта точка недоступна.");
          const seconds = Math.max(
            0,
            (Date.now() - save.updatedAt.getTime()) / 1000,
          );
          if (
            Math.hypot(input.x - state.x, input.y - state.y) >
            Math.max(48, seconds * 185 + 20)
          )
            throw new AppError("Перемещение слишком далеко. Попробуй ещё раз.");
          state = { ...state, x: input.x, y: input.y };
        }
      } else {
        const kind = input.kind as WorldEventKind | undefined;
        if (!kind || !input.eventKey)
          throw new AppError("Неизвестное событие.");
        if (kind === "finish" && state.flags.completed)
          return {
            state,
            revision: save.revision,
            savedAt: save.updatedAt,
            repeated: true,
          };
        const target = points[kind];
        if (
          state.scene !== target.scene ||
          Math.hypot(state.x - target.x, state.y - target.y) > 135
        )
          throw new AppError("Подойди ближе к объекту.");
        if (kind === "visit_cafe" && state.scene !== "cafe")
          throw new AppError("Сначала зайди в кофейню.");
        try {
          state = applyWorldEvent(
            state,
            kind,
            input.choice as WorldChoice | undefined,
          );
        } catch (error) {
          throw new AppError(
            error instanceof Error ? error.message : "Действие недоступно.",
          );
        }
        const event = await tx.worldEvent.create({
          data: {
            userId: user.id,
            eventKey: input.eventKey,
            kind,
            payload: {
              choice: input.choice ?? null,
              worldVersion: WORLD_VERSION,
            },
          },
        });
        if (kind === "finish") {
          await tx.uPointEntry.create({
            data: {
              userId: user.id,
              source: "WORLD",
              nodeId: "world:before-opening",
              rewardVersion: 1,
              amount: WORLD_REWARD,
              reason: "Завершено событие «Перед открытием»",
              idempotencyKey: `world:${user.id}:before-opening:v1`,
              worldEventId: event.id,
            },
          });
        }
      }
      const updated = await tx.worldSave.updateMany({
        where: { userId: user.id, revision: save.revision },
        data: {
          state: encode(state),
          revision: { increment: 1 },
          worldVersion: WORLD_VERSION,
        },
      });
      if (!updated.count)
        throw new AppError("Мир изменился в другой вкладке. Обнови его.", 409);
      return { state, revision: save.revision + 1, savedAt: new Date() };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
