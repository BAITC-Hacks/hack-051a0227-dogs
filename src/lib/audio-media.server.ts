import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

export class AudioError extends Error {
  constructor(
    public code: string,
    public retryable = false,
    public metadata?: {
      requestId?: string;
      responseId?: string;
      usage?: unknown;
    },
  ) {
    super(code);
  }
}
export function pcmWav(pcm: Buffer, rate = 16000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export async function decodeAudio(bytes: Buffer, mime: string) {
  const demuxer: Record<string, string> = {
    "audio/wav": "wav",
    "audio/webm": "matroska",
    "audio/ogg": "ogg",
    "audio/mp4": "mov",
    "audio/mpeg": "mp3",
  };
  if (!demuxer[mime] || bytes.length === 0 || bytes.length > 25 * 1024 * 1024)
    throw new AudioError("INVALID_AUDIO");
  // Ordinary M4A can place its index after the audio and therefore needs seekable input.
  const directory =
    mime === "audio/mp4"
      ? await mkdtemp(join(tmpdir(), "leader-audio-"))
      : undefined;
  try {
    const inputPath = directory ? join(directory, "answer.m4a") : "pipe:0";
    if (directory) await writeFile(inputPath, bytes, { mode: 0o600 });
    const pcm = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        ffmpeg.path,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-xerror",
          "-protocol_whitelist",
          directory ? "file,pipe" : "pipe",
          "-f",
          demuxer[mime],
          ...(directory ? ["-enable_drefs", "0"] : []),
          "-i",
          inputPath,
          "-map",
          "0:a:0",
          "-vn",
          "-t",
          "181",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let settled = false;
      let size = 0;
      const chunks: Buffer[] = [];
      const finish = (error?: AudioError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          child.kill("SIGKILL");
          reject(error);
        } else resolve(Buffer.concat(chunks));
      };
      const timer = setTimeout(
        () => finish(new AudioError("DECODE_TIMEOUT")),
        20000,
      );
      child.on("error", () => finish(new AudioError("DECODER_UNAVAILABLE")));
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 181 * 32000) finish(new AudioError("INVALID_DURATION"));
        else chunks.push(chunk);
      });
      // Discard decoder diagnostics: untrusted media can contain personal metadata.
      child.stderr.resume();
      child.stdin.on("error", () => {});
      child.on("close", (code) =>
        finish(code === 0 ? undefined : new AudioError("INVALID_AUDIO")),
      );
      child.stdin.end(directory ? undefined : bytes);
    });
    const durationMs = Math.round(pcm.length / 32);
    if (durationMs < 250 || durationMs > 180000)
      throw new AudioError("INVALID_DURATION");
    return {
      durationMs,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      wav: pcmWav(pcm),
    };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
