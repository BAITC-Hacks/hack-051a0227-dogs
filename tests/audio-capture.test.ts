import { test } from "node:test";
import assert from "node:assert/strict";
import { requestMicrophone } from "../src/lib/microphone";
import { AudioCapture } from "../src/lib/audio-capture";
import { recordingKey } from "../src/lib/recording-cache";
class VirtualRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  start() {
    this.state = "recording";
    this.ondataavailable?.({ data: new Blob(["first"]) });
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["last"]) });
      this.onstop?.();
    });
  }
}
function virtualStream() {
  let stopped = 0;
  return {
    source: {
      getTracks: () => [{ stop: () => stopped++ }],
    } as unknown as MediaStream,
    stops: () => stopped,
  };
}
test("late microphone resolution after cancellation or timeout stops the acquired tracks", async () => {
  for (const cancel of [true, false]) {
    const virtual = virtualStream();
    let resolve!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((r) => {
      resolve = r;
    });
    const controller = new AbortController();
    const pending = requestMicrophone(controller.signal, () => permission, 5);
    if (cancel) controller.abort();
    await assert.rejects(pending);
    resolve(virtual.source);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(virtual.stops(), 1);
  }
});
test("capture includes the final chunk, releases tracks, preserves navigation buffer, discards logout buffer", async () => {
  for (const mode of ["stop", "navigate", "logout"] as const) {
    const virtual = virtualStream();
    const recorder = new VirtualRecorder();
    const buffers: Blob[] = [];
    const completed: Blob[] = [];
    const capture = new AudioCapture(
      {
        buffer: (b) => buffers.push(b),
        complete: (b) => completed.push(b),
        error: (e) => {
          throw e;
        },
      },
      {
        getStream: async () => virtual.source,
        createRecorder: () => recorder as unknown as MediaRecorder,
      },
    );
    await capture.start();
    if (mode === "stop") capture.stop();
    else capture.dispose(mode === "logout");
    await Promise.resolve();
    assert.ok(virtual.stops() >= 1);
    assert.equal(
      await buffers.at(-1)!.text(),
      mode === "logout" ? "first" : "firstlast",
    );
    assert.equal(completed.length, mode === "stop" ? 1 : 0);
    if (completed.length) assert.equal(await completed[0].text(), "firstlast");
  }
  assert.notEqual(
    recordingKey("candidate-a", "app", "oral"),
    recordingKey("candidate-b", "app", "oral"),
  );
});
