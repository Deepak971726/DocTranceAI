import { RAG_SYSTEM_PROMPT, RAG_USER_PROMPT } from "../constants/prompts.js";
import { withTransaction } from "../db.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { llm } from "../integrations/ollama.js";
import { incrementUsage, recordAudit } from "../repositories/account.js";
import {
  addMessage,
  completeMessage,
  createConversation,
  failMessage,
  getConversation,
  getMessage,
  replaceConversationDocuments,
} from "../repositories/conversations.js";
import { getReadyDocuments } from "../repositories/documents.js";
import { ragService } from "./rag.js";
import { log, logProcessFailed, logProcessFinished, logProcessStarted } from "../logger.js";

function sse(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

const STREAM_BATCH_MIN_CHARS = 80;
const STREAM_BATCH_MAX_CHARS = 240;

function shouldFlushStreamBatch(batch) {
  return (
    batch.length >= STREAM_BATCH_MAX_CHARS ||
    (batch.length >= STREAM_BATCH_MIN_CHARS && /[\s.!?;:)]$/.test(batch))
  );
}

export class ChatService {
  async prepare({ userId, question, documentIds, conversationId }) {
    logProcessStarted("Prepare chat", {
      user_id: userId,
      conversation_id: conversationId ?? null,
      selected_documents: documentIds.length,
      question: question.trim(),
    });
    const uniqueDocumentIds = [...new Set(documentIds)];
    const persisted = await withTransaction(
      async (client) => {
        const documents = await getReadyDocuments(client, userId, uniqueDocumentIds);
        if (documents.length !== uniqueDocumentIds.length) {
          throw new ValidationError(
            "Every selected document must exist, belong to you, and be READY.",
          );
        }
        let conversation;
        if (!conversationId) {
          conversation = await createConversation(
            client,
            userId,
            question.trim().slice(0, 80),
            uniqueDocumentIds,
          );
        } else {
          conversation = await getConversation(client, userId, conversationId);
          if (!conversation) {
            throw new NotFoundError("Conversation not found.");
          }
          await replaceConversationDocuments(
            client,
            userId,
            conversation.id,
            uniqueDocumentIds,
          );
        }
        await addMessage(client, {
          userId,
          conversationId: conversation.id,
          role: "USER",
          content: question,
        });
        const assistantMessage = await addMessage(client, {
          userId,
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: "",
          status: "PENDING",
        });
        return {
          conversationId: conversation.id,
          assistantMessageId: assistantMessage.id,
        };
      },
      { userId },
    );
    log("info", "chat_messages_persisted", {
      message: "Chat user and pending assistant messages saved.",
      user_id: userId,
      conversation_id: persisted.conversationId,
      assistant_message_id: persisted.assistantMessageId,
      selected_documents: uniqueDocumentIds,
    });
    let retrieval;
    try {
      retrieval = await ragService.retrieve({
        userId,
        query: question,
        documentIds: uniqueDocumentIds,
      });
      log("info", "chat_retrieval_finished", {
        message: "Chat retrieval finished.",
        user_id: userId,
        conversation_id: persisted.conversationId,
        citations: retrieval.citations.length,
      });
    } catch (error) {
      await withTransaction(
        (client) =>
          failMessage(
            client,
            persisted.assistantMessageId,
            error.constructor?.name ?? "RetrievalError",
          ),
        { userId },
      );
      logProcessFailed("Prepare chat", error, {
        user_id: userId,
        conversation_id: persisted.conversationId,
      });
      throw error;
    }
    logProcessFinished("Prepare chat", {
      user_id: userId,
      conversation_id: persisted.conversationId,
      assistant_message_id: persisted.assistantMessageId,
    });
    return {
      userId,
      conversationId: persisted.conversationId,
      assistantMessageId: persisted.assistantMessageId,
      question,
      retrieval,
    };
  }

  async complete(prepared, requestId) {
    logProcessStarted("Complete chat", {
      user_id: prepared.userId,
      conversation_id: prepared.conversationId,
      assistant_message_id: prepared.assistantMessageId,
      citations: prepared.retrieval.citations.length,
    });
    const started = performance.now();
    try {
      const answer = await ragService.answer({
        question: prepared.question,
        retrieval: prepared.retrieval,
      });
      log("info", "chat_answer_generated", {
        message: "Chat answer generated.",
        user_id: prepared.userId,
        conversation_id: prepared.conversationId,
        assistant_message_id: prepared.assistantMessageId,
        answer,
      });
      await withTransaction(
        async (client) => {
          const message = await getMessage(
            client,
            prepared.userId,
            prepared.conversationId,
            prepared.assistantMessageId,
          );
          if (!message) {
            throw new NotFoundError("Pending assistant message not found.");
          }
          await completeMessage(client, message.id, {
            content: answer,
            citations: prepared.retrieval.citations,
            modelName: llm.modelName,
            latencyMs: Math.round(performance.now() - started),
          });
          await incrementUsage(client, prepared.userId, {
            questionsAsked: 1,
            aiRequests: 1,
          });
          await recordAudit(client, {
            userId: prepared.userId,
            action: "chat.answer_generated",
            resourceType: "conversation",
            resourceId: prepared.conversationId,
            requestId,
            metadata: {
              message_id: prepared.assistantMessageId,
              citations: prepared.retrieval.citations.length,
            },
          });
        },
        { userId: prepared.userId },
      );
      logProcessFinished("Complete chat", {
        user_id: prepared.userId,
        conversation_id: prepared.conversationId,
        assistant_message_id: prepared.assistantMessageId,
        duration_ms: Math.round((performance.now() - started) * 100) / 100,
      });
      return {
        conversation_id: prepared.conversationId,
        message_id: prepared.assistantMessageId,
        answer,
        citations: prepared.retrieval.citations,
      };
    } catch (error) {
      await this.failPrepared(prepared, error.constructor?.name ?? "Error");
      logProcessFailed("Complete chat", error, {
        user_id: prepared.userId,
        conversation_id: prepared.conversationId,
        assistant_message_id: prepared.assistantMessageId,
      });
      throw error;
    }
  }

