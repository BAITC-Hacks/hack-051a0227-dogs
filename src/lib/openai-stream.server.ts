import "server-only";
/** Consume actual Responses SSE. An incomplete stream can never become a successful response. */
export async function consumeResponsesStream(
  response: Response,
  signal: AbortSignal,
  delta?: (text: string) => Promise<void>,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("STREAM_EMPTY");
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = "",
    size = 0,
    completed: Record<string, unknown> | null = null;
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 500000) throw new Error("STREAM_LIMIT");
      buffer = (buffer + decoder.decode(part.value, { stream: true })).replace(
        /\r\n/g,
        "\n",
      );
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data);
        if (
          event.type === "response.output_text.delta" &&
          typeof event.delta === "string"
        )
          await delta?.(event.delta);
        if (
          event.type === "response.completed" &&
          event.response?.status === "completed"
        )
          completed = event.response;
        if (
          ["error", "response.failed", "response.incomplete"].includes(
            event.type,
          )
        )
          throw new Error("STREAM_FAILED");
      }
    }
    signal.throwIfAborted();
    if (!completed) throw new Error("STREAM_INCOMPLETE");
    return completed;
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
  }
}
