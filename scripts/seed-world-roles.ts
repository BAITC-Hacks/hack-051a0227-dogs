// Explicit, targeted fictional World histories for a named local database.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { initialWorldState, migrateWorldState, WORLD_VERSION } from "../src/lib/world/model";
import { resolveMission, roleIds, roles, type MissionPayload, type RoleId, type RoleProgress } from "../src/lib/world/missions";

const database=process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const expected=process.env.SHOWCASE_WORLD_DB;
if(process.argv[2]!=="--apply" || !database || !expected || !["127.0.0.1","localhost"].includes(database.hostname) || database.pathname!==`/${expected}` || !(expected.startsWith("leader_") || expected==="world_roles_qa")) {
  throw new Error("Нужны --apply и SHOWCASE_WORLD_DB, совпадающий с именем локальной БД.");
}
const db=new PrismaClient();
const origin="WORLD_ROLES_20260928";
const payloads:Record<RoleId,[MissionPayload,MissionPayload]>={
  engineer:[
    {sensor:"steady",power:"battery",mount:"guarded",connections:["sensor-power","power-mount"]},
    {sensor:"low-power",power:"battery",mount:"guarded",connections:["sensor-power","power-mount"]},
  ],
  product:[
    {flow:["schedule","place","detail","save"],problem:"wayfinding",testers:["visitor","volunteer"]},
    {flow:["place","save","schedule","detail"],problem:"saving",testers:["volunteer","one-hand"]},
  ],
  research:[
    {interviews:["volunteer","visitor"],hypothesis:"time",evidence:["unclear","supports"]},
    {interviews:["volunteer","quiet"],hypothesis:"route",evidence:["supports","contradicts"]},
  ],
  policy:[
    {layout:["food","demo","quiet","media"],priority:"capacity",volunteers:["demo","quiet"]},
    {layout:["demo","food","media","quiet"],priority:"access",volunteers:["entrance","demo"]},
  ],
  media:[
    {sources:["photo","rumour"],angle:"visitor",channel:"social",story:["scene","fact","context"],headline:"visit",update:"clarify"},
    {sources:["author","schedule"],angle:"change",channel:"board",story:["fact","context","scene"],headline:"change",update:"revise"},
  ],
};
type SeedKind="complete"|"partial";
const targets:readonly {email:string;paths:readonly [RoleId,SeedKind][];cross?:[RoleId,RoleId]}[]=[
  {email:"intake.browser.20260927@candidate.local",paths:[["engineer","complete"],["product","partial"]]},
  {email:"sofia@candidate.local",paths:[["media","complete"],["research","complete"]]},
  {email:"timur@candidate.local",paths:[["engineer","partial"]]},
  {email:"ruslan@candidate.local",paths:[["product","complete"],["policy","complete"],["media","complete"]],cross:["product","policy"]},
  {email:"intake.dana@candidate.local",paths:[]},
];
function makeProgress(roleId:RoleId,kind:SeedKind,at:string):RoleProgress {
  const first=resolveMission(roleId,payloads[roleId][0],"test");
  if(kind==="partial") return {version:1,introAt:at,stage:"revision",first,replayCount:0,history:[]};
  const final=resolveMission(roleId,payloads[roleId][1],"revision",first);
  return {version:1,introAt:at,stage:"complete",first,final,completedAt:at,replayCount:0,history:[{first,final,at}]};
}
async function main() {
  for(const target of targets) {
    const user=await db.user.findUnique({where:{email:target.email},select:{id:true,origin:true,role:true}});
    if(!user || user.role!=="CANDIDATE" || !["SEED","INTAKE_BROWSER_20260927","INTAKE_EXAMPLES_20260927"].includes(user.origin)) continue;
    const save=await db.worldSave.findUnique({where:{userId:user.id}});
    const state=save?migrateWorldState(save.state):initialWorldState();
    if(target.paths.length===0 && save) continue;
    const wasSeeded=await db.worldEvent.count({where:{userId:user.id,origin}})>0;
    if(wasSeeded) {
      let enriched=false;
      for(const [id] of target.paths) {
        if(!state.roles[id]?.introAt) continue;
        if(!state.visitedDistricts.includes(roles[id].scene)) {state.visitedDistricts.push(roles[id].scene);enriched=true;}
        const key=`met:${roles[id].lead}`;
        if(!state.npcMemoryFlags[key]) {state.npcMemoryFlags[key]=true;enriched=true;}
      }
      if(target.cross && !state.persistentPropStates["square-map"]) {state.persistentPropStates["square-map"]=true;enriched=true;}
      if(enriched && save) await db.worldSave.update({where:{userId:user.id},data:{state:state as unknown as Prisma.InputJsonValue,worldVersion:WORLD_VERSION,revision:{increment:1}}});
      continue;
    }
    if(roleIds.some((id)=>state.roles[id]?.introAt) || state.crossMission) continue;
    const at=new Date().toISOString();
    for(const [id,kind] of target.paths) {
      state.roles[id]=makeProgress(id,kind,at);
      if(!state.visitedDistricts.includes(roles[id].scene)) state.visitedDistricts.push(roles[id].scene);
      state.npcMemoryFlags[`met:${roles[id].lead}`]=true;
      if(kind==="complete") state.persistentPropStates[roles[id].prop]=true;
    }
    if(target.paths.some(([id,kind])=>id==="engineer"&&kind==="complete")) state.persistentPropStates["maker-rack"]=true;
    if(target.cross) {state.crossMission={version:1,perspectives:target.cross,result:"Продуктовая команда сократила путь в приложении, а команда пространства развела вход и выход. Очередь стала понятнее без спешки у экспоната.",completedAt:at};state.persistentPropStates["square-map"]=true;}
    await db.$transaction(async(tx)=>{
      if(save) await tx.worldSave.update({where:{userId:user.id},data:{state:state as unknown as Prisma.InputJsonValue,worldVersion:WORLD_VERSION,revision:{increment:1}}});
      else await tx.worldSave.create({data:{userId:user.id,state:state as unknown as Prisma.InputJsonValue,worldVersion:WORLD_VERSION,origin}});
      for(const [id,kind] of target.paths) for(const action of (kind==="complete"?["intro","finish"]:["intro"]) as ("intro"|"finish")[]) {
        const event=await tx.worldEvent.create({data:{userId:user.id,eventKey:randomUUID(),kind:`mission:${action}`,payload:{roleId:id,worldVersion:WORLD_VERSION},origin}});
        await tx.uPointEntry.create({data:{userId:user.id,source:"WORLD",nodeId:`world:${id}:${action}`,rewardVersion:1,amount:action==="intro"?25:75,reason:action==="intro"?`Попробована роль «${roles[id].title}»`:`Завершена история «${roles[id].mission}»`,idempotencyKey:`world:${user.id}:${id}:${action}:v1`,worldEventId:event.id}});
      }
      if(target.cross) {
        const event=await tx.worldEvent.create({data:{userId:user.id,eventKey:randomUUID(),kind:"mission:cross",payload:{perspectives:target.cross,worldVersion:WORLD_VERSION},origin}});
        await tx.uPointEntry.create({data:{userId:user.id,source:"WORLD",nodeId:"world:festival-cross",rewardVersion:1,amount:100,reason:"Завершено «Открытие через час»",idempotencyKey:`world:${user.id}:festival-cross:v1`,worldEventId:event.id}});
      }
    });
    console.log(target.email,target.paths.length,target.cross?"cross":"");
  }
}
main().finally(()=>db.$disconnect());
