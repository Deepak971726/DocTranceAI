import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings.api";
import { queryKeys } from "@/services/queryKeys";

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.auth,
    queryFn: settingsApi.profile,
  });
}

