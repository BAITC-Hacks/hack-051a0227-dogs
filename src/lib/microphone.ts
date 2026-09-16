export function requestMicrophone(
  signal?: AbortSignal,
  getStream = () => navigator.mediaDevices.getUserMedia({ audio: true }),
  timeoutMs = 12000,
): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(error);
    };
    const cancel = () => finish(new Error("Запрос микрофона отменён."));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Браузер не подтвердил доступ к микрофону. Разреши его в настройках или выбери готовый файл.",
          ),
        ),
      timeoutMs,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    Promise.resolve()
      .then(getStream)
      .then(
        (stream) => {
          if (settled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
          resolve(stream);
        },
        () =>
          finish(
            new Error(
              "Нет доступа к микрофону. Разреши его в настройках браузера или выбери готовый файл.",
            ),
          ),
      );
  });
}
