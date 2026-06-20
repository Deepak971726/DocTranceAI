import { z } from "zod";

const passwordSchema = z
  .string()
  .min(6)
  .max(128)
  .superRefine((value, context) => {
    if (Buffer.byteLength(value, "utf8") > 72) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must be at most 72 UTF-8 bytes",
      });
    }
    const checks = [
      /[a-z]/.test(value),
      /[A-Z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value),
    ];
    if (checks.filter(Boolean).length < 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include at least three of: lowercase, uppercase, number, symbol",
      });
    }
  });

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  full_name: z.string().trim().min(1).max(200).nullable().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({ refresh_token: z.string().min(32) });
export const logoutSchema = refreshSchema;
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: passwordSchema,
});

export const searchSchema = z.object({
  query: z.string().min(2).max(2000),
  document_ids: z.array(z.string().uuid()).max(50).nullable().optional(),
  top_k: z.number().int().min(1).max(50).default(10),
});

export const chatSchema = z.object({
  question: z.string().min(2).max(10000),
  conversation_id: z.string().uuid().nullable().optional(),
  document_ids: z.array(z.string().uuid()).min(1).max(50),
  stream: z.boolean().default(false),
});

export const apiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().min(1)).default(["documents:read", "chat:write"]),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
});
