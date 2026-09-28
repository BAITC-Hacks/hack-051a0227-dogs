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
import { cosmeticById, questById } from "./progression";

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
  type: z.enum(["world.get", "world.move", "world.event", "world.explore", "world.mission", "world.focus", "world.purchase", "world.appearance", "world.display", "world.quest", "world.reflection"]),
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
  itemId: z.string().max(50).optional(),
  appearance: z.object({preset:z.enum(["classic","cyan","graphite"]),hair:z.enum(["short","wave","curl"]),bottom:z.enum(["graphite","denim","olive"]),top:z.string().max(50).nullable(),accessory:z.string().max(50).nullable()}).optional(),
  displayedItems: z.array(z.string().max(50)).max(3).optional(),
  questId: z.string().max(60).optional(),
  questChoice: z.union([z.literal(0),z.literal(1)]).optional(),
  reflection: z.string().max(800).optional(),
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
      if (input.type !== "world.move" && input.eventKey) {
        const previous = await tx.worldEvent.findUnique({
          where: {
            userId_eventKey: { userId: user.id, eventKey: input.eventKey },
          },
        });
        if (previous) {
          const balance=await tx.uPointEntry.aggregate({where:{userId:user.id},_sum:{amount:true}});
          return {
            state: parseState(save.state),
            revision: save.revision,
            savedAt: save.updatedAt,
            points: balance._sum.amount ?? 0,
            repeated: true,
          };
        }
      }
      if (save.revision !== input.revision)
        throw new AppError(
          "Мир открыт в другой вкладке. Обнови состояние, чтобы продолжить.",
          409,
        );
      let state = parseState(save.state);
      const closeTo=(scene:WorldScene,x:number,y:number)=>state.scene===scene && Math.hypot(state.x-x,state.y-y)<=135;
      if(input.type==="world.focus") {
        const roleId=input.roleId;
        const festival=input.questId==="before-opening" && !roleId;
        if((!roleId&&!festival)||!input.eventKey) throw new AppError("Неизвестная история.");
        const target=festival?"square":roles[roleId!].scene;
        const prior={scene:state.scene,x:state.x,y:state.y};
        state={...state,scene:target,...spawn[target],safeLocation:{scene:target,...spawn[target]},returnPositions:{...state.returnPositions,[prior.scene]:{x:prior.x,y:prior.y}},openedLocations:state.openedLocations.includes(target)?state.openedLocations:[...state.openedLocations,target],visitedDistricts:state.visitedDistricts.includes(target)?state.visitedDistricts:[...state.visitedDistricts,target]};
        await tx.worldEvent.create({data:{userId:user.id,eventKey:input.eventKey,kind:"focus",payload:{roleId:roleId??null,questId:festival?"before-opening":null,from:prior.scene,to:target,worldVersion:WORLD_VERSION}}});
        const updated=await tx.worldSave.updateMany({where:{userId:user.id,revision:save.revision},data:{state:encode(state),revision:{increment:1},worldVersion:WORLD_VERSION}});
        if(!updated.count) throw new AppError("Мир изменился в другой вкладке. Обнови его.",409);
        return {state,revision:save.revision+1,savedAt:new Date()};
      }
      if(["world.purchase","world.appearance","world.display","world.quest","world.reflection"].includes(input.type)) {
        if(!input.eventKey) throw new AppError("Неизвестное действие.");
        let earned=0;
        let resultText="Сохранено";
        if(input.type==="world.purchase") {
          const item=input.itemId && cosmeticById[input.itemId];
          if(!item || !closeTo("square",12*32,25*32)) throw new AppError("Подойди к лавке кампуса.");
          if(state.ownedCosmetics.includes(item.id)) return {state,revision:save.revision,savedAt:save.updatedAt,repeated:true};
          const balance=await tx.uPointEntry.aggregate({where:{userId:user.id},_sum:{amount:true}});
          if((balance._sum.amount??0)<item.price) throw new AppError("Пока не хватает U для этого предмета.");
          state.ownedCosmetics.push(item.id);
          earned=-item.price;
          resultText=`${item.title} добавлен в твои вещи.`;
        } else if(input.type==="world.appearance") {
          if(!input.appearance || !closeTo("corner",5*32,5*32)) throw new AppError("Открой гардероб в личном уголке.");
          for(const id of [input.appearance.top,input.appearance.accessory]) if(id && !state.ownedCosmetics.includes(id)) throw new AppError("Эта вещь ещё не открыта.");
          if(input.appearance.top && cosmeticById[input.appearance.top]?.category!=="outfit") throw new AppError("Неверная вещь для образа.");
          if(input.appearance.accessory && cosmeticById[input.appearance.accessory]?.category!=="accessory") throw new AppError("Неверный аксессуар.");
          state.appearance=input.appearance;
          resultText="Образ сохранён.";
        } else if(input.type==="world.display") {
          if(!input.displayedItems || !closeTo("corner",11*32,5*32)) throw new AppError("Подойди к личному столу.");
          if(new Set(input.displayedItems).size!==input.displayedItems.length || input.displayedItems.some(id=>!state.ownedCosmetics.includes(id) || !["desk","world","display"].includes(cosmeticById[id]?.category))) throw new AppError("Предмет недоступен для стола.");
          state.displayedItems=input.displayedItems;
          resultText="Личный стол обновлён.";
        } else if(input.type==="world.reflection") {
          if(input.reflection===undefined || !Object.values(state.roles).some(role=>role?.completedAt) && !state.crossMission) throw new AppError("Сначала заверши историю роли.");
          state.reflection=input.reflection.trim();
          resultText="Мысль сохранена в личном журнале.";
        } else {
          const quest=input.questId && questById[input.questId];
          if(!quest) throw new AppError("История не найдена.");
          const progress=state.sideQuests[quest.id]??{step:0,choice:null,completedAt:null};
          if(progress.completedAt) return {state,revision:save.revision,savedAt:save.updatedAt,repeated:true};
          const step=quest.steps[progress.step];
          if(!step) throw new AppError("Эта часть истории уже завершена.");
          const base=points[step.point.id as WorldEventKind];
          const npc=npcById[step.point.id];
          const loc=npc?npcLocation(npc,state):pointById(step.point.scene,step.point.id)??base;
          if(!loc || !closeTo(step.point.scene,loc.x,loc.y)) throw new AppError("Подойди к месту следующего шага.");
          const isLast=progress.step===quest.steps.length-1;
          if(isLast && input.questChoice===undefined) throw new AppError("Выбери, как завершить историю.");
          progress.step++;
          if(isLast) {
            progress.choice=input.questChoice!;
            progress.completedAt=new Date().toISOString();
            earned=quest.reward;
            if(quest.postcard && !state.postcards.includes(quest.postcard)) state.postcards.push(quest.postcard);
          }
          state.sideQuests[quest.id]=progress;
          resultText=step.story;
        }
        const event=await tx.worldEvent.create({data:{userId:user.id,eventKey:input.eventKey,kind:input.type,payload:{itemId:input.itemId??null,questId:input.questId??null,step:input.questId?state.sideQuests[input.questId]?.step:null,worldVersion:WORLD_VERSION}}});
        if(earned) await tx.uPointEntry.create({data:{userId:user.id,source:earned<0?"WORLD_STORE":"WORLD_SIDE",nodeId:earned<0?`store:${input.itemId}`:`side:${input.questId}`,rewardVersion:1,amount:earned,reason:earned<0?`Предмет «${cosmeticById[input.itemId!].title}»`:`История «${questById[input.questId!].title}»`,idempotencyKey:earned<0?`world:${user.id}:purchase:${input.itemId}:v1`:`world:${user.id}:side:${input.questId}:v1`,worldEventId:event.id}});
        const updated=await tx.worldSave.updateMany({where:{userId:user.id,revision:save.revision},data:{state:encode(state),revision:{increment:1},worldVersion:WORLD_VERSION}});
        if(!updated.count) throw new AppError("Мир изменился в другой вкладке. Обнови его.",409);
        const balance=await tx.uPointEntry.aggregate({where:{userId:user.id},_sum:{amount:true}});
        return {state,revision:save.revision+1,savedAt:new Date(),points:balance._sum.amount??0,earned,resultText};
      }
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
          const visitCard=`visit-${input.scene}`;
          if(districtScenes.includes(input.scene as typeof districtScenes[number]) && !state.postcards.includes(visitCard)) state.postcards.push(visitCard);
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
            if (!state.postcards.includes(`role-${roleId}`)) state.postcards.push(`role-${roleId}`);
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
          else if(!state.discoveredSecrets.includes(prop.id)) {
            state.discoveredSecrets.push(prop.id);
            state.postcards.push(`secret-${prop.id}`);
          }
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
