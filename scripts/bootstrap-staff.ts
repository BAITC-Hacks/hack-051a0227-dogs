import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const name = process.argv[3]?.trim();
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !name ||
    name.length > 120 ||
    process.stdin.isTTY
  ) {
    console.error(
      "Usage: password on stdin | npm run staff:bootstrap -- email 'Full name'",
    );
    process.exit(1);
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 512) {
      console.error("Password input is too long.");
      process.exit(1);
    }
    chunks.push(bytes);
  }
  const input = Buffer.concat(chunks);
  const password = input.toString("utf8").replace(/\r?\n$/, "");
  input.fill(0);
  for (const chunk of chunks) chunk.fill(0);
  if (
    password.length < 14 ||
    password.length > 128 ||
    /[\r\n]/.test(password)
  ) {
    console.error("Use a password of 14–128 characters without a newline.");
    process.exit(1);
  }

  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const db = new PrismaClient();
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(117211, 4091)`;
      if (await tx.user.count({ where: { role: "STAFF" } }))
        throw new Error("STAFF_EXISTS");
      await tx.user.create({
        data: { email, name, role: "STAFF", origin: "BOOTSTRAP", passwordHash },
      });
    });
    console.log(`First staff account created: ${email}`);
  } catch (error) {
    console.error(
      error instanceof Error && error.message === "STAFF_EXISTS"
        ? "A staff account already exists; bootstrap is closed."
        : "Staff bootstrap failed. Check the database, arguments and email uniqueness.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void main();
