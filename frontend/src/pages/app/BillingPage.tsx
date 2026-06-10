import { PricingCards } from "@/components/billing/PricingCards";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription, useUsage } from "@/hooks/useBilling";
import { formatBytes } from "@/utils/format";

export default function BillingPage() {
  const subscription = useSubscription();
  const usage = useUsage();
  const latest = usage.data?.[0];

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Billing" title="Plans and usage" description="The backend is Stripe-ready with plan status and usage metering already modeled." />
      <Card>
        <CardHeader>
          <CardTitle>Current subscription</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="mt-2 font-semibold">{subscription.data?.plan_name ?? "FREE"}</p>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="mt-2" variant="success">{subscription.data?.status ?? "ACTIVE"}</Badge>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">Documents uploaded</p>
            <p className="mt-2 font-semibold">{latest?.documents_uploaded ?? 0}</p>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">Storage</p>
            <p className="mt-2 font-semibold">{formatBytes(latest?.storage_bytes ?? 0)}</p>
          </div>
        </CardContent>
      </Card>
      <PricingCards />
    </div>
  );
}

