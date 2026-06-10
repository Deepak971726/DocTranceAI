import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface MetricCardProps {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "blue" | "emerald" | "amber" | "violet";
}

const toneClasses = {
  blue: "from-blue-500/15 text-blue-500",
  emerald: "from-emerald-500/15 text-emerald-500",
  amber: "from-amber-500/15 text-amber-500",
  violet: "from-violet-500/15 text-violet-500",
};

export function MetricCard({ title, value, helper, icon: Icon, tone = "blue" }: MetricCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className={cn("rounded-2xl bg-gradient-to-br to-transparent p-3", toneClasses[tone])}>
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

