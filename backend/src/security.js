import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { AuthenticationError } from "./errors.js";

export const hashPassword = (password) => bcrypt.hash(password, 12);
export const verifyPassword = (password, passwordHash) => bcrypt.compare(password, passwordHash);
export const hashToken = (token) => crypto.createHash("sha256").update(token, "utf8").digest("hex");
export const createOpaqueToken = () => crypto.randomBytes(48).toString("base64url");

export function createApiKey() {
  const plaintext = `dta_${crypto.randomBytes(36).toString("base64url")}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    digest: hashToken(plaintext),
  };
}

function createJwt(userId, tokenVersion, tokenType, expiresInSeconds) {
  return jwt.sign(
    {
      type: tokenType,
      ver: tokenVersion,
    },
    config.jwtSecretKey,
    {
      algorithm: config.jwtAlgorithm,
      audience: "doctraceai-api",
      issuer: config.appName,
      subject: String(userId),
      jwtid: crypto.randomUUID(),
      expiresIn: expiresInSeconds,
      notBefore: 0,
    },
  );
}

export const createAccessToken = (userId, tokenVersion) =>
  createJwt(userId, tokenVersion, "access", config.accessTokenExpireMinutes * 60);

export const createRefreshToken = (userId, tokenVersion) =>
  createJwt(userId, tokenVersion, "refresh", config.refreshTokenExpireDays * 86400);

export function decodeToken(token, expectedType) {
  try {
    const payload = jwt.verify(token, config.jwtSecretKey, {
      algorithms: [config.jwtAlgorithm],
      audience: "doctraceai-api",
      issuer: config.appName,
    });
    if (typeof payload !== "object" || payload.type !== expectedType || !payload.sub) {
      throw new AuthenticationError("Invalid token type.");
    }
    return payload;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError("Invalid or expired token.", { cause: error });
  }
}
