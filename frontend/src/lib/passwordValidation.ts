import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .refine(
    (value) =>
      [
        /[a-z]/.test(value),
        /[A-Z]/.test(value),
        /\d/.test(value),
        /[^a-zA-Z0-9]/.test(value),
      ].filter(Boolean).length >= 3,
    "Use at least three of: lowercase, uppercase, number, symbol",
  );
