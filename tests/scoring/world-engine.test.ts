import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  applyWorldEvent,
  initialWorldState,
  objective,
  points,
  safePosition,
  spawn,
  migrateWorldState,
} from "../../src/lib/world/model";
import { dialogueFor } from "../../src/lib/world/dialogues";
import { districtScenes, zones, portalBetween } from "../../src/lib/world/scenes";
import { npcCast, npcsIn } from "../../src/lib/world/npcs";
import { roleIds, roles, resolveMission, validateIntro, resolveDeeper } from "../../src/lib/world/missions";
import { npcById, npcLocation } from "../../src/lib/world/npcs";
import { cosmetics, sideQuests } from "../../src/lib/world/progression";
import { grantQaAccess } from "../qa-access";
import { cleanupRun } from "../cleanup";
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3000";
const db = new PrismaClient();
class Session {
  cookie = "";
  async call(type: string, data: Record<string, unknown> = {}, expected = 200) {
    const response = await fetch(
      origin + "/api/" + (type.startsWith("world.") ? "world" : "action"),
      {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: this.cookie,
        },
        body: JSON.stringify({ type, ...data }),
      },
    );
    if (response.headers.get("set-cookie"))
      this.cookie = response.headers.get("set-cookie")!.split(";")[0];
    const payload = await response.json();
    assert.equal(response.status, expected, JSON.stringify(payload));
    return payload.data;
  }
}
test("Квест проходит через осмотр, встречи, предмет, три варианта и завершение без скрытой оценки", () => {
  for (const choice of ["repair", "delegate", "relocate"] as const) {
    let s = initialWorldState();
    assert.equal(objective(s), "Найди координатора Санию на площади");
    assert.throws(() => applyWorldEvent(s, "crate"));
    for (const kind of [
      "coordinator",
      "board",
      "aruzhan",
      "timur",
      "crate",
      "display",
    ] as const)
      s = applyWorldEvent(s, kind);
    assert.deepEqual(s.items, ["materials"]);
    assert.throws(() => applyWorldEvent(s, "deliver"));
    s = applyWorldEvent(s, "choose", choice);
    assert.equal(s.flags.choice, choice);
    s = applyWorldEvent(s, "deliver");
    assert.deepEqual(s.items, []);
    s = applyWorldEvent(s, "finish");
    assert.equal(s.flags.completed, true);
    assert.equal(objective(s), "Исследуй Campus Square");
  }
  assert.deepEqual(safePosition("square", 42 * 32, 26 * 32), {
    x: 25 * 32 + 16,
    y: 27 * 32 + 16,
  });
  assert.deepEqual(safePosition("square", -1, 500), {
    x: 25 * 32 + 16,
    y: 27 * 32 + 16,
  });
  assert.match(
    dialogueFor("timur", "Тимур", {
      ...initialWorldState(),
      flags: { ...initialWorldState().flags, choice: "repair" },
    }).pages[0],
    /вернули экран/,
  );
});
test("Новые районы связаны с площадью, старое сохранение мигрирует без потери квеста", () => {
  assert.equal(districtScenes.length,5);
  assert.equal(npcCast.length,16);
  for(const id of districtScenes) {
    assert.ok(zones[id].program);
    assert.ok(portalBetween("square",id));
    assert.ok(portalBetween(id,"square"));
    assert.ok(portalBetween(id,`${id}-room`));
    assert.ok(portalBetween(`${id}-room`,id));
    assert.ok(npcsIn(id,initialWorldState()).length>=2);
  }
  const old=initialWorldState();
  old.version=1;
  old.flags.completed=true;
  old.flags.choice="delegate";
  old.npc={saniya:2,aruzhan:1};
  const migrated=migrateWorldState({...old,visitedDistricts:undefined,npcMemoryFlags:undefined,returnPositions:undefined,worldPhase:undefined});
  assert.equal(migrated.version,4);
  assert.deepEqual(migrated.ownedCosmetics,[]);
  assert.deepEqual(migrated.sideQuests,{});
  assert.equal(sideQuests.length,10);
  assert.equal(cosmetics.length,20);
  assert.deepEqual(migrated.roles,{});
  assert.equal(migrated.flags.completed,true);
  assert.equal(migrated.flags.choice,"delegate");
  assert.equal(migrated.worldPhase,"AFTER");
  assert.deepEqual(migrated.visitedDistricts,[]);
  const discovered=migrateWorldState({...old,visitedDistricts:["maker"],discoveredSecrets:["maker-bird"]});
  assert.ok(discovered.postcards.includes("visit-maker"));
  assert.ok(discovered.postcards.includes("secret-maker-bird"));
  assert.equal(migrated.npcMemoryFlags["met:saniya"],true);
  assert.equal(migrated.npcMemoryFlags["met:aruzhan"],true);
  assert.deepEqual(safePosition("maker",480,160),initialWorldState().scene === "square" ? {x:128,y:352}:null);
  assert.match(dialogueFor("maker-door","Maker Yard",initialWorldState()).pages[0],/Maker Yard/);
});
test("World progression: магазин, гардероб, личный стол и побочная история сохраняются без повторной награды",{timeout:120000},async()=>{
  const email=`world-progression-${randomUUID()}@qa.local`,candidate=new Session();
  let userId="";
  try {
    await candidate.call("register",{email,name:"Игрок прогресса",password:"WorldTest2026!"});
    userId=(await db.user.update({where:{email},data:{origin:"QA"}})).id;
    await grantQaAccess(db,email);
    const first=await candidate.call("world.get") as {revision:number;state:ReturnType<typeof initialWorldState>};
    const creditEvent=await db.worldEvent.create({data:{userId,eventKey:randomUUID(),kind:"qa:credit",payload:{test:true},origin:"QA"}});
    await db.uPointEntry.create({data:{userId,source:"QA",nodeId:"qa-credit",rewardVersion:1,amount:100,reason:"QA credit",idempotencyKey:`qa:${userId}:credit`,worldEventId:creditEvent.id}});
    const atStore={...first.state,scene:"square" as const,x:12*32,y:25*32};
    const storeSave=await db.worldSave.update({where:{userId},data:{state:atStore as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const key=randomUUID();
    await candidate.call("world.purchase",{revision:storeSave.revision,eventKey:randomUUID(),itemId:"unknown",price:0},400);
    const bought=await candidate.call("world.purchase",{revision:storeSave.revision,eventKey:key,itemId:"lime-hoodie",price:0}) as {state:ReturnType<typeof initialWorldState>;revision:number;points:number};
    assert.equal(bought.points,45);
    assert.deepEqual(bought.state.ownedCosmetics,["lime-hoodie"]);
    const repeat=await candidate.call("world.purchase",{revision:bought.revision,eventKey:key,itemId:"lime-hoodie"}) as {revision:number;points:number};
    assert.equal(repeat.revision,bought.revision);assert.equal(repeat.points,45);
    await candidate.call("world.purchase",{revision:bought.revision,eventKey:randomUUID(),itemId:"cyan-jacket"},400);
    const corner={...bought.state,scene:"corner" as const,x:5*32,y:5*32};
    const cornerSave=await db.worldSave.update({where:{userId},data:{state:corner as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    await candidate.call("world.appearance",{revision:cornerSave.revision,eventKey:randomUUID(),appearance:{preset:"cyan",hair:"wave",bottom:"denim",top:"cyan-jacket",accessory:null}},400);
    const dressed=await candidate.call("world.appearance",{revision:cornerSave.revision,eventKey:randomUUID(),appearance:{preset:"cyan",hair:"wave",bottom:"denim",top:"lime-hoodie",accessory:null}}) as {state:ReturnType<typeof initialWorldState>;revision:number};
    assert.equal(dressed.state.appearance.top,"lime-hoodie");
    await candidate.call("world.display",{revision:dressed.revision,eventKey:randomUUID(),displayedItems:["lime-hoodie"]},400);
    const atTimur={...dressed.state,scene:"square" as const,x:32*32,y:16*32};
    const timurSave=await db.worldSave.update({where:{userId},data:{state:atTimur as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const started=await candidate.call("world.quest",{revision:timurSave.revision,eventKey:randomUUID(),questId:"lost-cable"}) as {state:ReturnType<typeof initialWorldState>;revision:number};
    assert.equal(started.state.sideQuests["lost-cable"].step,1);
    await candidate.call("world.quest",{revision:started.revision,eventKey:randomUUID(),questId:"lost-cable"},400);
    const atBench={...started.state,scene:"maker-room" as const,x:8*32,y:5*32};
    const benchSave=await db.worldSave.update({where:{userId},data:{state:atBench as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const bench=await candidate.call("world.quest",{revision:benchSave.revision,eventKey:randomUUID(),questId:"lost-cable"}) as {state:ReturnType<typeof initialWorldState>;revision:number};
    const atDisplay={...bench.state,scene:"square" as const,x:31*32,y:16*32};
    const displaySave=await db.worldSave.update({where:{userId},data:{state:atDisplay as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    await candidate.call("world.quest",{revision:displaySave.revision,eventKey:randomUUID(),questId:"lost-cable"},400);
    const done=await candidate.call("world.quest",{revision:displaySave.revision,eventKey:randomUUID(),questId:"lost-cable",questChoice:1}) as {state:ReturnType<typeof initialWorldState>;revision:number;points:number};
    assert.equal(done.state.sideQuests["lost-cable"].choice,1);assert.deepEqual(done.state.postcards,["display"]);assert.equal(done.points,70);
    await candidate.call("world.quest",{revision:done.revision,eventKey:randomUUID(),questId:"lost-cable",questChoice:1});
    assert.equal(await db.uPointEntry.count({where:{userId,source:"WORLD_SIDE"}}),1);
    assert.equal(await db.uPointEntry.count({where:{userId,source:"WORLD_STORE"}}),1);
  } finally {if(userId)await cleanupRun(db,[email]);await db.$disconnect();}
});
test("Пять ролей имеют разные действия, проверку и изменяемое решение",()=>{
  assert.equal(roleIds.length,5);
  const examples = {
    engineer:{sensor:"steady",power:"battery",mount:"guarded",connections:["sensor-power","power-mount"]},
    product:{flow:["place","schedule","save","detail"],problem:"wayfinding",testers:["visitor","volunteer"]},
    research:{interviews:["volunteer","quiet"],hypothesis:"route",evidence:["supports","contradicts"]},
    policy:{layout:["demo","quiet","media","food"],priority:"access",volunteers:["entrance","demo"]},
    media:{sources:["author","schedule"],angle:"process",channel:"board",story:["scene","fact","context"],headline:"making",update:"revise"},
  };
  const introductions = {engineer:{check:"датчик"},product:{flow:["событие","место"]},research:{question:"как узнали о событии"},policy:{zones:["показ","тихая","проход"]},media:{fact:"место"}} as const;
  for(const id of roleIds) {
    assert.ok(roles[id].intro && roles[id].mission && roles[id].deeper);
    assert.ok(validateIntro(id,introductions[id] as never));
    const first=resolveMission(id,examples[id] as never,"test");
    assert.ok(first.observation.length>30);
    assert.throws(()=>resolveMission(id,examples[id] as never,"revision",first),/измени/);
    assert.ok(resolveDeeper(id,id==="engineer"?"accessible":id==="product"?"preview":id==="research"?"observe":id==="policy"?"split":"context"));
  }
  assert.match(resolveMission("engineer",{...examples.engineer,sensor:"low-power"},"test").consequence,/проще/);
  assert.match(resolveMission("product",{...examples.product,flow:["schedule","detail","place","save"]},"test").observation,/3 шага/);
  assert.match(resolveMission("research",examples.research,"test").observation,/20/);
  assert.match(resolveMission("policy",examples.policy,"test").observation,/Волонтёр/);
  assert.match(resolveMission("media",{...examples.media,sources:["rumour","photo"]},"test").consequence,/Слух/);
});
test("World API: район, интерьер, возвращение к двери и сохранение взаимодействия",{timeout:120000},async()=>{
  const email="world-district-"+randomUUID()+"@qa.local", candidate=new Session();
  let userId="";
  try {
    await candidate.call("register",{email,name:"Игрок районов",password:"WorldTest2026!"});
    userId=(await db.user.update({where:{email},data:{origin:"QA"}})).id;
    await grantQaAccess(db,email);
    const first=await candidate.call("world.get") as {revision:number;state:ReturnType<typeof initialWorldState>};
    await candidate.call("world.move",{revision:first.revision,scene:"maker",x:0,y:0},400);
    const atGate={...first.state,x:64,y:544};
    const gateSave=await db.worldSave.update({where:{userId},data:{state:atGate as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const entered=await candidate.call("world.move",{revision:gateSave.revision,scene:"maker",x:0,y:0}) as {revision:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(entered.state.scene,"maker");
    assert.deepEqual(entered.state.visitedDistricts,["maker"]);
    assert.ok(entered.state.postcards.includes("visit-maker"));
    await candidate.call("world.explore",{revision:entered.revision,targetId:"maker-bird",exploreAction:"discover",eventKey:randomUUID()},400);
    const atSecret={...entered.state,x:6*32,y:17*32};
    const secretSave=await db.worldSave.update({where:{userId},data:{state:atSecret as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const secret=await candidate.call("world.explore",{revision:secretSave.revision,targetId:"maker-bird",exploreAction:"discover",eventKey:randomUUID()}) as {revision:number;state:ReturnType<typeof initialWorldState>};
    assert.ok(secret.state.postcards.includes("secret-maker-bird"));
    const atProp={...secret.state,x:21*32,y:14*32};
    const propSave=await db.worldSave.update({where:{userId},data:{state:atProp as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const key=randomUUID();
    const toggled=await candidate.call("world.explore",{revision:propSave.revision,targetId:"maker-rack",exploreAction:"toggle",eventKey:key}) as {revision:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(toggled.state.persistentPropStates["maker-rack"],true);
    const repeated=await candidate.call("world.explore",{revision:toggled.revision,targetId:"maker-rack",exploreAction:"toggle",eventKey:key}) as {revision:number};
    assert.equal(repeated.revision,toggled.revision);
    const repeatedNewKey=await candidate.call("world.explore",{revision:toggled.revision,targetId:"maker-rack",exploreAction:"toggle",eventKey:randomUUID()}) as {revision:number};
    assert.equal(repeatedNewKey.revision,toggled.revision);
    const atDoor={...toggled.state,x:480,y:288};
    const doorSave=await db.worldSave.update({where:{userId},data:{state:atDoor as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const inside=await candidate.call("world.move",{revision:doorSave.revision,scene:"maker-room",x:0,y:0}) as {revision:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(inside.state.scene,"maker-room");
    assert.deepEqual(inside.state.visitedInteriors,["maker-room"]);
    const outside=await candidate.call("world.move",{revision:inside.revision,scene:"maker",x:0,y:0}) as {revision:number;state:ReturnType<typeof initialWorldState>};
    assert.deepEqual({x:outside.state.x,y:outside.state.y},{x:480,y:288});
    assert.equal(outside.state.persistentPropStates["maker-rack"],true);
    const focusKey=randomUUID();
    const focused=await candidate.call("world.focus",{revision:outside.revision,questId:"before-opening",eventKey:focusKey}) as {revision:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(focused.state.scene,"square");
    assert.deepEqual({x:focused.state.x,y:focused.state.y},spawn.square);
    const focusRetry=await candidate.call("world.focus",{revision:focused.revision,questId:"before-opening",eventKey:focusKey}) as {revision:number};
    assert.equal(focusRetry.revision,focused.revision);
    assert.equal(await db.uPointEntry.count({where:{userId,source:"WORLD"}}),0);
  } finally {if(userId) await cleanupRun(db,[email]);await db.$disconnect();}
});
test(
  "World API: полный доступ, ревизия, однократный U и граница комиссии",
  { timeout: 120000 },
  async () => {
    const email = "world-" + randomUUID() + "@qa.local",
      candidate = new Session(),
      staff = new Session();
    let userId = "";
    try {
      await candidate.call("register", {
        email,
        name: "Игрок QA",
        password: "WorldTest2026!",
      });
      userId = (
        await db.user.update({ where: { email }, data: { origin: "QA" } })
      ).id;
      await candidate.call("world.get", {}, 403);
      await grantQaAccess(db, email);
      const first = (await candidate.call("world.get")) as {
        state: ReturnType<typeof initialWorldState>;
        revision: number;
        points: number;
      };
      assert.equal(first.state.scene, "square");
      assert.equal(first.points, 0);
      await candidate.call(
        "world.move",
        { revision: first.revision, scene: "square", x: 99999, y: 99999 },
        400,
      );
      await candidate.call(
        "world.move",
        {
          revision: first.revision,
          scene: "square",
          x: first.state.x,
          y: first.state.y,
        },
        200,
      );
      await candidate.call(
        "world.move",
        {
          revision: first.revision,
          scene: "square",
          x: first.state.x,
          y: first.state.y,
        },
        409,
      );
      const finish = initialWorldState();
      finish.flags = {
        coordinator: true,
        board: true,
        talks: ["amir", "dana"],
        crate: true,
        display: true,
        choice: "delegate",
        delivered: true,
        completed: false,
        cafeVisited: false,
      };
      finish.x = points.finish.x;
      finish.y = points.finish.y;
      const current = await db.worldSave.update({
        where: { userId },
        data: {
          state: finish as unknown as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
      const key = randomUUID();
      const done = (await candidate.call("world.event", {
        revision: current.revision,
        kind: "finish",
        eventKey: key,
      })) as { state: typeof finish; revision: number };
      assert.equal(done.state.flags.completed, true);
      await candidate.call("world.event", {
        revision: done.revision,
        kind: "finish",
        eventKey: key,
      });
      await candidate.call("world.event", {
        revision: done.revision,
        kind: "finish",
        eventKey: randomUUID(),
      });
      assert.equal(
        await db.uPointEntry.count({ where: { userId, source: "WORLD" } }),
        1,
      );
      assert.equal(
        ((await candidate.call("world.get")) as { points: number }).points,
        60,
      );
      const tree = (await candidate.call("skill.view")) as {
        nodes: { id: string; state: string }[];
        balance: number;
      };
      assert.equal(
        tree.nodes.find((n) => n.id === "world-before-opening")?.state,
        "completed",
      );
      assert.equal(tree.balance, 60);
      await candidate.call(
        "skill.complete",
        {
          nodeId: "world-before-opening",
          response: {},
          requestKey: randomUUID(),
        },
        409,
      );
      assert.equal(
        await db.scoringRun.count({ where: { application: { userId } } }),
        0,
      );
      assert.equal(
        await db.assessment.count({ where: { application: { userId } } }),
        0,
      );
      await staff.call("login", {
        identifier: "admissions@invision.local",
        password: "LeaderDesk2026!",
      });
      await staff.call("world.get", {}, 403);
      await candidate.call("logout");
      await candidate.call("world.get", {}, 401);
    } finally {
      if (userId) await cleanupRun(db, [email]);
      await db.$disconnect();
    }
  },
);
test("Ролевая миссия сохраняет версии, открывает узел и не выдаёт U за повтор",{timeout:120000},async()=>{
  const email=`world-roles-${randomUUID()}@qa.local`,candidate=new Session();
  let userId="";
  try {
    await candidate.call("register",{email,name:"Игрок миссий",password:"WorldTest2026!"});
    userId=(await db.user.update({where:{email},data:{origin:"QA"}})).id;
    await candidate.call("world.get",{},403);
    await grantQaAccess(db,email);
    const fresh=await candidate.call("world.get") as {state:ReturnType<typeof initialWorldState>;revision:number;points:number};
    const lead=npcLocation(npcById.aida,fresh.state);
    const atLead={...fresh.state,scene:lead.scene,x:lead.x,y:lead.y,visitedDistricts:["maker"],openedLocations:["square","maker"]};
    const prepared=await db.worldSave.update({where:{userId},data:{state:atLead as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const introKey=randomUUID();
    const intro=await candidate.call("world.mission",{revision:prepared.revision,roleId:"engineer",missionAction:"intro",payload:{check:"датчик"},eventKey:introKey}) as {revision:number;earned:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(intro.earned,25);
    await candidate.call("world.mission",{revision:intro.revision,roleId:"engineer",missionAction:"intro",payload:{check:"датчик"},eventKey:introKey});
    await candidate.call("world.mission",{revision:prepared.revision,roleId:"engineer",missionAction:"test",payload:{},eventKey:randomUUID()},409);
    const atProp={...intro.state,scene:"maker" as const,x:8*32,y:11*32};
    const propSave=await db.worldSave.update({where:{userId},data:{state:atProp as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const firstPayload={sensor:"steady",power:"battery",mount:"guarded",connections:["sensor-power","power-mount"]};
    await candidate.call("world.mission",{revision:propSave.revision,roleId:"engineer",missionAction:"test",payload:firstPayload,eventKey:randomUUID()},400);
    const withKit=await db.worldSave.update({where:{userId},data:{state:{...atProp,persistentPropStates:{"maker-rack":true}} as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const tested=await candidate.call("world.mission",{revision:withKit.revision,roleId:"engineer",missionAction:"test",payload:firstPayload,eventKey:randomUUID()}) as {revision:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(tested.state.roles.engineer?.stage,"revision");
    await candidate.call("world.mission",{revision:tested.revision,roleId:"engineer",missionAction:"finish",payload:firstPayload,eventKey:randomUUID()},400);
    const finished=await candidate.call("world.mission",{revision:tested.revision,roleId:"engineer",missionAction:"finish",payload:{...firstPayload,sensor:"low-power"},eventKey:randomUUID()}) as {revision:number;earned:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(finished.earned,75);
    assert.equal(finished.state.roles.engineer?.history.length,1);
    assert.equal(finished.state.persistentPropStates["maker-kinetic"],true);
    const tree=await candidate.call("skill.view") as {nodes:{id:string;state:string}[]};
    assert.equal(tree.nodes.find((n)=>n.id==="world-engineer")?.state,"completed");
    const replay=await candidate.call("world.mission",{revision:finished.revision,roleId:"engineer",missionAction:"replay",payload:{},eventKey:randomUUID()}) as {revision:number};
    const again=await candidate.call("world.mission",{revision:replay.revision,roleId:"engineer",missionAction:"test",payload:firstPayload,eventKey:randomUUID()}) as {revision:number};
    const second=await candidate.call("world.mission",{revision:again.revision,roleId:"engineer",missionAction:"finish",payload:{...firstPayload,power:"grid"},eventKey:randomUUID()}) as {revision:number;earned:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(second.earned,0);
    assert.equal(second.state.roles.engineer?.history.length,2);
    assert.equal(second.state.roles.engineer?.replayCount,1);
    assert.equal(await db.uPointEntry.count({where:{userId,source:"WORLD"}}),2);
    assert.equal(await db.scoringRun.count({where:{application:{userId}}}),0);
    const atMap={...second.state,scene:"square" as const,x:35*32,y:25*32};
    const mapSave=await db.worldSave.update({where:{userId},data:{state:atMap as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    const cross=await candidate.call("world.mission",{revision:mapSave.revision,missionAction:"cross",payload:{perspectives:["engineer","product"]},eventKey:randomUUID()}) as {earned:number;state:ReturnType<typeof initialWorldState>};
    assert.equal(cross.earned,100);
    assert.deepEqual(cross.state.crossMission?.perspectives,["engineer","product"]);
    assert.equal((await candidate.call("world.get") as {points:number}).points,200);
  } finally {if(userId) await cleanupRun(db,[email]);await db.$disconnect();}
});
