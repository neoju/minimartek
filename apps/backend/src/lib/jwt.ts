import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "@/config/env.js";

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface SignTokenResult {
  token: string;
  expiresIn: number;
}

export interface DecodedToken {
  exp?: number;
  iat?: number;
}

export function signToken(payload: JwtPayload): SignTokenResult {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  const token = jwt.sign(payload, env.JWT_SECRET, options);
  const decoded = jwt.decode(token) as DecodedToken | null;
  const expiresIn = decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 3600;

  return { token, expiresIn };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
