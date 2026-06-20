import { withTransaction } from "../db.js";
import { AuthenticationError } from "../errors.js";
import { log, setContext } from "../logger.js";
import { getUserById, publicUser } from "../repositories/users.js";
import { decodeToken } from "../security.js";

export async function requireUser(req, _res, next) {
  try {
    log("info", "auth_bearer_check_started", {
      message: "Bearer authentication check started.",
      path: req.originalUrl ?? req.url,
    });
    const authorization = req.get("Authorization") ?? "";
    const [scheme, token] = authorization.split(" ", 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new AuthenticationError();
    }
    const payload = decodeToken(token, "access");
    const user = await withTransaction(
      async (client) => {
        const result = await getUserById(client, payload.sub);
        if (!result || !result.is_active) {
          throw new AuthenticationError("User account is unavailable.");
        }
        if (payload.ver !== result.token_version) {
          throw new AuthenticationError("Token has been revoked.");
        }
        return result;
      },
      { userId: payload.sub },
    );
    req.user = user;
    req.publicUser = publicUser(user);
    setContext({ user_id: user.id });
    log("info", "auth_bearer_check_finished", {
      message: "Bearer authentication check finished.",
      user_id: user.id,
      email: user.email,
      path: req.originalUrl ?? req.url,
    });
    next();
  } catch (error) {
    log("warn", "auth_bearer_check_failed", {
      message: "Bearer authentication check failed.",
      path: req.originalUrl ?? req.url,
      error: error.message,
    });
    next(error);
  }
}
