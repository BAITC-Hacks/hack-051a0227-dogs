"use client";
import { useState } from "react";
import Image from "next/image";
import { npcCast } from "@/lib/world/npcs";
import { roleIds, roles } from "@/lib/world/missions";
import { districtScenes, zones } from "@/lib/world/scenes";
import type { WorldState } from "@/lib/world/model";
import { postcards, sideQuests } from "@/lib/world/progression";

export default function WorldJournal({state,onClose,onReflection}:{state:WorldState;onClose:()=>void;onReflection:(text:string)=>Promise<string|null>}) {
  const [reflection,setReflection]=useState(state.reflection),[notice,setNotice]=useState("");
  const started=roleIds.filter((id)=>state.roles[id]?.introAt);
  const people=npcCast.filter((npc)=>state.npcMemoryFlags[`met:${npc.id}`]);
  return <div className="world-overlay" role="dialog" aria-modal="true" aria-label="Журнал ролей"><div className="world-journal">
    <header><div><small>ЛИЧНЫЙ ЖУРНАЛ</small><h2>Festival of Ideas</h2></div><button type="button" onClick={onClose} aria-label="Закрыть журнал">×</button></header>
    <div className="world-journal-grid">
      <section><h3>Люди</h3>{people.length?<ul>{people.map((npc)=><li key={npc.id}><strong>{npc.name}</strong><span>{npc.role}</span></li>)}</ul>:<p>Поговори с участниками на площади или в районах.</p>}</section>
      <section><h3>Места</h3>{state.visitedDistricts.length?<ul>{districtScenes.filter((id)=>state.visitedDistricts.includes(id)).map((id)=><li key={id}><strong>{zones[id].title}</strong><span>Ты был здесь</span></li>)}</ul>:<p>Пять дорожек ведут от Campus Square в районы команд.</p>}</section>
      <section className="world-journal-roles"><h3>Роли</h3>{started.length?<div>{started.map((id)=>{
        const progress=state.roles[id]!;
        const firstRun=progress.history[0]?.final??progress.final;
        return <article key={id}><div className="world-journal-role-heading"><Image src={`/world/art/mission-${id}.webp`} width={52} height={52} alt="" unoptimized/><div><strong>{roles[id].title}</strong><span>{progress.completedAt?"История завершена":progress.stage==="revision"?"Первая версия испытана":"Ты начал знакомство"}</span></div></div>{firstRun&&<><small>ПЕРВОЕ ЗАВЕРШЕНИЕ · ЧТО ПОЛУЧИЛОСЬ</small><p>{firstRun.consequence}</p><small>ЧТО ПОКАЗАЛА ПРОВЕРКА</small><p>{firstRun.observation}</p></>}{progress.deeperResult&&<p>{progress.deeperResult}</p>}{progress.replayCount>0&&<small>Других прохождений: {progress.replayCount}</small>}<a href="https://www.invisionu.education/undergraduate" target="_blank" rel="noreferrer">О программе: {roles[id].program}</a></article>;
      })}</div>:<p>Аида ждёт у прототипа Maker Yard, Аян — в Product Garage. Выбери, с кем поговорить первым.</p>}</section>
      <section><h3>Фестиваль</h3><p>{state.flags.completed?"Площадь готова к открытию. Команды продолжают менять свои проекты.":"Команды готовят Festival of Ideas. На площади можно помочь Сание с общим показом."}</p><p>{state.crossMission?.result??"После первой истории роли у карты площади можно соединить два взгляда на очередь гостей."}</p></section>
      <section className="world-journal-roles"><h3>Галерея результатов</h3><p>Здесь остаются выбранные версии учебных работ. Они не передаются комиссии.</p><div className="world-journal-artifacts">{roleIds.filter(id=>state.roles[id]?.final || state.roles[id]?.history?.length).map(id=><article key={id}><Image src={`/world/art/mission-${id}.webp`} width={86} height={86} alt="" unoptimized/><div><strong>{roles[id].mission}</strong><p>{(state.roles[id]?.history?.at(-1)?.final??state.roles[id]?.final)?.consequence}</p></div></article>)}</div>{!roleIds.some(id=>state.roles[id]?.final || state.roles[id]?.history?.length)&&<p>Заверши историю роли, и её результат появится здесь.</p>}</section>
      <section><h3>Истории кампуса</h3>{sideQuests.filter(q=>state.sideQuests[q.id]?.completedAt).length?<ul>{sideQuests.filter(q=>state.sideQuests[q.id]?.completedAt).map(q=><li key={q.id}><strong>{q.title}</strong><span>{q.steps.at(-1)?.story} {q.endings[state.sideQuests[q.id]?.choice??0]}</span></li>)}</ul>:<p>Небольшие истории начинаются с разговоров в районах.</p>}<h3>Открытки</h3>{state.postcards.length?<ul>{state.postcards.map(id=>postcards[id]&&<li key={id}><strong>{postcards[id].title}</strong><span>{postcards[id].source??"История кампуса"} · {postcards[id].detail}</span></li>)}</ul>:<p>Исследуй кампус и помогай командам.</p>}</section>
      {started.some(id=>state.roles[id]?.completedAt)&&<section className="world-journal-roles"><h3>Что я заметил</h3><p>Личная заметка о большой истории. Её можно пропустить или изменить позже.</p><textarea aria-label="Личная заметка" maxLength={800} rows={4} value={reflection} onChange={event=>setReflection(event.target.value)}/><button type="button" onClick={()=>void onReflection(reflection).then(result=>setNotice(result??"Не удалось сохранить заметку."))}>Сохранить заметку</button>{notice&&<p role="status">{notice}</p>}</section>}
    </div><button className="world-journal-close" onClick={onClose}>Вернуться в мир</button>
  </div></div>;
}
