import { test } from "node:test";
import assert from "node:assert/strict";
import { action, upload, ActionError } from "../src/lib/client";

test("Прерванный/непригодный ответ не изображает успех и допускает повтор того же сохранения", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  let attempt = 0;
  globalThis.fetch = async (_url, options) => {
    requests.push(String(options?.body));
    attempt++;
    if (attempt === 1) throw new TypeError("network connection lost");
    if (attempt === 2)
      return new Response("<html>private upstream error</html>", {
        status: 502,
      });
    if (attempt === 3) return Response.json({ revision: 7 });
    return Response.json({ ok: true, data: { revision: 7 } });
  };
  const input = {
    requestKey: "same-retry",
    state: { text: "Сохранить мой текст" },
  };
  try {
    await assert.rejects(
      action("project.save", input),
      /Соединение прервалось/,
    );
    await assert.rejects(
      action("project.save", input),
      (error: unknown) =>
        error instanceof ActionError &&
        error.status === 502 &&
        !error.message.includes("private") &&
        error.message.includes("повторите"),
    );
    await assert.rejects(
      action("project.save", input),
      /Не удалось подтвердить/,
    );
    assert.deepEqual(await action("project.save", input), { revision: 7 });
    assert.equal(new Set(requests).size, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("Загрузка после сетевого сбоя и конфликт версии сохраняют понятную причину", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(
      upload(
        new File(["%PDF-1.4"], "work.pdf", { type: "application/pdf" }),
        "document",
      ),
      /повторите загрузку/,
    );
    globalThis.fetch = async () =>
      Response.json(
        {
          ok: false,
          error: "На сервере есть новая версия. Ваш вариант не перезаписан.",
        },
        { status: 409 },
      );
    await assert.rejects(
      action("project.save"),
      (error: unknown) =>
        error instanceof ActionError &&
        error.status === 409 &&
        error.message.includes("не перезаписан"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
