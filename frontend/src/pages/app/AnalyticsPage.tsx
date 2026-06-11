import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUsage } from "@/hooks/useBilling";
import { formatDate } from "@/utils/format";

export default function AnalyticsPage() {
  const usage = useUsage();
  const data = [...(usage.data ?? [])].reverse();

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Analytics" title="Usage analytics" description="Monitor questions, AI requests, storage, and upload patterns." />
      <Card>
        <CardHeader>
          <CardTitle>Questions and AI requests</CardTitle>
        </CardHeader>
        <CardContent className="h-[28rem] min-w-0">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 720, height: 448 }}
          >
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="usage_date" tickFormatter={formatDate} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="questions_asked" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              <Bar dataKey="ai_requests" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
