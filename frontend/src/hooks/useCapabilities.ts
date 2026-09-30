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

/**
 * What one named feature can do on THIS deployment, e.g. `video_clipping`.
 * Vercel has no FFmpeg or Tesseract, so the UI disables those actions and
 * says what is missing instead of letting a click fail.
 */
export function useFeature(name: string) {
  const { data } = useCapabilities();
  const feature = data?.features?.[name];
  return {
    available: feature?.available ?? true,   // assume yes until we know better
    needs: feature?.needs ?? null,
    maxUploadMb: data?.limits?.max_upload_mb,
  };
}
