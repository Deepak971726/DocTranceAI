import { motion } from "framer-motion";
import { Mail, UserRound } from "lucide-react";
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
  full_name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(12, "At least 12 characters"),
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
      <Card className="glass-panel overflow-hidden">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2 text-center">
            <motion.div
              className="mx-auto mb-4 h-1.5 w-24 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
              animate={{ opacity: [0.55, 1, 0.55], scaleX: [0.82, 1, 0.82] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">Create workspace</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Start with a free account</h1>
            <p className="text-sm text-muted-foreground">Use local AI document tools without an OpenAI key.</p>
          </div>

          <AuthModeSwitch active="register" />

          <form className="space-y-4" onSubmit={form.handleSubmit((values) => register.mutate(values))}>
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
                placeholder="Min 12 chars, upper + number + symbol"
                error={form.formState.errors.password?.message}
                {...form.register("password")}
              />
              <p className="text-xs text-muted-foreground">e.g. TestPass@123 — needs uppercase, number &amp; symbol</p>
            </div>

            <Button type="submit" variant="premium" size="lg" className="w-full" disabled={register.isPending}>
              {register.isPending ? "Creating..." : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
