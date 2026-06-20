import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-white/35 bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-primary hover:shadow-md hover:shadow-primary/25",
        premium:
          "border border-white/40 bg-[linear-gradient(120deg,hsl(var(--liquid-aqua)),hsl(var(--primary))_44%,hsl(var(--liquid-rose)))] text-white shadow-glow hover:-translate-y-0.5 hover:saturate-150",
        secondary: "liquid-control text-secondary-foreground hover:-translate-y-0.5 hover:border-primary/35",
        outline: "liquid-control text-foreground hover:-translate-y-0.5 hover:border-primary/35",
        ghost: "hover:bg-white/30 hover:text-foreground dark:hover:bg-white/10",
        destructive: "border border-white/30 bg-destructive text-destructive-foreground shadow-sm backdrop-blur-xl hover:bg-destructive/90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
