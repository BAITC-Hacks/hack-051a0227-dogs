type Message = {
  id: string;
  kind: string;
  createdAt: Date | string;
  replyToId?: string | null;
  author: { role: string };
};
export const questionKinds = ["QUESTION", "MESSAGE", "CLARIFICATION"];
/** New questions require an explicit reply. Legacy messages also accept a later unlinked answer. */
export function unansweredQuestions<T extends Message>(messages: T[]): T[] {
  return messages.filter(
    (q) =>
      q.author.role === "STAFF" &&
      questionKinds.includes(q.kind) &&
      !messages.some(
        (a) =>
          a.author.role === "CANDIDATE" &&
          a.kind === "MESSAGE" &&
          (a.replyToId === q.id ||
            (q.kind !== "QUESTION" &&
              !a.replyToId &&
              new Date(a.createdAt) > new Date(q.createdAt))),
      ),
  );
}
