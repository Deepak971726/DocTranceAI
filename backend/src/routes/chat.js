import { Router } from "express";
import { withTransaction } from "../db.js";
import { NotFoundError } from "../errors.js";
import { requireUser } from "../middleware/auth.js";
import { integerQuery, requireUuid, validateBody } from "../middleware/validation.js";
import {
  getConversation,
  listConversations,
  listMessages,
  publicConversation,
  publicMessage,
  softDeleteConversation,
} from "../repositories/conversations.js";
import { chatSchema } from "../schemas.js";
import { chatService } from "../services/chat.js";

const router = Router();
router.use(requireUser);

router.post("/chat", validateBody(chatSchema), async (req, res) => {
  const prepared = await chatService.prepare({
    userId: req.user.id,
    question: req.validatedBody.question,
    documentIds: req.validatedBody.document_ids,
    conversationId: req.validatedBody.conversation_id,
  });
  if (!req.validatedBody.stream) {
    res.json(await chatService.complete(prepared, req.requestId));
    return;
  }
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  for await (const event of chatService.stream(prepared)) {
    res.write(event);
  }
  res.end();
});

router.get("/conversations", async (req, res) => {
  const limit = integerQuery(req.query.limit, {
    defaultValue: 20,
    min: 1,
    max: 100,
    name: "limit",
  });
  const offset = integerQuery(req.query.offset, {
    defaultValue: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    name: "offset",
  });
  const page = await withTransaction(
    (client) => listConversations(client, req.user.id, { limit, offset }),
    { userId: req.user.id },
  );
  res.json({
    items: page.items.map(publicConversation),
    total: page.total,
    limit,
    offset,
  });
});

router.get("/messages", async (req, res) => {
  const conversationId = requireUuid(String(req.query.conversation_id ?? ""), "conversation_id");
  const limit = integerQuery(req.query.limit, {
    defaultValue: 100,
    min: 1,
    max: 500,
    name: "limit",
  });
  const offset = integerQuery(req.query.offset, {
    defaultValue: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    name: "offset",
  });
  const page = await withTransaction(
    async (client) => {
      const conversation = await getConversation(client, req.user.id, conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found.");
      }
      return listMessages(client, req.user.id, conversationId, { limit, offset });
    },
    { userId: req.user.id },
  );
  res.json({
    items: page.items.map(publicMessage),
    total: page.total,
    limit,
    offset,
  });
});

router.delete("/conversations/:conversationId", async (req, res) => {
  const conversationId = requireUuid(req.params.conversationId, "conversation_id");
  await withTransaction(
    async (client) => {
      const conversation = await getConversation(client, req.user.id, conversationId);
      if (!conversation) {
        throw new NotFoundError("Conversation not found.");
      }
      await softDeleteConversation(client, req.user.id, conversationId);
    },
    { userId: req.user.id },
  );
  res.json({ message: "Conversation deleted." });
});

export default router;
