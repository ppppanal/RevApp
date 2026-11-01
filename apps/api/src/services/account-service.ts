import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../errors";
import { parseLoginIdentifier } from "../auth/login-identifier";
import { assertPassword, hashPassword, verifyPassword } from "../auth/password";

export interface PublicUser {
  id: string;
  login: string;
}

const publicUser = { id: true, email: true, username: true, passwordHash: true } as const;
type StoredUser = Prisma.UserGetPayload<{ select: typeof publicUser }>;

export class AccountService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(login: string, password: string): Promise<PublicUser> {
    const identifier = parseLoginIdentifier(login);
    assertPassword(password);
    const passwordHash = await hashPassword(password);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: identifier.email,
          username: identifier.username,
          passwordHash,
          name: identifier.email ?? identifier.username,
        },
        select: publicUser,
      });
      return toPublicUser(user);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new AppError("VALIDATION", "That email or username is already registered.", 400);
      }
      throw error;
    }
  }

  async authenticate(login: string, password: string): Promise<PublicUser> {
    const identifier = parseLoginIdentifier(login);
    const user = await this.prisma.user.findFirst({
      where: identifier.email ? { email: identifier.email } : { username: identifier.username ?? undefined },
      select: publicUser,
    });
    const hash = user?.passwordHash ?? (await hashPassword("unused-timing-pad"));
    const matches = await verifyPassword(password, hash);
    if (!user?.passwordHash || !matches) {
      throw new AppError("VALIDATION", "Unknown email or username, or the password is wrong.", 400);
    }
    return toPublicUser(user);
  }

  async labels(userId: string): Promise<{ subjects: string[]; tags: string[] }> {
    const [subjects, tags] = await Promise.all([
      this.prisma.subject.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { name: true } }),
      this.prisma.tag.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { name: true } }),
    ]);
    return { subjects: subjects.map((subject) => subject.name), tags: tags.map((tag) => tag.name) };
  }
}

function toPublicUser(user: StoredUser): PublicUser {
  const login = user.email ?? user.username;
  if (!login) throw new AppError("INTERNAL", "Study generation failed.", 500);
  return { id: user.id, login };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
