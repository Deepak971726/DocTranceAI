import { motion } from "framer-motion";
import { ArrowRight, Mail, Sparkles, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthModeSwitch } from "@/components/auth/AuthModeSwitch";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { passwordSchema } from "@/lib/passwordValidation";

const schema = z
  .object({
    full_name: z.string().min(2, "Enter your name"),
    email: z.string().email("Enter a valid email"),
    password: passwordSchema,
    confirm_password: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });
type RegisterForm = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register } = useAuth();
  const form = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-md"
    >
      <Card className="auth-card glass-panel overflow-hidden">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2 text-center">
            <motion.div
              className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-glow"
              animate={{ y: [0, -4, 0], rotate: [0, -2, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </motion.div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">Create workspace</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Start with a free account</h1>
            <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
              Upload, search, summarize, and chat with your documents using local AI.
            </p>
          </div>

          <AuthModeSwitch active="register" />

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) =>
              register.mutate({
                full_name: values.full_name,
                email: values.email,
                password: values.password,
              }),
            )}
          >
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="full_name"
                  autoComplete="name"
                  placeholder="Your name"
                  className="pl-11"
                  aria-invalid={Boolean(form.formState.errors.full_name)}
                  {...form.register("full_name")}
                />
              </div>
              {form.formState.errors.full_name && (
                <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="pl-11"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordField
                id="password"
                autoComplete="new-password"
                placeholder="Minimum 6 characters"
                error={form.formState.errors.password?.message}
                {...form.register("password")}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Use 6+ characters and at least three: lowercase, uppercase, number, symbol.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Confirm password</Label>
              <PasswordField
                id="confirm_password"
                autoComplete="new-password"
                placeholder="Enter the same password again"
                error={form.formState.errors.confirm_password?.message}
                {...form.register("confirm_password")}
              />
            </div>

            <Button
              type="submit"
              variant="premium"
              size="lg"
              className="group w-full"
              disabled={register.isPending}
            >
              {register.isPending ? "Creating..." : "Create account"}
              {!register.isPending && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
