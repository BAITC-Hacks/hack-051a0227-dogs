/** Short written placement check. The spoken answers remain a separate human review. */
export const placementQuestions = [
  {
    id: "time-change",
    prompt: "The event starts at 4 p.m. instead of 2 p.m. What changed?",
    choices: [
      ["venue", "The venue changed."],
      ["time", "The starting time changed."],
      ["price", "The price changed."],
    ],
  },
  {
    id: "visitor-reply",
    prompt: "A visitor asks whether participation is free. Which answer is clear and accurate?",
    choices: [
      ["free", "Yes, participation is free."],
      ["maybe", "It might be free; I am not sure."],
      ["paid", "No, you need to buy a ticket."],
    ],
  },
  {
    id: "clarify-plan",
    prompt: "Choose the clearest message to the team when a visitor cannot arrive at 4 p.m.",
    choices: [
      ["promise", "I promised another session tomorrow."],
      ["check", "I will ask whether another session is possible before promising one."],
      ["ignore", "The visitor cannot attend; there is nothing to discuss."],
    ],
  },
  {
    id: "inference",
    prompt: "The hall will be available later, but the location has not changed. Which conclusion follows?",
    choices: [
      ["same-place", "Visitors should go to the same place at the new time."],
      ["new-place", "Visitors should find a different building."],
      ["cancelled", "The event has been cancelled."],
    ],
  },
  {
    id: "conditional",
    prompt: "Which sentence explains a possible next step without claiming it is confirmed?",
    choices: [
      ["confirmed", "We will definitely hold a second workshop."],
      ["conditional", "If enough visitors need another time, we could discuss a second session."],
      ["unclear", "A second workshop was maybe definitely scheduled."],
    ],
  },
  {
    id: "argument",
    prompt: "A classmate says: “We should post only the new time.” Which response adds a reasoned qualification?",
    choices: [
      ["reason", "The new time matters most, but adding that the place and price have not changed may prevent confusion."],
      ["agree", "Yes, only the time."],
      ["dismiss", "That idea is wrong and not worth discussing."],
    ],
  },
] as const;
export type PlacementAnswers = Record<string, string>;
