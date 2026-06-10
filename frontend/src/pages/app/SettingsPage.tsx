import { useState } from "react";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/useBilling";
import { useProfile } from "@/hooks/useProfile";
import { formatDateTime } from "@/utils/format";

export default function SettingsPage() {
  const profile = useProfile();
  const apiKeys = useApiKeys();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const [keyName, setKeyName] = useState("Production key");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Settings"
        title="Account and security"
        description="Manage profile visibility, theme preferences, and API key access."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={profile.data?.full_name ?? ""} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={profile.data?.email ?? ""} readOnly />
            </div>
            <Badge variant="success">Active account</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose the interface theme for the whole app.</p>
            <ThemeToggle />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            API keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input value={keyName} onChange={(event) => setKeyName(event.target.value)} />
            <Button
              onClick={() =>
                createApiKey.mutate(
                  { name: keyName, scopes: ["documents:read", "chat:write"] },
                  { onSuccess: (key) => setCreatedKey(key.key) },
                )
              }
            >
              Create key
            </Button>
          </div>

          {createdKey && (
            <div className="rounded-2xl border bg-emerald-500/10 p-4 font-mono text-sm text-emerald-700 dark:text-emerald-200">
              {createdKey}
            </div>
          )}

          <div className="divide-y overflow-hidden rounded-3xl border bg-background/50">
            {(apiKeys.data ?? []).map((key) => (
              <div key={key.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{key.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {key.key_prefix} - Created {formatDateTime(key.created_at)}
                  </p>
                </div>
                <Button variant="outline" onClick={() => revokeApiKey.mutate(key.id)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
