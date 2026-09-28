"use client";
import "./skill-tree.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioCapture } from "@/lib/audio-capture";
import { action } from "@/lib/client";
import { skillBranches, skillDomains, skillHref, type SkillDomainId, type SkillNode } from "@/lib/skill-tree-catalog";
import type { SkillView } from "@/lib/skill-tree.server";
import { ArrowRight, Check, Coins, LockKeyhole, Mic, RotateCcw, Square } from "lucide-react";
import { roleIds, roles } from "@/lib/world/missions";

export function SkillTree({ initial, selectedId }: { initial: SkillView; selectedId?: string }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const first = initial.nodes.find((n) => n.id === selectedId) ?? initial.nodes.find((n) => n.id === initial.recommendedId)!;
  const [domain, setDomain] = useState<SkillDomainId>(first.domain);
  const [branch, setBranch] = useState(first.branch);
  const [selected, setSelected] = useState(first.id);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const item = initial.nodes.find((n) => n.id === selectedId);
    if (!item) return;
    const frame = requestAnimationFrame(() => { setDomain(item.domain); setBranch(item.branch); setSelected(item.id); });
    return () => cancelAnimationFrame(frame);
  }, [initial.nodes, selectedId]);
  const node = view.nodes.find((n) => n.id === selected)!;
  const branchNodes = view.nodes.filter((n) => n.domain === domain && n.branch === branch);
  const selectedDomain = view.domains.find((d) => d.id === domain)!;
  const continuation=view.nodes.find(n=>n.domain===node.domain&&n.id!==node.id&&n.state==="available")??view.nodes.find(n=>n.state==="available"&&n.id!==node.id);
  function choose(id: string) {
    const next = view.nodes.find((n) => n.id === id)!;
    setDomain(next.domain); setBranch(next.branch); setSelected(id);
    window.history.replaceState(null, "", skillHref(id));
    requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
  }
  async function reload() { setView(await action<SkillView>("skill.view")); router.refresh(); }
  return <section className="skill-v2" aria-label="Дерево навыков">
    <header className="skill-v2-head"><div><span className="eyebrow">Личное развитие</span><h2>Древо навыков</h2><p>Выбирай ветвь, пробуй новые ситуации и сохраняй свои решения.</p></div><div className="skill-v2-balance"><Coins size={20} aria-hidden="true"/><strong>{view.balance} U</strong><small>Твой баланс</small></div></header>
    <div className="skill-v2-roots" aria-label="Направления">
      {view.domains.map((d, index) => <button key={d.id} className={`skill-v2-root root-${index}`} aria-pressed={domain === d.id} onClick={() => { setDomain(d.id); const target = view.nodes.find((n) => n.id === d.nextId) ?? view.nodes.find((n) => n.domain === d.id)!; setBranch(target.branch); choose(target.id); }}>
        <span className="skill-v2-root-symbol" aria-hidden="true">{["✳", "◌", "✦", "Aa"][index]}</span><span><strong>{d.title}</strong><small>{d.done} из {d.total} шагов</small></span><span className="skill-v2-root-progress"><i style={{ width: `${d.done / d.total * 100}%` }}/></span><span className="skill-v2-root-next">{d.nextId ? <><span>Дальше: {d.nextTitle}</span><b>+{view.nodes.find((n) => n.id === d.nextId)?.reward} U</b></> : "Все шаги пройдены"}</span>
      </button>)}
    </div>
    {view.ledger.length>0&&<div className="skill-v2-recap"><strong>За последнее время</strong><div>{view.ledger.slice(0,3).map(entry=><span key={entry.id}>{entry.reason} <b>{entry.amount>0?"+":""}{entry.amount} U</b></span>)}</div></div>}
    <div className="skill-v2-stage">
      <div className="skill-v2-map"><div className="skill-v2-map-head"><div><span className="eyebrow">Выбранное направление</span><h3>{selectedDomain.title}</h3><p>{selectedDomain.intro}</p></div><span className="skill-v2-smallcount">{selectedDomain.done}/{selectedDomain.total}</span></div>
        <div className="skill-v2-branch-layout"><div className="skill-v2-trunk" aria-hidden="true"><span>{skillDomains.findIndex((d) => d.id === domain) === 3 ? "Aa" : "✳"}</span></div><div className="skill-v2-branches" aria-label="Ветви">
          {skillBranches[domain].map((name) => { const own = view.nodes.filter((n) => n.domain === domain && n.branch === name); return <button key={name} aria-pressed={branch === name} onClick={() => { setBranch(name); const next = own.find((n) => n.state === "in_progress" || n.state === "available") ?? own[0]; choose(next.id); }}><span className="skill-v2-branch-dot" aria-hidden="true"/><span>{name}</span><small>{own.filter((n) => n.state === "completed").length}/{own.length}</small></button>; })}
        </div><div className="skill-v2-node-path" aria-label={`Шаги ветви ${branch}`}>
          <span className="skill-v2-path-label">{branch}</span>{branchNodes.map((n, index) => <button key={n.id} className={`skill-v2-node ${n.state} ${n.id === node.id ? "selected" : ""}`} aria-current={n.id === node.id ? "step" : undefined} onClick={() => choose(n.id)}><span className="skill-v2-node-orb">{n.state === "completed" ? <Check size={21}/> : n.state === "locked" ? <LockKeyhole size={18}/> : String(index + 1).padStart(2, "0")}</span><span><strong>{n.title}</strong><small>{n.state === "completed" ? "Завершено" : n.state === "in_progress" ? "В работе" : n.state === "locked" ? "Откроется после предыдущего шага" : `+${n.reward} U`}</small></span><ArrowRight size={17} aria-hidden="true"/></button>)}</div></div>
      </div>
      <div className="skill-v2-detail"><span className="eyebrow">{node.branch} · шаг {node.tier}</span><h3 tabIndex={-1} ref={title}>{node.title}</h3><p className="skill-v2-prompt">{node.prompt}</p><div className="skill-v2-meta"><span>{activityLabel(node.type)}</span><span>+{node.reward} U</span>{node.optional && <span>По желанию</span>}</div>{node.state === "locked" ? <p className="skill-v2-locked"><LockKeyhole size={18}/> Заверши предыдущий шаг: {node.prerequisites.map((id) => view.nodes.find((n) => n.id === id)?.title).join(", ")}.</p> : <SkillActivity key={node.id} node={node} saved={node.latest?.response} completed={node.state === "completed"} reload={reload}/>} {node.state==="completed"&&continuation&&<button className="skill-v2-continue" onClick={()=>choose(continuation.id)}>Попробовать дальше: {continuation.title} <ArrowRight size={16}/></button>}
      </div>
    </div>
    <p className="skill-v2-foot">Прогресс показывает выполненные учебные шаги. Он не меняет оценку заявки.</p>
  </section>;
}
function activityLabel(type: SkillNode["type"]) { return ({ VIDEO: "Видео и вопрос", READING: "Чтение", QUIZ: "Короткий вопрос", BRANCHING_SCENARIO: "Ситуация с поворотом", REFLECTION: "Размышление", TEXT_RESPONSE: "Письменный ответ", AUDIO_RESPONSE: "Устный ответ", SORTING: "Расставь шаги", DIALOGUE: "Диалог", SUBMISSION: "Личная работа", WORLD_MISSION: "Игровое событие" })[type]; }
function SkillActivity({ node, saved, completed, reload }: { node: SkillView["nodes"][number]; saved?: { choice?: string; followup?: string; text?: string; order?: string[]; mediaId?: string } | null; completed: boolean; reload: () => Promise<void> }) {
  const [choice, setChoice] = useState(saved?.choice ?? "");
  const [followup, setFollowup] = useState(saved?.followup ?? "");
  const [answer, setAnswer] = useState(saved?.text ?? "");
  const [order, setOrder] = useState<string[]>(saved?.order ?? node.items?.map((i) => i.id) ?? []);
  const [mediaId, setMediaId] = useState(saved?.mediaId ?? "");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [retry, setRetry] = useState(false);
  async function submit(type: "skill.save" | "skill.complete") {
    setBusy(true); setNotice("");
    try { const result = await action<{ complete: boolean; message: string; earned: number }>(type, { nodeId: node.id, response: { choice: choice || undefined, followup: followup || undefined, text: answer || undefined, order: node.type === "SORTING" ? order : undefined, mediaId: mediaId || undefined }, requestKey: crypto.randomUUID() }); setNotice(result.message + (result.earned ? ` +${result.earned} U` : "")); if (result.complete) { setRetry(false); await reload(); } }
    catch (error) { setNotice(error instanceof Error ? error.message : "Не удалось сохранить ответ."); }
    finally { setBusy(false); }
  }
  return <div className="skill-v2-activity">
    {node.type === "WORLD_MISSION" ? <div className="skill-v2-actions"><a className="button primary" href={(() => { const role=roleIds.find((id)=>roles[id].skillNode===node.id); return role?`/world?mission=${role}&returnTo=${node.id}`:`/world?returnTo=${node.id}`; })()}>{completed ? "Вернуться в inVision World" : "Пройти в inVision World"}<ArrowRight size={17}/></a></div> : null}
    {completed && !retry && <div className="skill-v2-done"><Check size={18}/> Шаг завершён. Ответ сохранён в личном дереве.</div>}
    {node.passage && <blockquote className="skill-v2-passage">{node.passage}</blockquote>}
    {node.type === "VIDEO" && <div className="skill-v2-video"><video controls preload="metadata" playsInline aria-label="История про обмен книгами"><source src={node.mediaSrc} type="video/mp4"/><track kind="captions" src="/media/skill-listen.en.vtt" srcLang="en" label="English" default/></video><details><summary>Текст записи</summary><p lang="en">{node.mediaTranscript}</p></details></div>}
    {node.choices && <fieldset className="skill-v2-choices" disabled={completed && !retry}><legend>{["QUIZ", "READING", "VIDEO"].includes(node.type) ? "Выбери ответ" : "Первое решение"}</legend>{node.choices.map((c) => <label key={c.id} className={choice === c.id ? "chosen" : ""}><input type="radio" name={`${node.id}-choice`} value={c.id} checked={choice === c.id} onChange={() => { setChoice(c.id); setFollowup(""); }}/><span>{c.label}</span></label>)}</fieldset>}
    {choice && node.followup && <fieldset className="skill-v2-choices" disabled={completed && !retry}><legend>{node.followup.prompt}</legend>{node.followup.choices.map((c) => <label key={c.id} className={followup === c.id ? "chosen" : ""}><input type="radio" name={`${node.id}-followup`} value={c.id} checked={followup === c.id} onChange={() => setFollowup(c.id)}/><span>{c.label}</span></label>)}</fieldset>}
    {node.type === "SORTING" && <div className="skill-v2-sort"><p>Меняй порядок кнопками. На клавиатуре используй Tab и Enter.</p>{order.map((id, index) => <div key={id}><span>{index + 1}</span><strong>{node.items!.find((item) => item.id === id)?.label}</strong><button type="button" aria-label={`Поднять шаг ${index + 1}`} disabled={index === 0 || completed && !retry} onClick={() => setOrder((prior) => { const next = [...prior]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button type="button" aria-label={`Опустить шаг ${index + 1}`} disabled={index === order.length - 1 || completed && !retry} onClick={() => setOrder((prior) => { const next = [...prior]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>↓</button></div>)}</div>}
    {["REFLECTION", "TEXT_RESPONSE", "SUBMISSION"].includes(node.type) && <label className="skill-v2-text">Твой ответ<textarea value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={completed && !retry} rows={6} placeholder="Начни с конкретного действия или наблюдения"/><small>От {node.minWords} слов. Смысл не оценивается автоматически.</small></label>}
    {node.type === "AUDIO_RESPONSE" && <SkillAudio nodeId={node.id} mediaId={mediaId} onSaved={setMediaId}/>}
    {notice && <p className="skill-v2-notice" role="status">{notice}</p>}
    {node.type !== "WORLD_MISSION" && <div className="skill-v2-actions">{!completed || retry ? <><button type="button" className="button primary" disabled={busy} onClick={() => submit("skill.complete")}>{busy ? "Сохраняем…" : "Завершить шаг"}<ArrowRight size={17}/></button>{["REFLECTION", "TEXT_RESPONSE", "SUBMISSION"].includes(node.type) && <button type="button" className="button secondary" disabled={busy} onClick={() => submit("skill.save")}>Сохранить черновик</button>}</> : <button type="button" className="button secondary" onClick={() => setRetry(true)}><RotateCcw size={16}/> Попробовать ещё</button>}</div>}
  </div>;
}
function SkillAudio({ nodeId, mediaId, onSaved }: { nodeId: string; mediaId: string; onSaved: (id: string) => void }) {
  const capture = useRef<AudioCapture | null>(null); const [recording, setRecording] = useState(false); const [blob, setBlob] = useState<Blob | null>(null); const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => () => { capture.current?.dispose(); if (url) URL.revokeObjectURL(url); }, [url]);
  async function start() { setError(""); try { const session = new AudioCapture({ buffer: () => {}, complete: (next) => { setBlob(next); setUrl(URL.createObjectURL(next)); setRecording(false); onSaved(""); }, error: (e) => { setError(e.message); setRecording(false); } }); capture.current = session; await session.start(); setRecording(true); } catch (e) { setError(e instanceof Error ? e.message : "Микрофон недоступен."); } }
  async function upload() { if (!blob) return; setBusy(true); try { const form = new FormData(); form.append("nodeId", nodeId); form.append("file", blob, "answer.webm"); const result = await fetch("/api/development/audio", { method: "POST", body: form }); const data = await result.json(); if (!result.ok) throw new Error(data.error ?? "Не удалось сохранить запись."); onSaved(data.data.id); setBlob(null); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить запись."); } finally { setBusy(false); } }
  return <div className="skill-v2-audio"><p>Запись остаётся личной. Для этого шага не запускается распознавание или оценка речи.</p><div className="skill-v2-actions">{recording ? <button type="button" className="button secondary" onClick={() => capture.current?.stop()}><Square size={16}/> Остановить</button> : <button type="button" className="button secondary" onClick={start}><Mic size={16}/> {mediaId || blob ? "Записать ещё раз" : "Записать ответ"}</button>}{blob && <button type="button" className="button primary" disabled={busy} onClick={upload}>{busy ? "Сохраняем…" : "Сохранить запись"}</button>}</div>{(url || mediaId) && <audio controls src={url || `/api/development/audio/${mediaId}`} aria-label="Прослушать свой ответ"/>}{mediaId && <p><Check size={15}/> Запись сохранена</p>}{error && <p role="alert">{error}</p>}</div>;
}