  async *stream(prepared) {
    logProcessStarted("Stream chat", {
      user_id: prepared.userId,
      conversation_id: prepared.conversationId,
      assistant_message_id: prepared.assistantMessageId,
      citations: prepared.retrieval.citations.length,
    });
    const started = performance.now();
    const fragments = [];
    yield sse("metadata", {
      conversation_id: prepared.conversationId,
      message_id: prepared.assistantMessageId,
      citations: prepared.retrieval.citations,
    });
    try {
      if (prepared.retrieval.citations.length === 0) {
        const fallback = "I could not find enough information in the selected documents.";
        fragments.push(fallback);
        log("info", "chat_stream_token_sent", {
          message: "Chat stream token sent.",
          user_id: prepared.userId,
          conversation_id: prepared.conversationId,
          assistant_message_id: prepared.assistantMessageId,
          token_text: fallback,
        });
        yield sse("token", { content: fallback });
      } else {
        const prompt = RAG_USER_PROMPT({
          question: prepared.question,
          context: prepared.retrieval.context,
        });
        let tokenBatch = "";
        const flushBatch = function* () {
          if (!tokenBatch) {
            return;
          }
          const content = tokenBatch;
          tokenBatch = "";
          log("info", "chat_stream_batch_sent", {
            message: "Chat stream batch sent.",
            user_id: prepared.userId,
            conversation_id: prepared.conversationId,
            assistant_message_id: prepared.assistantMessageId,
            batch_chars: content.length,
            batch_text: content,
          });
          yield sse("token", { content });
        };
        for await (const fragment of llm.stream(RAG_SYSTEM_PROMPT, prompt)) {
          fragments.push(fragment);
          log("info", "chat_stream_token_sent", {
            message: "Chat stream token received from model.",
            user_id: prepared.userId,
            conversation_id: prepared.conversationId,
            assistant_message_id: prepared.assistantMessageId,
            token_chars: fragment.length,
            token_text: fragment,
          });
          tokenBatch += fragment;
          if (shouldFlushStreamBatch(tokenBatch)) {
            yield* flushBatch();
          }
        }
        yield* flushBatch();
      }
      const answer = fragments.join("").trim();
      log("info", "chat_stream_answer_completed", {
        message: "Chat stream answer completed.",
        user_id: prepared.userId,
        conversation_id: prepared.conversationId,
        assistant_message_id: prepared.assistantMessageId,
        answer,
      });
      await withTransaction(
        async (client) => {
          const message = await getMessage(
            client,
            prepared.userId,
            prepared.conversationId,
            prepared.assistantMessageId,
          );
          if (!message) {
            return;
          }
          await completeMessage(client, message.id, {
            content: answer,
            citations: prepared.retrieval.citations,
            modelName: llm.modelName,
            latencyMs: Math.round(performance.now() - started),
          });
          await incrementUsage(client, prepared.userId, {
            questionsAsked: 1,
            aiRequests: 1,
          });
          await recordAudit(client, {
            userId: prepared.userId,
            action: "chat.answer_streamed",
            resourceType: "conversation",
            resourceId: prepared.conversationId,
            metadata: {
              message_id: prepared.assistantMessageId,
              citations: prepared.retrieval.citations.length,
            },
          });
        },
        { userId: prepared.userId },
      );
      logProcessFinished("Stream chat", {
        user_id: prepared.userId,
        conversation_id: prepared.conversationId,
        assistant_message_id: prepared.assistantMessageId,
        duration_ms: Math.round((performance.now() - started) * 100) / 100,
      });
      yield sse("done", { message_id: prepared.assistantMessageId });
    } catch (error) {
      await this.failPrepared(prepared, error.constructor?.name ?? "Error");
      logProcessFailed("Stream chat", error, {
        user_id: prepared.userId,
        conversation_id: prepared.conversationId,
        assistant_message_id: prepared.assistantMessageId,
      });
      yield sse("error", {
        code: "generation_failed",
        message: "Answer generation failed.",
      });
    }
  }

  async failPrepared(prepared, error) {
    await withTransaction(
      async (client) => {
        const message = await getMessage(
          client,
          prepared.userId,
          prepared.conversationId,
          prepared.assistantMessageId,
        );
        if (message) {
          await failMessage(client, message.id, error);
        }
      },
      { userId: prepared.userId },
    );
  }
}

export const chatService = new ChatService();
