import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

interface AuthModeSwitchProps {
  active: "login" | "register";
}

const items = [
  { key: "login", label: "Login", to: "/login" },
  { key: "register", label: "Sign up", to: "/register" },
] as const;

export function AuthModeSwitch({ active }: AuthModeSwitchProps) {
  return (
    <div className="grid grid-cols-2 rounded-full border bg-muted/60 p-1">
      {items.map((item) => {
        const isActive = item.key === active;

        return (
          <Link
            key={item.key}
            to={item.to}
            className={cn(
              "relative isolate rounded-full px-4 py-2 text-center text-sm font-semibold text-muted-foreground transition-colors",
              isActive && "text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="auth-mode-pill"
                className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
