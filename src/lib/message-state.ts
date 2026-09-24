type Message = {
  id: string;
  kind: string;
  createdAt: Date | string;
  replyToId?: string | null;
  author: { role: string };
};
/** New questions require an explicit reply. Keep the historical chronology only for old MESSAGE records. */
export function unansweredQuestions<T extends Message>(messages: T[]): T[] {
  return messages.filter(
    (q) =>
      q.author.role === "STAFF" &&
      ["QUESTION", "MESSAGE"].includes(q.kind) &&
      !messages.some(
        (a) =>
          a.author.role === "CANDIDATE" &&
          a.kind === "MESSAGE" &&
          (a.replyToId === q.id ||
            (q.kind === "MESSAGE" &&
              !a.replyToId &&
              new Date(a.createdAt) > new Date(q.createdAt))),
      ),
  );
}
