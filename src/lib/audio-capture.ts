import { requestMicrophone } from "./microphone";

/** One explicit recording lifetime; injected devices permit controlled virtual-stream tests. */
export class AudioCapture {
  private abort = new AbortController();
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private discard = false;
  constructor(
    private callbacks: {
      buffer: (blob: Blob) => void;
      complete: (blob: Blob) => void;
      error: (error: Error) => void;
      stopped?: () => void;
    },
    private devices = {
      getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
      createRecorder: (stream: MediaStream) => {
        const mimeType = [
          "audio/webm;codecs=opus",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ].find((m) => MediaRecorder.isTypeSupported(m));
        return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      },
    },
    private maxDurationMs = 180000,
  ) {}
  async start() {
    const stream = await requestMicrophone(
      this.abort.signal,
      this.devices.getStream,
    );
    if (this.disposed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    try {
      const recorder = this.devices.createRecorder(stream);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (this.discard || !event.data.size) return;
        chunks.push(event.data);
        this.callbacks.buffer(
          new Blob(chunks, { type: recorder.mimeType || event.data.type }),
        );
      };
      recorder.onstop = () => {
        this.release();
        if (!this.disposed) {
          const blob = new Blob(chunks, {
            type: recorder.mimeType || chunks[0]?.type,
          });
          if (blob.size) this.callbacks.complete(blob);
          else
            this.callbacks.error(
              new Error(
                "Запись пуста. Проверь устройство и запиши ответ ещё раз.",
              ),
            );
        }
      };
      recorder.onerror = () => {
        this.stop();
        this.release();
        if (!this.disposed)
          this.callbacks.error(
            new Error(
              "Запись прервалась. Прослушай доступный фрагмент или запиши ответ ещё раз.",
            ),
          );
      };
      recorder.start(1000);
      this.timer = setTimeout(
        () => this.stop(),
        Math.min(180000, Math.max(1000, this.maxDurationMs)),
      );
    } catch (error) {
      this.release();
      throw error;
    }
  }
  stop() {
    if (
      this.recorder?.state === "recording" ||
      this.recorder?.state === "paused"
    )
      this.recorder.stop();
  }
  private release() {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.callbacks.stopped?.();
  }
  dispose(discard = false) {
    this.disposed = true;
    this.discard = discard;
    this.abort.abort();
    this.stop();
    this.release();
  }
}
