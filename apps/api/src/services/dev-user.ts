import type { PrismaClient } from "@prisma/client";

export async function resolveDevUser(prisma: PrismaClient, email: string): Promise<{ id: string }> {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Local dev" },
  });
  return { id: user.id };
}
