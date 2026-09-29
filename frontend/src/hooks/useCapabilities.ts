import { useQuery } from '@tanstack/react-query';
import { systemApi } from '@/services/endpoints';

/**
 * What this deployment can actually do right now.
 * Drives the honest "Demo mode" badges instead of pretending every feature is live.
 */
export function useCapabilities() {
  return useQuery({
    queryKey: ['capabilities'],
    queryFn: systemApi.capabilities,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
