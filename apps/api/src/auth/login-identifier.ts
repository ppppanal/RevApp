import { z } from "zod";
import { AppError } from "../errors";

export interface LoginIdentifier {
  email: string | null;
  username: string | null;
}

const emailSchema = z.string().trim().email().max(80);

export function parseLoginIdentifier(value: string): LoginIdentifier {
  const login = value.trim();
  if (!login) {
    throw new AppError("VALIDATION", "Enter an email or username.", 400);
  }
  if (login.includes("@")) {
    const parsed = emailSchema.safeParse(login.toLowerCase());
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Enter a valid email or a username of at least 3 characters.", 400);
    }
    return { email: parsed.data, username: null };
  }
  if (login.length < 3 || login.length > 40 || !/^[A-Za-z0-9._-]+$/.test(login)) {
    throw new AppError("VALIDATION", "Enter a valid email or a username of at least 3 characters.", 400);
  }
  return { email: null, username: login.toLowerCase() };
}
