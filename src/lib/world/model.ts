import { openingQuest } from "./quest";
import { districtScenes, interiorScenes, zones } from "./scenes";
export const WORLD_VERSION = 2;
export const WORLD_REWARD = 60;
export type WorldScene = "square" | "cafe" | "maker" | "maker-room" | "garage" | "garage-room" | "people" | "people-room" | "urban" | "urban-room" | "house" | "house-room";
export type WorldChoice = "repair" | "delegate" | "relocate";
export type WorldEventKind =
  | "coordinator"
  | "board"
  | "aruzhan"
  | "timur"
  | "dana"
  | "amir"
  | "crate"
  | "display"
  | "choose"
  | "deliver"
  | "finish"
  | "visit_cafe";
export type WorldState = {
  version: number;
  scene: WorldScene;
  x: number;
  y: number;
  avatar: string;
  flags: {
    coordinator: boolean;
    board: boolean;
    talks: string[];
    crate: boolean;
    display: boolean;
    choice: WorldChoice | null;
    delivered: boolean;
    completed: boolean;
    cafeVisited: boolean;
  };
  items: string[];
  npc: Record<string, number>;
  openedLocations: string[];
  visitedDistricts: WorldScene[];
  visitedInteriors: WorldScene[];
  npcStates: Record<string, "idle" | "working" | "patrolling">;
  npcMemoryFlags: Record<string, boolean>;
  worldPhase: "PREP" | "EVENT" | "AFTER";
  persistentPropStates: Record<string, boolean>;
  discoveredSecrets: string[];
  playerAppearance: string;
  safeLocation: { scene: WorldScene; x: number; y: number };
  returnPositions: Partial<Record<WorldScene, { x: number; y: number }>>;
  worldVersion: number;
};

export const spawn: Record<WorldScene, {x:number;y:number}> = {
  square: { x: 25 * 32 + 16, y: 27 * 32 + 16 },
  cafe: { x: 9 * 32, y: 9 * 32 },
  maker: { x: 4 * 32, y: 11 * 32 },
  garage: { x: 4 * 32, y: 11 * 32 },
  people: { x: 4 * 32, y: 11 * 32 },
  urban: { x: 4 * 32, y: 11 * 32 },
  house: { x: 4 * 32, y: 11 * 32 },
  "maker-room": { x: 9 * 32, y: 9 * 32 },
  "garage-room": { x: 9 * 32, y: 9 * 32 },
  "people-room": { x: 9 * 32, y: 9 * 32 },
  "urban-room": { x: 9 * 32, y: 9 * 32 },
  "house-room": { x: 9 * 32, y: 9 * 32 },
};
export const points = {
  coordinator: { scene: "square", x: 25 * 32, y: 13 * 32 },
  board: { scene: "square", x: 18 * 32, y: 12 * 32 },
  aruzhan: { scene: "square", x: 20 * 32, y: 19 * 32 },
  timur: { scene: "square", x: 32 * 32, y: 16 * 32 },
  dana: { scene: "square", x: 29 * 32, y: 23 * 32 },
  amir: { scene: "square", x: 34 * 32, y: 19 * 32 },
  crate: { scene: "square", x: 13 * 32, y: 18 * 32 },
  display: { scene: "square", x: 31 * 32, y: 16 * 32 },
  choose: { scene: "square", x: 31 * 32, y: 16 * 32 },
  deliver: { scene: "square", x: 25 * 32, y: 23 * 32 },
  finish: { scene: "square", x: 25 * 32, y: 13 * 32 },
  visit_cafe: { scene: "cafe", x: 9 * 32, y: 9 * 32 },
} as const;

export function initialWorldState(): WorldState {
  return {
    version: WORLD_VERSION,
    scene: "square",
    ...spawn.square,
    avatar: "player",
    flags: {
      coordinator: false,
      board: false,
      talks: [],
      crate: false,
      display: false,
      choice: null,
      delivered: false,
      completed: false,
      cafeVisited: false,
    },
    items: [],
    npc: {},
    openedLocations: ["square"],
    visitedDistricts: [],
    visitedInteriors: [],
    npcStates: {},
    npcMemoryFlags: {},
    worldPhase: "PREP",
    persistentPropStates: {},
    discoveredSecrets: [],
    playerAppearance: "player",
    safeLocation: { scene: "square", ...spawn.square },
    returnPositions: {},
    worldVersion: WORLD_VERSION,
  };
}

