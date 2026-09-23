import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: [{ emit: "event", level: "error" }, { emit: "event", level: "warn" }],
});

prisma.$on("error", (event) => console.error("Prisma error:", event.message.replace(/(?:Bearer\s+|apiKey[=: ]+)[^\s"']+/gi, "[REDACTED]")));
prisma.$on("warn", (event) => console.warn("Prisma warning:", event.message));
