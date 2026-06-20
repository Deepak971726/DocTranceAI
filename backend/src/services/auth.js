import crypto from "node:crypto";
import { config } from "../config.js";
import { isUniqueViolation, setTenantContext, withTransaction } from "../db.js";
import { AuthenticationError, ConflictError, NotFoundError } from "../errors.js";
import { emailService } from "../integrations/email.js";
import {
  consumeAuthToken,
  createAuthToken,
  createUser,
  getAuthIdentity,
  getUserById,
  markLogin,
  publicUser,
  revokeAllAuthTokens,
  revokeAuthTokenByHash,
  updatePassword,
  getValidAuthToken,
} from "../repositories/users.js";
import {
  createAccessToken,
  createOpaqueToken,
  createRefreshToken,
  decodeToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../security.js";
import { recordAudit } from "../repositories/account.js";
import { log, logProcessFinished, logProcessStarted } from "../logger.js";

function tokenResponse(user, accessToken, refreshToken) {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: config.accessTokenExpireMinutes * 60,
    user: publicUser(user),
  };
}

async function issueTokenPair(client, user, { ipAddress, userAgent }) {
  const accessToken = createAccessToken(user.id, user.token_version);
  const refreshToken = createRefreshToken(user.id, user.token_version);
  await createAuthToken(client, {
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    tokenType: "REFRESH",
    expiresAt: new Date(Date.now() + config.refreshTokenExpireDays * 86400_000),
    ipAddress,
    userAgent,
  });
  return tokenResponse(user, accessToken, refreshToken);
}

export class AuthService {
  async register({ email, password, fullName, ipAddress, userAgent, requestId }) {
    logProcessStarted("Register user", {
      email,
      full_name: fullName ?? null,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    const userId = crypto.randomUUID();
    try {
      const created = await withTransaction(
        async (client) => {
          const user = await createUser(client, {
            id: userId,
            email,
            passwordHash: await hashPassword(password),
            fullName,
          });
          await recordAudit(client, {
            userId,
            action: "auth.register",
            resourceType: "user",
            resourceId: userId,
            ipAddress,
            userAgent,
            requestId,
          });
          return publicUser(user);
        },
        { userId },
      );
      logProcessFinished("Register user", { user_id: userId, email });
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("An account with this email already exists.", { cause: error });
      }
      throw error;
    }
  }

  async login({ email, password, ipAddress, userAgent, requestId }) {
    logProcessStarted("Login user", {
      email,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    const response = await withTransaction(async (client) => {
      const identity = await getAuthIdentity(client, email);
      if (!identity || !(await verifyPassword(password, identity.password_hash))) {
        throw new AuthenticationError("Invalid email or password.");
      }
      if (!identity.is_active) {
        throw new AuthenticationError("This account is disabled.");
      }
      await setTenantContext(client, identity.id);
      const user = await getUserById(client, identity.id);
      if (!user) {
        throw new AuthenticationError("Invalid email or password.");
      }
      await markLogin(client, user.id);
      const response = await issueTokenPair(client, user, { ipAddress, userAgent });
      await recordAudit(client, {
        userId: user.id,
        action: "auth.login",
        resourceType: "user",
        resourceId: user.id,
        ipAddress,
        userAgent,
        requestId,
      });
      return response;
    });
    logProcessFinished("Login user", {
      user_id: response.user.id,
      email: response.user.email,
    });
    return response;
  }

  async refresh({ refreshToken, ipAddress, userAgent }) {
    logProcessStarted("Refresh auth token", {
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    const payload = decodeToken(refreshToken, "refresh");
    const response = await withTransaction(
      async (client) => {
        const stored = await getValidAuthToken(client, hashToken(refreshToken), "REFRESH");
        if (!stored) {
          throw new AuthenticationError("Refresh token is invalid or has already been used.");
        }
        const user = await getUserById(client, payload.sub);
        if (!user || !user.is_active || payload.ver !== user.token_version) {
          throw new AuthenticationError("Refresh token is no longer valid.");
        }
        await consumeAuthToken(client, stored.id);
        return issueTokenPair(client, user, { ipAddress, userAgent });
      },
      { userId: payload.sub },
    );
    logProcessFinished("Refresh auth token", { user_id: response.user.id });
    return response;
  }

  async logout(refreshToken) {
    logProcessStarted("Logout user");
    try {
      const payload = decodeToken(refreshToken, "refresh");
      await withTransaction(
        (client) => revokeAuthTokenByHash(client, hashToken(refreshToken)),
        { userId: payload.sub },
      );
      logProcessFinished("Logout user", { user_id: payload.sub });
    } catch (error) {
      if (!(error instanceof AuthenticationError)) {
        throw error;
      }
      log("warn", "logout_ignored_invalid_refresh_token", {
        message: "Logout ignored an invalid refresh token.",
      });
    }
  }

  async requestPasswordReset({ email, ipAddress, userAgent }) {
    logProcessStarted("Request password reset", {
      email,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
    const resetData = await withTransaction(async (client) => {
      const identity = await getAuthIdentity(client, email);
      if (!identity || !identity.is_active) {
        return null;
      }
      await setTenantContext(client, identity.id);
      const user = await getUserById(client, identity.id);
      if (!user) {
        return null;
      }
      const rawToken = `${user.id}.${createOpaqueToken()}`;
      await createAuthToken(client, {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        tokenType: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + config.passwordResetExpireMinutes * 60_000),
        ipAddress,
        userAgent,
      });
      return { rawToken, email: user.email };
    });

    if (resetData) {
      const resetUrl = `${config.frontendUrl.replace(/\/$/, "")}/reset-password?token=${resetData.rawToken}`;
      await emailService.send({
        recipient: resetData.email,
        subject: "Reset your DocTraceAI password",
        body: `Reset your password using this link:\n\n${resetUrl}`,
      });
    }
    logProcessFinished("Request password reset", {
      email,
      email_queued: Boolean(resetData),
    });
  }

  async resetPassword({ rawToken, password, requestId }) {
    logProcessStarted("Reset password");
    const userId = rawToken.split(".", 1)[0];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      throw new AuthenticationError("Token is invalid.");
    }
    await withTransaction(
      async (client) => {
        const token = await getValidAuthToken(
          client,
          hashToken(rawToken),
          "PASSWORD_RESET",
        );
        if (!token || token.user_id !== userId) {
          throw new AuthenticationError("Password reset token is invalid or expired.");
        }
        const user = await getUserById(client, userId);
        if (!user) {
          throw new NotFoundError("User account was not found.");
        }
        await consumeAuthToken(client, token.id);
        await updatePassword(client, userId, await hashPassword(password));
        await revokeAllAuthTokens(client, userId);
        await recordAudit(client, {
          userId,
          action: "auth.password_reset",
          resourceType: "user",
          resourceId: userId,
          requestId,
        });
      },
      { userId },
    );
    logProcessFinished("Reset password", { user_id: userId });
  }
}

export const authService = new AuthService();
