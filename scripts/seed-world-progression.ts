// Targeted, repeatable fictional histories. Never updates an ordinary account.
import "dotenv/config";
import {randomUUID} from "node:crypto";
import {Prisma,PrismaClient} from "@prisma/client";
import {migrateWorldState,WORLD_VERSION} from "../src/lib/world/model";
import {cosmeticById,questById} from "../src/lib/world/progression";

const parsed=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
const expected=process.env.SHOWCASE_WORLD_DB;
if(process.argv[2]!=="--apply"||!parsed||!expected||!["127.0.0.1","localhost"].includes(parsed.hostname)||parsed.pathname!==`/${expected}`||!(expected.startsWith("leader_")||expected==="world_roles_qa")) throw new Error("Нужны --apply и SHOWCASE_WORLD_DB для локальной БД.");
const db=new PrismaClient();
const origin="WORLD_PROGRESSION_20260928";
const targets=[
  {email:"intake.browser.20260927@candidate.local",items:["lime-hoodie","desk-lamp"],display:["desk-lamp"],completed:["lost-cable"],active:{id:"quiet-table",step:1},postcards:["display"]},
  {email:"sofia@candidate.local",items:["cyan-jacket","round-glasses","leafy-plant"],display:["leafy-plant"],completed:["story-source","missing-view"],active:{id:"sound-check",step:2},postcards:["media","people"]},
  {email:"timur@candidate.local",items:["cream-cap"],display:[],completed:["little-exhibit"],active:null,postcards:["maker"]},
  {email:"ruslan@candidate.local",items:["varsity-jacket","headphones","rocket-figure","cyan-poster"],display:["rocket-figure","cyan-poster"],completed:["prototype-route","feedback-card","evening-map","seating-plan"],active:{id:"sound-check",step:1},postcards:["product","people","urban","square"]},
] as const;
async function main(){
  for(const target of targets){
    const user=await db.user.findUnique({where:{email:target.email},select:{id:true,origin:true,role:true}});
    if(!user||user.role!=="CANDIDATE"||!["SEED","INTAKE_BROWSER_20260927","INTAKE_EXAMPLES_20260927"].includes(user.origin))continue;
    const save=await db.worldSave.findUnique({where:{userId:user.id}});
    if(!save||await db.worldEvent.count({where:{userId:user.id,origin}})>0)continue;
    const state=migrateWorldState(save.state);
    if(state.ownedCosmetics.length||Object.keys(state.sideQuests).length)continue;
    const at=new Date().toISOString();
    const grants=target.completed.map(id=>({kind:"side" as const,id,amount:questById[id].reward,reason:`История «${questById[id].title}»`}));
    const purchases=target.items.map(id=>({kind:"purchase" as const,id,amount:-cosmeticById[id].price,reason:`Предмет «${cosmeticById[id].title}»`}));
    const earned=await db.uPointEntry.aggregate({where:{userId:user.id},_sum:{amount:true}});
    const resulting=(earned._sum.amount??0)+grants.reduce((sum,x)=>sum+x.amount,0)+purchases.reduce((sum,x)=>sum+x.amount,0);
    if(resulting<0){console.log(`skip ${target.email}: insufficient earned U`);continue;}
    for(const id of target.completed) state.sideQuests[id]={step:questById[id].steps.length,choice:0,completedAt:at};
    if(target.active)state.sideQuests[target.active.id]={step:target.active.step,choice:null,completedAt:null};
    state.ownedCosmetics=[...target.items];state.displayedItems=[...target.display];state.postcards=[...target.postcards];
    state.appearance.top=target.items.find(id=>cosmeticById[id].category==="outfit")??null;
    state.appearance.accessory=target.items.find(id=>cosmeticById[id].category==="accessory")??null;
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const latest=await tx.worldSave.findUnique({where:{userId:user.id}});
      if(!latest||latest.revision!==save.revision)throw new Error("World save changed during seed");
      for(const item of [...grants,...purchases]){
        const event=await tx.worldEvent.create({data:{userId:user.id,eventKey:randomUUID(),kind:item.kind==="side"?"world.quest":"world.purchase",payload:{id:item.id,worldVersion:WORLD_VERSION},origin}});
        await tx.uPointEntry.create({data:{userId:user.id,source:item.kind==="side"?"WORLD_SIDE":"WORLD_STORE",nodeId:item.kind==="side"?`side:${item.id}`:`store:${item.id}`,rewardVersion:1,amount:item.amount,reason:item.reason,idempotencyKey:`world:${user.id}:${item.kind==="side"?"side":"purchase"}:${item.id}:v1`,worldEventId:event.id}});
      }
      await tx.worldSave.update({where:{userId:user.id},data:{state:state as unknown as Prisma.InputJsonValue,worldVersion:WORLD_VERSION,revision:{increment:1}}});
    });
    console.log(target.email,`U ${resulting}`,target.completed.length,"stories",target.items.length,"items");
  }
}
main().finally(()=>db.$disconnect());
