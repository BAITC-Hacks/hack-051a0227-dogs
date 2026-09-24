import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { mkdir, open, lstat, realpath, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

type Storage = "KEYCHAIN" | "LOCAL_FILE";
// Subprocess output is deliberately never logged or attached to thrown errors.
async function keychain(args: string[], input?: string): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawn("/usr/bin/security", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill();
    }, 15000);
    child.stdout.on("data", (b) => {
      out += b.toString();
      if (out.length > 4096) {
        failed = true;
        child.kill();
      }
    });
    // Interactive security can report command failure on stderr but exit zero.
    child.stderr.on("data", (b) => {
      if (/SecKeychain|error|failed|denied/i.test(b.toString())) failed = true;
    });
    child.on("error", () => {
      clearTimeout(timer);
      fail(new Error("SECRET_STORAGE"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code || failed) fail(new Error("SECRET_STORAGE"));
      else ok(out.trim());
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export class LocalSecretStore {
  constructor(
    private directory = join(homedir(), ".invision-u-secrets"),
    private preferKeychain = process.platform === "darwin",
  ) {}
  private service(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("SECRET_STORAGE");
    return `education.invision.leader.${id}`;
  }
  private async path(id: string) {
    this.service(id);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.directory);
    const dir = await realpath(this.directory),
      repo = await realpath(process.cwd());
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.mode & 0o077 ||
      stat.uid !== process.getuid?.() ||
      dir === repo ||
      dir.startsWith(repo + sep)
    )
      throw new Error("SECRET_STORAGE");
    return join(resolve(dir), id + ".key");
  }
  async create(id: string): Promise<Storage> {
    const master = randomBytes(32).toString("base64");
    if (this.preferKeychain) {
      try {
        const service = this.service(id);
        // The secret travels over stdin, never shell expansion or argv.
        await keychain(
          ["-i"],
          `add-generic-password -a leader -s ${service} -w ${master}\n`,
        );
        if ((await this.master(id, "KEYCHAIN")).toString("base64") !== master)
          throw new Error("SECRET_STORAGE");
        return "KEYCHAIN";
      } catch {
        /* Only initial creation may select the encrypted-file fallback. */
      }
    }
    const path = await this.path(id);
    const handle = await open(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(master);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return "LOCAL_FILE";
  }
  private async master(id: string, storage: string): Promise<Buffer> {
    let encoded: string;
    if (storage === "KEYCHAIN")
      encoded = await keychain([
        "find-generic-password",
        "-a",
        "leader",
        "-s",
        this.service(id),
        "-w",
      ]);
    else if (storage === "LOCAL_FILE") {
      const handle = await open(
        await this.path(id),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stat = await handle.stat();
        if (
          !stat.isFile() ||
          stat.mode & 0o077 ||
          stat.uid !== process.getuid?.() ||
          stat.size > 100
        )
          throw new Error("SECRET_STORAGE");
        encoded = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
    } else throw new Error("SECRET_STORAGE");
    const master = Buffer.from(encoded, "base64");
    if (master.length !== 32) throw new Error("SECRET_STORAGE");
    return master;
  }
  async encrypt(id: string, storage: string, value: string) {
    const iv = randomBytes(12),
      master = await this.master(id, storage);
    try {
      const cipher = createCipheriv("aes-256-gcm", master, iv);
      cipher.setAAD(Buffer.from(id));
      const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      return [
        "v1",
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64"),
      ].join(":");
    } finally {
      master.fill(0);
    }
  }
  async decrypt(id: string, storage: string, value: string) {
    const [v, iv, tag, data] = value.split(":"),
      master = await this.master(id, storage);
    try {
      if (v !== "v1") throw new Error("SECRET_STORAGE");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        master,
        Buffer.from(iv, "base64"),
      );
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(data, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } finally {
      master.fill(0);
    }
  }
  async remove(id: string, storage: string) {
    if (storage === "KEYCHAIN")
      await keychain([
        "delete-generic-password",
        "-a",
        "leader",
        "-s",
        this.service(id),
      ]);
    else if (storage === "LOCAL_FILE") await unlink(await this.path(id));
  }
}
export const localSecrets = new LocalSecretStore();
