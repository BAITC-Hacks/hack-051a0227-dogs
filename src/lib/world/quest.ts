import type { WorldState } from "./model";
export const openingQuest = {
  id: "before-opening",
  version: 1,
  title: "Перед открытием",
  reward: 60,
  description: "Помоги подготовить Campus Square к Festival of Ideas.",
  domains: ["LEADERSHIP", "TEAMWORK", "COMMUNICATION"] as const,
  objectives: [
    {
      id: "coordinator",
      type: "talk_to",
      text: "Найди координатора Санию на площади",
      complete: (s: WorldState) => s.flags.coordinator,
    },
    {
      id: "board",
      type: "inspect",
      text: "Осмотри стенд у главной дорожки",
      complete: (s: WorldState) => s.flags.board,
    },
    {
      id: "people",
      type: "talk_to",
      text: "Поговори с двумя участниками фестиваля",
      complete: (s: WorldState) => s.flags.talks.length >= 2,
    },
    {
      id: "crate",
      type: "collect",
      text: "Забери коробку у западной дорожки",
      complete: (s: WorldState) => s.flags.crate,
    },
    {
      id: "display",
      type: "inspect",
      text: "Осмотри интерактивный экран",
      complete: (s: WorldState) => s.flags.display,
    },
    {
      id: "choice",
      type: "choose",
      text: "Реши, как подготовить показ",
      complete: (s: WorldState) => s.flags.choice !== null,
    },
    {
      id: "deliver",
      type: "deliver",
      text: "Отнеси материалы на площадку события",
      complete: (s: WorldState) => s.flags.delivered,
    },
    {
      id: "finish",
      type: "talk_to",
      text: "Расскажи Сание о результате",
      complete: (s: WorldState) => s.flags.completed,
    },
  ],
} as const;
export const worldMissionContract = {
  worldMissionId: "before-opening",
  skillDomain: "LEADERSHIP",
  skillBranch: "Решения",
  prerequisites: [],
  reward: 60,
  completionEvent: "finish",
  returnToNode: "world-before-opening",
} as const;
