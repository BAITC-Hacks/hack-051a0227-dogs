export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startAudioWorker } = await import("./lib/audio-worker.server");
    startAudioWorker();
    const { startIntakeWorker } = await import("./lib/intake-worker.server");
    startIntakeWorker();
  }
}
