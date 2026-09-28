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
  migrateWorldState,
  points,
  safePosition,
  spawn,
  type WorldChoice,
  type WorldEventKind,
  type WorldScene,
  type WorldState,
} from "./model";
import { districtScenes, interiorScenes, pointById, portalBetween, sceneKeys, zones } from "./scenes";
import { npcById, npcLocation } from "./npcs";
import { emptyRoleProgress, newCondition, resolveCrossMission, resolveDeeper, resolveMission, roleIds, roles, validateIntro, type RoleId, type MissionPayload } from "./missions";

const sceneSchema = z.enum(sceneKeys as [WorldScene, ...WorldScene[]]);
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
  type: z.enum(["world.get", "world.move", "world.event", "world.explore", "world.mission"]),
  revision: z.number().int().positive().optional(),
  scene: sceneSchema.optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  kind: kindSchema.optional(),
  choice: z.enum(["repair", "delegate", "relocate"]).optional(),
  eventKey: z.string().uuid().optional(),
  targetId: z.string().max(80).optional(),
  exploreAction: z.enum(["meet", "deeper", "toggle", "discover"]).optional(),
  roleId: z.enum(roleIds).optional(),
  missionAction: z.enum(["intro", "test", "finish", "deeper", "replay", "preference", "cross"]).optional(),
  payload: z.partialRecord(z.enum(["check", "flow", "question", "zones", "fact", "sensor", "power", "mount", "connections", "problem", "testers", "interviews", "hypothesis", "evidence", "layout", "priority", "volunteers", "sources", "angle", "channel", "story", "headline", "update", "preference", "perspectives", "deeperChoice"]), z.union([z.string().max(40), z.array(z.string().max(40)).max(4)])).optional(),
});

