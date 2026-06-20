import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "liquid-chip inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "text-primary",
        secondary: "text-secondary-foreground",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
        destructive: "border-destructive/20 bg-destructive/10 text-destructive",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
