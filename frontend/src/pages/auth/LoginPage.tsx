import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
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

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const form = useForm<LoginForm>({ resolver: zodResolver(schema) });

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
              animate={{ y: [0, -4, 0], rotate: [0, 2, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <LockKeyhole className="h-6 w-6" aria-hidden="true" />
            </motion.div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">Welcome back</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in to DocTraceAI</h1>
            <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
              Continue securely to your documents, cited answers, and local AI workspace.
            </p>
          </div>

          <AuthModeSwitch active="login" />

          <form className="space-y-4" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
            <motion.div
              className="space-y-1.5"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.35 }}
            >
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
            </motion.div>

            <motion.div
              className="space-y-1.5"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.18, duration: 0.35 }}
            >
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <PasswordField
                id="password"
                autoComplete="current-password"
                error={form.formState.errors.password?.message}
                {...form.register("password")}
              />
            </motion.div>

            <Button
              type="submit"
              variant="premium"
              size="lg"
              className="group w-full"
              disabled={login.isPending}
            >
              {login.isPending ? "Signing in..." : "Sign in securely"}
              {!login.isPending && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              )}
            </Button>
          </form>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            Encrypted session and private document access
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
