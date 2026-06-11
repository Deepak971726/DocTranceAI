import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Brain, Database, FileText, MessageSquareText, Upload } from "lucide-react";
import { StatusBadge } from "@/components/documents/StatusBadge";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/hooks/useDocuments";
import { useSubscription, useUsage } from "@/hooks/useBilling";
import { formatBytes, formatDate } from "@/utils/format";

function MetricCard({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export default function DashboardPage() {
  const documents = useDocuments();
  const usage = useUsage();
  const subscription = useSubscription();
  const items = documents.data?.items ?? [];
  const usageItems = [...(usage.data ?? [])].reverse();
  const totals = usageItems.reduce(
    (acc, item) => ({
      questions: acc.questions + item.questions_asked,
      ai: acc.ai + item.ai_requests,
      storage: Math.max(acc.storage, item.storage_bytes),
    }),
    { questions: 0, ai: 0, storage: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your document intelligence workspace</p>
        </div>
        <Button asChild size="sm">
          <Link to="/documents/upload"><Upload className="h-4 w-4" />Upload</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Documents" value={String(documents.data?.total ?? 0)} sub="Total uploaded" icon={FileText} />
        <MetricCard title="Questions asked" value={String(totals.questions)} sub="All time" icon={MessageSquareText} />
        <MetricCard title="Storage used" value={formatBytes(totals.storage)} sub="Plan metering" icon={Database} />
        <MetricCard title="AI requests" value={String(totals.ai)} sub={subscription.data?.plan_name ?? "Free plan"} icon={Brain} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 rounded-xl border bg-card p-5">
          <p className="mb-4 font-medium">Usage trend</p>
          <div className="h-64">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={{ width: 480, height: 256 }}
            >
              <AreaChart data={usageItems}>
                <defs>
                  <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="usage_date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area dataKey="questions_asked" stroke="hsl(var(--primary))" fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <p className="mb-4 font-medium">Recent uploads</p>
          {items.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No documents yet</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/documents/upload">Upload your first document</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.slice(0, 5).map((doc) => (
                <Link
                  key={doc.id}
                  to={`/documents/${doc.id}`}
                  className="flex items-center justify-between rounded-lg border bg-background p-3 hover:bg-secondary"
                >
                  <div>
                    <p className="text-sm font-medium">{doc.original_filename}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(doc.file_size)}</p>
                  </div>
                  <StatusBadge status={doc.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