export function safePosition(scene: WorldScene, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return spawn[scene];
  if (interiorScenes.includes(scene as typeof interiorScenes[number]))
    return x >= 48 && x <= 528 && y >= 48 && y <= 336 ? { x, y } : spawn[scene];
  if (districtScenes.includes(scene as typeof districtScenes[number])) {
    if (x < 32 || x > (zones[scene].width - 1) * 32 || y < 32 || y > (zones[scene].height - 1) * 32)
      return spawn[scene];
    const building = x >= 405 && x <= 555 && y >= 95 && y <= 225;
    return building ? spawn[scene] : {x,y};
  }
  if (x < 32 || x > 1568 || y < 32 || y > 1056) return spawn.square;
  const water = x >= 38 * 32 && x <= 47 * 32 && y >= 23 * 32 && y <= 30 * 32;
  // Match the solid bodies in the Phaser scene. Wider rectangles made reachable
  // positions appear invalid during autosave near a building entrance.
  const hall = x >= 718 && x <= 946 && y >= 80 && y <= 240;
  const media = x >= 1166 && x <= 1394 && y >= 160 && y <= 352;
  const workshop = x >= 142 && x <= 370 && y >= 192 && y <= 384;
  const fountain = Math.abs(x - 25 * 32) <= 30 && Math.abs(y - 17 * 32) <= 28;
  const trees = [
    [2, 3],
    [5, 20],
    [8, 27],
    [15, 4],
    [16, 27],
    [35, 4],
    [35, 28],
    [47, 6],
    [45, 18],
    [5, 30],
  ].some(
    ([tx, ty]) =>
      Math.abs(x - tx * 32) <= 24 && Math.abs(y - (ty * 32 - 18)) <= 24,
  );
  return water || hall || media || workshop || fountain || trees
    ? spawn.square
    : { x, y };
}

export function migrateWorldState(raw: unknown): WorldState {
  const base = initialWorldState();
  const value = raw as Partial<WorldState> | null;
  if (!value || !value.flags || !Array.isArray(value.items)) return base;
  const scene = value.scene && Object.hasOwn(zones, value.scene) ? value.scene : "square";
  const position = safePosition(scene, Number(value.x), Number(value.y));
  const state: WorldState = {
    ...base, ...value,
    version: WORLD_VERSION,
    worldVersion: WORLD_VERSION,
    scene,
    ...position,
    flags: { ...base.flags, ...value.flags },
    items: value.items,
    npc: value.npc ?? {},
    openedLocations: value.openedLocations ?? ["square"],
    visitedDistricts: value.visitedDistricts ?? [],
    visitedInteriors: value.visitedInteriors ?? (value.flags.cafeVisited ? ["cafe"] : []),
    npcStates: value.npcStates ?? {},
    npcMemoryFlags: value.npcMemoryFlags ?? Object.fromEntries([
      ...Object.entries(value.npc ?? {}).filter(([, count]) => count > 0).map(([id]) => [`met:${id}`, true] as const),
      ...(value.flags.coordinator ? [["met:saniya", true] as const] : []),
      ...value.flags.talks.map((id) => [`met:${id}`, true] as const),
    ]),
    worldPhase: value.worldPhase ?? (value.flags.completed ? "AFTER" : value.flags.coordinator ? "EVENT" : "PREP"),
    persistentPropStates: value.persistentPropStates ?? {},
    discoveredSecrets: value.discoveredSecrets ?? [],
    playerAppearance: value.playerAppearance ?? value.avatar ?? "player",
    safeLocation: {scene, ...position},
    returnPositions: value.returnPositions ?? {},
  };
  return state;
}

export function objective(state: WorldState): string {
  return (
    openingQuest.objectives.find((step) => !step.complete(state))?.text ??
    "Исследуй Campus Square"
  );
}

export function applyWorldEvent(
  state: WorldState,
  kind: WorldEventKind,
  choice?: WorldChoice,
): WorldState {
  const next = structuredClone(state);
  const f = next.flags;
  if (kind === "coordinator") { f.coordinator = true; next.worldPhase = "EVENT"; }
  else if (kind === "board") {
    if (!f.coordinator) throw new Error("Сначала поговори с координатором.");
    f.board = true;
  } else if (["aruzhan", "timur", "dana", "amir"].includes(kind)) {
    if (!f.board) throw new Error("Сначала посмотри объявление на стенде.");
    if (!f.talks.includes(kind)) f.talks.push(kind);
    next.npc[kind] = (next.npc[kind] ?? 0) + 1;
  } else if (kind === "crate") {
    if (f.talks.length < 2)
      throw new Error("Сначала поговори с участниками фестиваля.");
    f.crate = true;
    if (!next.items.includes("materials")) next.items.push("materials");
  } else if (kind === "display") {
    if (!f.crate) throw new Error("Сначала забери материалы.");
    f.display = true;
  } else if (kind === "choose") {
    if (
      !f.display ||
      !choice ||
      !["repair", "delegate", "relocate"].includes(choice)
    )
      throw new Error("Решение пока недоступно.");
    if (f.choice && f.choice !== choice)
      throw new Error("Решение уже принято.");
    f.choice = choice;
  } else if (kind === "deliver") {
    if (!f.choice || !next.items.includes("materials"))
      throw new Error("Сначала подготовь показ и забери материалы.");
    f.delivered = true;
    next.items = next.items.filter((item) => item !== "materials");
  } else if (kind === "finish") {
    if (!f.delivered) throw new Error("Сначала отнеси материалы на площадку.");
    f.completed = true;
    next.worldPhase = "AFTER";
  } else if (kind === "visit_cafe") {
    f.cafeVisited = true;
    if (!next.openedLocations.includes("cafe"))
      next.openedLocations.push("cafe");
  }
  return next;
}
