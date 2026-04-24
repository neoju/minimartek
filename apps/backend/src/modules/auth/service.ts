import bcrypt from "bcryptjs";
import type { Knex } from "knex";
import type { LoginRequest, LoginResponse, RegisterRequest } from "@repo/dto";
import { normalizeEmail } from "@repo/utils";
import { HttpError } from "@/lib/http-error.js";
import { isUniqueViolation } from "@/lib/db-errors.js";
import { signToken } from "@/lib/jwt.js";

export async function register(db: Knex, input: RegisterRequest): Promise<LoginResponse> {
  const email = normalizeEmail(input.email);

  try {
    const password_hash = await bcrypt.hash(input.password, 10);
    const [row] = await db("users")
      .insert({
        email,
        name: input.name,
        password_hash,
      })
      .returning("*");

    if (!row) {
      throw new HttpError(500, "REGISTER_FAILED", "Unable to create user");
    }

    const { token } = signToken({ sub: row.id, email: row.email });

    return { access_token: token };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "EMAIL_TAKEN", "Email already registered");
    }

    throw error;
  }
}

export async function login(db: Knex, input: LoginRequest): Promise<LoginResponse> {
  const email = normalizeEmail(input.email);
  const user = await db("users").whereRaw("LOWER(email) = ?", [email]).first();

  if (!user) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const ok = await bcrypt.compare(input.password, user.password_hash);

  if (!ok) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const { token } = signToken({ sub: user.id, email: user.email });

  return { access_token: token };
}