function parseState(raw: unknown): WorldState {
  return migrateWorldState(raw);
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
      if ((input.type === "world.event" || input.type === "world.explore" || input.type === "world.mission") && input.eventKey) {
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
          const portal = portalBetween(state.scene,input.scene);
          const atDoor = portal && Math.hypot(state.x-portal.x,state.y-portal.y)<135;
          if (!atDoor) throw new AppError("До перехода нужно подойти к двери.");
          const previous = state.scene;
          const returnPositions = {...state.returnPositions};
          if(zones[input.scene].interior) returnPositions[previous]={x:state.x,y:state.y};
          let arrival = spawn[input.scene];
          if(returnPositions[input.scene] && !zones[input.scene].interior)
            arrival=returnPositions[input.scene]!;
          else if(input.scene==="square") {
            const gate=portalBetween("square",previous);
            if(gate) arrival= previous==="maker"?{x:gate.x+64,y:gate.y}:previous==="garage"?{x:gate.x-64,y:gate.y}:previous==="people"?{x:gate.x,y:gate.y+64}:previous==="urban"?{x:gate.x,y:gate.y+16}:{x:gate.x+64,y:gate.y-64};
          }
          arrival=safePosition(input.scene,arrival.x,arrival.y);
          state = { ...state, scene: input.scene, ...arrival, safeLocation:{scene:input.scene,...arrival},returnPositions,
            visitedDistricts:districtScenes.includes(input.scene as typeof districtScenes[number]) && !state.visitedDistricts.includes(input.scene) ? [...state.visitedDistricts,input.scene]:state.visitedDistricts,
            visitedInteriors:interiorScenes.includes(input.scene as typeof interiorScenes[number]) && !state.visitedInteriors.includes(input.scene) ? [...state.visitedInteriors,input.scene]:state.visitedInteriors,
            openedLocations:state.openedLocations.includes(input.scene)?state.openedLocations:[...state.openedLocations,input.scene],
          };
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
          state = { ...state, x: input.x, y: input.y, safeLocation:{scene:state.scene,x:input.x,y:input.y} };
        }
      } else if(input.type === "world.mission") {
        if (!input.eventKey || !input.missionAction || !input.payload) throw new AppError("Неизвестное действие миссии.");
        const action = input.missionAction;
        const payload = input.payload as MissionPayload;
        const now = new Date().toISOString();
        let earned = 0;
        let resultText = "";
        if (action === "cross") {
          const pair = payload.perspectives;
          if (state.scene !== "square" || Math.hypot(state.x - 35 * 32, state.y - 25 * 32) > 135) throw new AppError("Подойди к карте площади.");
          if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] || pair.some((id) => !roleIds.includes(id as RoleId))) throw new AppError("Выбери два разных взгляда на задачу.");
          if (!pair.some((id) => state.roles[id as RoleId]?.completedAt)) throw new AppError("Сначала закончи историю одной из выбранных ролей.");
          if (state.crossMission) return { state, revision:save.revision, savedAt:save.updatedAt, repeated:true, earned:0 };
          resultText = resolveCrossMission(pair as [RoleId, RoleId]);
          state.crossMission = { version:1, perspectives:pair as [RoleId, RoleId], result:resultText, completedAt:now };
          state.persistentPropStates["square-map"] = true;
          earned = 100;
        } else {
          const roleId = input.roleId;
          if (!roleId) throw new AppError("Роль не найдена.");
          const role = roles[roleId];
          const lead = npcById[role.lead];
          const leadPlace = npcLocation(lead,state);
          const target = action === "intro" ? leadPlace : action === "deeper" ? pointById(role.deeperScene,role.deeperProp) : pointById(role.scene,role.prop);
          if (action !== "preference" && (state.scene !== (action === "intro" ? leadPlace.scene : action === "deeper" ? role.deeperScene : role.scene) || !target || Math.hypot(state.x-target.x,state.y-target.y)>135)) throw new AppError("Подойди к участнику или объекту миссии.");
          const progress = state.roles[roleId] ?? emptyRoleProgress();
          if (action === "intro") {
            try { resultText = validateIntro(roleId,payload); } catch(e) { throw new AppError(e instanceof Error?e.message:"Знакомство не завершено."); }
            if (!progress.introAt) { progress.introAt=now; progress.stage="test"; earned=role.introReward; }
          } else if (action === "test") {
            if (!progress.introAt || progress.stage !== "test") throw new AppError("Сначала познакомься с задачей этой роли.");
            if (roleId === "engineer" && !state.persistentPropStates["maker-rack"]) throw new AppError("Сначала возьми комплект компонентов у стойки Maker Yard.");
            try { progress.first=resolveMission(roleId,payload,"test"); } catch(e) { throw new AppError(e instanceof Error?e.message:"Испытание не завершено."); }
            progress.stage="revision";
            resultText=`${progress.first.observation} ${newCondition[roleId]}`;
          } else if (action === "finish") {
            if (progress.stage !== "revision" || !progress.first) throw new AppError("Сначала проверь первую версию.");
            try { progress.final=resolveMission(roleId,payload,"revision",progress.first); } catch(e) { throw new AppError(e instanceof Error?e.message:"Решение не завершено."); }
            progress.stage="complete";
            resultText=progress.final.consequence;
            if (!progress.completedAt) { progress.completedAt=now; earned=role.mainReward; }
            else progress.replayCount += 1;
            progress.history.push({first:progress.first,final:progress.final,at:now});
            state.persistentPropStates[role.prop]=true;
          } else if (action === "deeper") {
            if (!progress.completedAt) throw new AppError("Сначала закончи основную историю роли.");
            try { resultText=resolveDeeper(roleId,payload.deeperChoice); } catch(e) { throw new AppError(e instanceof Error?e.message:"Выбери вариант."); }
            if (!progress.deeperAt) progress.deeperAt=now;
            progress.deeperChoice=String(payload.deeperChoice);
            progress.deeperResult=resultText;
          } else if (action === "replay") {
            if (!progress.completedAt) throw new AppError("Сначала закончи основную историю роли.");
            progress.stage="test"; progress.first=undefined; progress.final=undefined;
            resultText="Можно попробовать другое решение. Ранее заработанные U сохраняются без повторного начисления.";
          } else {
            if (!progress.introAt || !["interested","again","not-for-me"].includes(String(payload.preference))) throw new AppError("Сначала попробуй роль.");
            progress.preference=payload.preference as NonNullable<typeof progress.preference>;
            resultText="Твоя отметка сохранена только в личном журнале.";
          }
          state.roles[roleId]=progress;
        }
        const event = await tx.worldEvent.create({data:{userId:user.id,eventKey:input.eventKey,kind:`mission:${action}`,payload:{roleId:input.roleId ?? null,action,result:resultText,worldVersion:WORLD_VERSION}}});
        if (earned) await tx.uPointEntry.create({data:{userId:user.id,source:"WORLD",nodeId:action==="cross"?"world:festival-cross":`world:${input.roleId}:${action}`,rewardVersion:1,amount:earned,reason:action==="cross"?"Завершено «Открытие через час»":action==="intro"?`Попробована роль «${roles[input.roleId!].title}»`:`Завершена история «${roles[input.roleId!].mission}»`,idempotencyKey:action==="cross"?`world:${user.id}:festival-cross:v1`:`world:${user.id}:${input.roleId}:${action}:v1`,worldEventId:event.id}});
        const updated = await tx.worldSave.updateMany({where:{userId:user.id,revision:save.revision},data:{state:encode(state),revision:{increment:1},worldVersion:WORLD_VERSION}});
        if (!updated.count) throw new AppError("Мир изменился в другой вкладке. Обнови его.",409);
        return {state,revision:save.revision+1,savedAt:new Date(),earned,resultText};
      } else if(input.type === "world.explore") {
        if(!input.targetId || !input.exploreAction || !input.eventKey) throw new AppError("Неизвестное действие.");
        const npc=npcById[input.targetId];
        const prop=pointById(state.scene,input.targetId);
        const location=npc ? npcLocation(npc,state):null;
        const target = npc && location?.scene===state.scene ? location : prop;
        if(!target || Math.hypot(state.x-target.x,state.y-target.y)>135) throw new AppError("Подойди ближе к объекту.");
        const action=input.exploreAction;
        const alreadyDone = npc && (action==="meet" || action==="deeper")
          ? state.npcMemoryFlags[`${action==="meet"?"met":"deep"}:${npc.id}`]
          : prop && action==="toggle" ? state.persistentPropStates[prop.id]
          : prop && action==="discover" ? state.discoveredSecrets.includes(prop.id)
          : false;
        if (alreadyDone) return {state,revision:save.revision,savedAt:save.updatedAt,repeated:true};
        if(npc && (action==="meet" || action==="deeper")) {
          if(action==="deeper" && !state.npcMemoryFlags[`met:${npc.id}`]) throw new AppError("Сначала познакомься с персонажем.");
          state.npcMemoryFlags[`${action==="meet"?"met":"deep"}:${npc.id}`]=true;
          state.npcStates[npc.id]=npc.activity==="patrol"?"patrolling":npc.activity==="work"?"working":"idle";
        } else if(prop && ((action==="toggle" && prop.kind==="toggle") || (action==="discover" && prop.kind==="secret"))) {
          if(action==="toggle") state.persistentPropStates[prop.id]=true;
          else if(!state.discoveredSecrets.includes(prop.id)) state.discoveredSecrets.push(prop.id);
        } else throw new AppError("Действие недоступно.");
        await tx.worldEvent.create({data:{userId:user.id,eventKey:input.eventKey,kind:`explore:${action}`,payload:{targetId:input.targetId,worldVersion:WORLD_VERSION}}});
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
