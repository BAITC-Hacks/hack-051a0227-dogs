import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import {
  OpenAIAudioProvider,
  audioConfig,
} from "../src/lib/audio-provider.server";
import { AudioError } from "../src/lib/audio-media.server";
import { runAudioWorkerOnce } from "../src/lib/audio-worker.server";
import { createFixture } from "../tests/audio/fixtures";
// Explicitly isolated LIVE_CHECK jobs are never picked up by the application's LIVE worker.
async function main() {
  if (!process.argv.includes("--confirm-paid"))
    throw new Error(
      "Use npm run audio:live -- --confirm-paid. At most 3 paid requests on the two included fictional audio files.",
    );
  if (!process.env.OPENAI_API_KEY?.trim())
    throw new Error("OPENAI_API_KEY is not configured. No request was made.");
  let requests = 0;
  try {
    const fixture = await createFixture("live-check", "LIVE_CHECK");
    const provider = new OpenAIAudioProvider();
    const reserve = () => {
      if (++requests > 3) throw new AudioError("LIVE_CHECK_LIMIT");
    };
    await runAudioWorkerOnce({
      mode: "LIVE_CHECK",
      onlyId: fixture.job.id,
      provider: {
        transcribe: (input) => {
          reserve();
          return provider.transcribe(input);
        },
        summarize: (input) => {
          reserve();
          return provider.summarize(input);
        },
      },
    });
    await db.audioJob.updateMany({
      where: { id: fixture.job.id, status: "RETRY_WAIT" },
      data: { status: "FAILED", errorCode: "LIVE_CHECK_NO_AUTOMATIC_RETRY" },
    });
    const result = await db.audioJob.findUniqueOrThrow({
      where: { id: fixture.job.id },
      include: { transcripts: true, calls: true },
    });
    await mkdir(".local", { recursive: true });
    await writeFile(
      ".local/audio-live-result.json",
      JSON.stringify(
        {
          applicationId: fixture.app.id,
          jobId: result.id,
          config: audioConfig(),
          status: result.status,
          errorCode: result.errorCode,
          requests,
          transcripts: result.transcripts,
          summary: result.summary,
          calls: result.calls,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        status: result.status,
        requests,
        report: ".local/audio-live-result.json",
        applicationId: fixture.app.id,
      }),
    );
    if (result.status !== "COMPLETED") process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error instanceof AudioError ? error.code : error.message);
  process.exitCode = 1;
});
