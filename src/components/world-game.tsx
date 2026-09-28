"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Interaction, WorldRuntime } from "@/world/runtime";
import {
  objective,
  type WorldChoice,
  type WorldEventKind,
  type WorldScene,
  type WorldState,
} from "@/lib/world/model";
import {
  dialogueFor,
  choiceConsequences,
  type DialogueEffect,
  type DialogueSpec,
} from "@/lib/world/dialogues";
import "./world-game.css";
import { districtScenes, zones } from "@/lib/world/scenes";
import { npcById } from "@/lib/world/npcs";

type Snapshot = {
  userId: string;
  state: WorldState;
  revision: number;
  points: number;
};
const pendingKey = (userId: string) => `invision-world-pending:${userId}`;
class WorldRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api(body: Record<string, unknown>): Promise<Snapshot> {
  const response = await fetch("/api/world", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.ok)
    throw new WorldRequestError(
      data.error || "Не удалось сохранить мир.",
      response.status,
    );
  return data.data;
}
export default function WorldGame() {
  const router = useRouter(),
    host = useRef<HTMLDivElement>(null),
    game = useRef<WorldRuntime | null>(null);
  const saved = useRef<Snapshot | null>(null),
    busy = useRef(false);
  const actionRef = useRef<(p: Interaction) => void>(() => {});
  const performRef = useRef<(effect: DialogueEffect) => void>(() => {});
  const retryRef = useRef<() => boolean>(() => false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<
      "loading" | "entering" | "playing" | "zone" | "error"
    >("loading"),
    [error, setError] = useState("Не удалось загрузить мир");
  const [near, setNear] = useState<Interaction | null>(null),
    [dialogue, setDialogue] = useState<DialogueSpec | null>(null),
    [page, setPage] = useState(0),
    [optionIndex, setOptionIndex] = useState(0);
  const [menu, setMenu] = useState(false),
    [help, setHelp] = useState(false),
    [mapOpen,setMapOpen] = useState(false),
    [zoneProgress,setZoneProgress] = useState(0),
    [touch, setTouch] = useState(false),
    [reduced, setReduced] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "offline">("saved"),
    [notice, setNotice] = useState(""),
    [scene, setScene] = useState<WorldScene>("square");
  const update = (value: Snapshot) => {
    saved.current = value;
    setSnapshot(value);
    game.current?.setState(value.state);
    setStatus("saved");
  };
  const show = (value: DialogueSpec) => {
    setDialogue(value);
    setPage(0);
    setOptionIndex(0);
    game.current?.setPaused(true);
  };
  const close = () => {
    setDialogue(null);
    game.current?.setPaused(false);
  };
  const move = useCallback(async (): Promise<Snapshot | null> => {
    const current = saved.current,
      runtime = game.current;
    if (!current || !runtime || busy.current) return current;
    const p = runtime.position();
    if (
      p.scene === current.state.scene &&
      Math.hypot(p.x - current.state.x, p.y - current.state.y) < 24
    )
      return current;
    busy.current = true;
    setStatus("saving");
    try {
      const next = await api({
        type: "world.move",
        revision: current.revision,
        ...p,
      });
      const merged = { ...current, ...next };
      update(merged);
      return merged;
    } catch (e) {
      if (e instanceof WorldRequestError && e.status === 409) {
        try {
          update(await api({ type: "world.get" }));
        } catch {
          setStatus("offline");
        }
      } else if (e instanceof WorldRequestError) {
        game.current?.setState(current.state);
        setStatus("saved");
      } else setStatus("offline");
      setNotice(
        e instanceof Error ? e.message : "Не удалось сохранить позицию",
      );
      return null;
    } finally {
      busy.current = false;
    }
  }, []);
  const emit = async (
    kind: WorldEventKind,
    choice?: WorldChoice,
    retryKey?: string,
  ): Promise<boolean> => {
    const key = retryKey ?? crypto.randomUUID();
    setStatus("saving");
    const current = await move();
    if (!current) return false;
    try {
      const next = await api({
        type: "world.event",
        revision: current.revision,
        kind,
        choice,
        eventKey: key,
      });
      update({
        ...current,
        ...next,
        points:
          current.points +
          (kind === "finish" && !current.state.flags.completed ? 60 : 0),
      });
      if (kind === "finish") setNotice("Событие завершено · +60 U");
      return true;
    } catch (e) {
      if (e instanceof WorldRequestError && e.status === 409) {
        try {
          update(await api({ type: "world.get" }));
        } catch {
          setStatus("offline");
        }
      } else if (!(e instanceof WorldRequestError)) {
        setStatus("offline");
        localStorage.setItem(
          pendingKey(current.userId),
          JSON.stringify({ kind, choice, key }),
        );
      }
      setNotice(
        e instanceof Error ? e.message : "Не удалось сохранить действие",
      );
      return false;
    }
  };
  useEffect(() => {
    retryRef.current = () => {
      const userId = saved.current?.userId;
      if (!userId) return false;
      const key = pendingKey(userId);
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      localStorage.removeItem(key);
      try {
        const p = JSON.parse(raw) as {
          kind: WorldEventKind;
          choice?: WorldChoice;
          key: string;
        };
        void emit(p.kind, p.choice, p.key);
      } catch {
        setNotice("Не удалось восстановить последнее действие.");
      }
      return true;
    };
  });
  const travel = async (next: WorldScene) => {
    const current = await move();
    if (!current) return;
    try {
      const result = await api({
        type: "world.move",
        revision: current.revision,
        scene: next,
        x: 0,
        y: 0,
      });
      update({ ...current, ...result });
      setZoneProgress(0);
      setPhase("zone");
      game.current?.travel(next);
      setScene(next);
      if (next === "cafe")
        setTimeout(() => {
          void emit("visit_cafe");
        }, 400);
    } catch (e) {
      setStatus("offline");
      setNotice(e instanceof Error ? e.message : "Не удалось перейти");
    }
  };
  const explore = async (targetId:string, exploreAction:"meet"|"deeper"|"toggle"|"discover") => {
    const current=await move();
    if(!current) return false;
    try {
      setStatus("saving");
      const result=await api({type:"world.explore",revision:current.revision,targetId,exploreAction,eventKey:crypto.randomUUID()});
      update({...current,...result});
      return true;
    } catch(e) {
      if(e instanceof WorldRequestError && e.status===409) update(await api({type:"world.get"}));
      else setStatus("offline");
      setNotice(e instanceof Error?e.message:"Не удалось сохранить действие");
      return false;
    }
  };
  const perform = (effect: DialogueEffect) => {
    close();
    if (effect.kind === "travel") {
      void travel(effect.scene);
      return;
    }
    if (effect.kind === "event") {
      void emit(effect.event, effect.choice).then((ok) => {
        if (ok && effect.event === "choose" && effect.choice)
          show({
            speaker: "Твоё решение",
            pages: [choiceConsequences[effect.choice]],
            done: { kind: "close" },
          });
      });
    } else if(effect.kind==="explore") {
      void explore(effect.targetId,effect.action).then((ok)=>{
        if(!ok) return;
        const npc=npcById[effect.targetId];
        const prop=zones[saved.current!.state.scene].props.find((item)=>item.id===effect.targetId);
        if(effect.action==="deeper" && npc) show({speaker:npc.name,portrait:npc.portrait,pages:[npc.deeper,npc.exit]});
        if(effect.action==="toggle" && prop?.activeText) show({speaker:prop.label,pages:[prop.activeText]});
      });
    }
  };
  useEffect(() => {
    performRef.current = perform;
  });
  const interact = (point: Interaction) => {
    const state = saved.current?.state;
    if (!state) return;
    if (point.id === "square-door") {
      void travel("square");
      return;
    }
    if(point.id==="square-map") {setMapOpen(true);return;}
    show(dialogueFor(point.id, point.name, state));
    if(npcById[point.id] && ["saniya","aruzhan","timur","dana","amir"].includes(point.id) && !state.npcMemoryFlags[`met:${point.id}`])
      void explore(point.id,"meet");
  };
  useEffect(() => {
    actionRef.current = interact;
  });
  useEffect(() => {
    let dead = false;
    async function start() {
      try {
        const initial = await api({ type: "world.get" });
        if (dead) return;
        update(initial);
        setScene(initial.state.scene);
        setProgress(20);
        setTouch(matchMedia("(pointer: coarse)").matches);
        setReduced(matchMedia("(prefers-reduced-motion: reduce)").matches);
        const runtimeModule = await import("@/world/runtime");
        if (dead || !host.current) return;
        setProgress(25);
        game.current = runtimeModule.mountWorld(host.current, initial.state, {
          progress: setProgress,
          ready: () => {
            if (dead) return;
            setPhase((current)=>current==="zone" || current==="playing" || matchMedia("(prefers-reduced-motion: reduce)").matches ? "playing":"entering");
            setTimeout(() => {if(!dead) setPhase("playing");},300);
            setTimeout(() => {
              if (!dead) retryRef.current();
            }, 400);
          },
          interact: (p) => actionRef.current(p),
          nearby: setNear,
          escape: () => setMenu((v) => !v),
          scene: setScene,
          zoneLoading:(_zone,value)=>setZoneProgress(value),
          error: (message) => {
            setError(message);
            setPhase("error");
          },
        });
      } catch (e) {
        if (!dead) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить мир");
          setPhase("error");
        }
      }
    }
    void start();
    const timer = setInterval(() => {
      if (!dead) void move();
    }, 8000);
    return () => {
      dead = true;
      clearInterval(timer);
      game.current?.destroy();
      game.current = null;
    };
  }, [move]);
  useEffect(() => {
    game.current?.setPaused(Boolean(dialogue || menu || help || mapOpen || phase==="zone"));
  }, [dialogue, menu, help, mapOpen, phase]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dialogue) {
          e.preventDefault();
          close();
        } else if (help) setHelp(false);
        else if (mapOpen) setMapOpen(false);
        else if (menu) setMenu(false);
        return;
      }
      if((e.key==="m" || e.key==="M") && !dialogue && !menu && !help){e.preventDefault();setMapOpen(v=>!v);return;}
      if (!dialogue) return;
      if (
        dialogue.options &&
        page === dialogue.pages.length - 1 &&
        (e.key === "ArrowDown" || e.key === "ArrowUp")
      ) {
        e.preventDefault();
        setOptionIndex(
          (v) =>
            (v + (e.key === "ArrowDown" ? 1 : -1) + dialogue.options!.length) %
            dialogue.options!.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (page < dialogue.pages.length - 1) setPage((v) => v + 1);
        else if (dialogue.options?.length)
          performRef.current(dialogue.options[optionIndex].effect);
        else performRef.current(dialogue.done ?? { kind: "close" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialogue, page, optionIndex, help, menu, mapOpen]);
  useEffect(() => {
    const online = () => {
      if (!retryRef.current()) void move();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [move]);
  const leave = async () => {
    await move();
    game.current?.destroy();
    game.current = null;
    router.push("/my?view=route");
  };
  return (
    <div className="world-game">
      <div
        className="world-canvas"
        ref={host}
        aria-label={`Игровая карта: ${zones[scene].title}`}
      />
      {(phase === "loading" || phase === "entering") && (
        <div
          className={
            "world-loading" +
            (reduced ? " reduced" : "") +
            (phase === "entering" ? " entering" : "")
          }
          role="status"
        >
          <div className="world-planet">
            <Image
              className="world-planet-outline"
              unoptimized
              src="/world/art/planet.webp"
              width={256}
              height={256}
              alt="Планета inVision World"
            />
            <Image
              className="world-planet-colour"
              unoptimized
              src="/world/art/planet.webp"
              width={256}
              height={256}
              alt=""
              style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }}
            />
          </div>
          <h1>inVision World</h1>
          <p>Собираем Campus Square</p>
          <div className="world-meter">
            <span style={{ width: progress + "%" }} />
          </div>
          <strong>{progress}%</strong>
          <button onClick={() => void leave()}>Вернуться в Мой путь</button>
        </div>
      )}
      {phase === "error" && (
        <div className="world-loading" role="alert">
          <h1>{error}</h1>
          <button onClick={() => location.reload()}>Повторить</button>
          <button onClick={() => void leave()}>Вернуться в Мой путь</button>
        </div>
      )}
      {phase === "zone" && <div className="world-zone-loading" role="status"><strong>{zones[scene].title}</strong><span>Открываем район · {zoneProgress}%</span><div className="world-meter"><span style={{width:`${zoneProgress}%`}} /></div></div>}
      {phase === "playing" && (
        <>
          <div className="world-hud">
            <div>
              <small>
                {zones[scene].title.toUpperCase()}
              </small>
              <strong>
                {snapshot && (scene==="square" || scene==="cafe") ? objective(snapshot.state) : "Исследуй пространство"}
              </strong>
            </div>
            <div className="world-hud-right">
              <span>✦ {snapshot?.points ?? 0} U</span>
              <button aria-label="Карта кампуса" onClick={() => setMapOpen(true)}>▣</button>
              <button aria-label="Открыть меню" onClick={() => setMenu(true)}>
                ☰
              </button>
            </div>
          </div>
          {near && !dialogue && !menu && (
            <button
              className="world-prompt"
              onClick={() => actionRef.current(near)}
            >
              <kbd>E</kbd> {near.name}
            </button>
          )}
          <div className={"world-save " + status}>
            {status === "saved"
              ? "Сохранено"
              : status === "saving"
                ? "Сохраняется"
                : "Нет соединения · повторим сохранение"}
          </div>
          {notice && (
            <button className="world-notice" onClick={() => setNotice("")}>
              {notice} ×
            </button>
          )}
          {touch && (
            <div className="world-touch">
              <div className="world-dpad" aria-label="Движение">
                {(
                  [
                    ["up", "↑", 0, -1],
                    ["left", "←", -1, 0],
                    ["down", "↓", 0, 1],
                    ["right", "→", 1, 0],
                  ] as const
                ).map(([cl, label, x, y]) => (
                  <button
                    key={cl}
                    className={cl}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      game.current?.setTouch(x, y, false);
                    }}
                    onPointerUp={() => game.current?.setTouch(0, 0, false)}
                    onPointerCancel={() => game.current?.setTouch(0, 0, false)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="world-touch-action"
                disabled={!near}
                onClick={() => near && actionRef.current(near)}
              >
                Действие
              </button>
            </div>
          )}
        </>
      )}
      {dialogue && phase === "playing" && (
        <div className="world-dialogue-wrap">
          <div
            className="world-dialogue"
            role="dialog"
            aria-modal="true"
            aria-label={"Разговор: " + dialogue.speaker}
          >
            <div className="world-speaker">
              {dialogue.portrait && (
                <Image
                  unoptimized
                  src={"/world/art/" + dialogue.portrait + "-portrait.webp"}
                  width={128}
                  height={128}
                  alt=""
                />
              )}
              <div>
                <small>РАЗГОВОР</small>
                <strong>{dialogue.speaker}</strong>
              </div>
              <button aria-label="Закрыть разговор" onClick={close}>
                ×
              </button>
            </div>
            <p>{dialogue.pages[page]}</p>
            {page < dialogue.pages.length - 1 ? (
              <button
                className="world-next"
                onClick={() => setPage((v) => v + 1)}
              >
                Дальше
              </button>
            ) : dialogue.options ? (
              <div className="world-options">
                {dialogue.options.map((o, index) => (
                  <button
                    key={o.label}
                    className={index === optionIndex ? "selected" : ""}
                    onClick={() => perform(o.effect)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                className="world-next"
                onClick={() => perform(dialogue.done ?? { kind: "close" })}
              >
                Понятно
              </button>
            )}
          </div>
        </div>
      )}
      {menu && (
        <div
          className="world-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Меню"
        >
          <div className="world-menu">
            <h2>inVision World</h2>
            <button onClick={() => setMenu(false)}>Продолжить</button>
            <button onClick={() => {setMenu(false);setMapOpen(true);}}>Карта кампуса</button>
            <button
              onClick={() => {
                setMenu(false);
                setHelp(true);
              }}
            >
              Управление и настройки
            </button>
            <button onClick={() => void leave()}>Мой путь</button>
            <small>
              {status === "saved"
                ? "Прогресс сохранён"
                : "Проверь соединение перед выходом"}
            </small>
          </div>
        </div>
      )}
      {help && (
        <div
          className="world-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Управление"
        >
          <div className="world-menu">
            <h2>Управление</h2>
            <p>WASD или стрелки: идти. E или Enter: действие. M: карта. Esc: меню.</p>
            <p>На сенсорном экране используй стрелки и кнопку действия.</p>
            <p>В этой зоне звук не используется.</p>
            <button onClick={() => setHelp(false)}>Вернуться в мир</button>
          </div>
        </div>
      )}
      {mapOpen && <div className="world-overlay" role="dialog" aria-modal="true" aria-label="Карта кампуса"><div className="world-menu world-map"><div className="world-map-head"><h2>Карта кампуса</h2><button onClick={()=>setMapOpen(false)} aria-label="Закрыть карту">×</button></div><p>Дорожки ведут из Campus Square в пять районов. Карта не переносит персонажа.</p><div className="world-map-layout"><div className="world-map-square">Campus<br/>Square</div>{districtScenes.map((id)=>{const visited=snapshot?.state.visitedDistricts.includes(id);const here=scene===id || scene===`${id}-room`;return <div key={id} className={`world-map-place ${id} ${here?"here":""}`}><strong>{zones[id].title}</strong><span>{here?"Ты здесь":visited?"Посещено":"Не исследовано"}</span></div>})}</div><button onClick={()=>setMapOpen(false)}>Вернуться в мир</button></div></div>}
    </div>
  );
}
