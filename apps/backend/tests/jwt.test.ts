import { describe, expect, it } from "@jest/globals";
import { signToken, verifyToken } from "../src/lib/jwt.js";

describe("jwt", () => {
  it("signs and verifies a token round-trip", () => {
    const { token, expiresIn } = signToken({
      sub: "abc-123",
      email: "u@example.com",
    });

    expect(typeof token).toBe("string");
    expect(expiresIn).toBeGreaterThan(0);
    const decoded = verifyToken(token);

    expect(decoded.sub).toBe("abc-123");
    expect(decoded.email).toBe("u@example.com");
  });

  it("rejects an invalid token", () => {
    expect(() => verifyToken("not-a-jwt")).toThrow();
  });
});
