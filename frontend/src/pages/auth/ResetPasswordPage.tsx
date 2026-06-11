import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { passwordSchema } from "@/lib/passwordValidation";

const schema = z.object({
  password: passwordSchema,
});
type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { resetPassword } = useAuth();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

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
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">Secure reset</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Create a new password</h1>
            <p className="text-sm text-muted-foreground">
              Use at least 6 characters and combine different character types.
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => resetPassword.mutate({ token, password: values.password }))}
          >
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <PasswordField
                id="password"
                autoComplete="new-password"
                error={form.formState.errors.password?.message}
                {...form.register("password")}
              />
            </div>

            <Button type="submit" variant="premium" size="lg" className="w-full" disabled={!token || resetPassword.isPending}>
              {resetPassword.isPending ? "Resetting..." : "Reset password"}
            </Button>
          </form>

          <Link to="/login" className="block text-center text-sm font-semibold text-primary hover:underline">
            Back to login
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
}
