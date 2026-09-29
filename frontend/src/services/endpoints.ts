/** One typed function per API route. Components never build URLs themselves. */
import { api } from './api';
import type {
  Analytics, Asset, AssetDetail, AuthResponse, BrandProfile, Capabilities, CalendarEntry,
  ChatResponse, Conversation, ChatMessage, GenerateResponse, GeneratedContent, Highlight,
  Job, Project, User, VideoSegments,
} from '@/types';

export const authApi = {
  register: (body: { full_name: string; email: string; password: string }) =>
    api.post<AuthResponse>('/auth/register', body).then((r) => r.data),
  guest: () => api.post<AuthResponse>('/auth/guest').then((r) => r.data),
  login: (body: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', body).then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  updateMe: (body: Partial<Pick<User, 'full_name' | 'bio' | 'avatar_url'>>) =>
    api.patch<User>('/auth/me', body).then((r) => r.data),
  changePassword: (body: { current_password: string; new_password: string }) =>
    api.post('/auth/change-password', body).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
};

export const systemApi = {
  health: () => api.get('/health').then((r) => r.data),
  aiHealth: () => api.get('/health/ai').then((r) => r.data),
  capabilities: () => api.get<Capabilities>('/capabilities').then((r) => r.data),
};

export const projectApi = {
  list: () => api.get<Project[]>('/projects').then((r) => r.data),
  get: (id: string) => api.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (body: { name: string; description?: string; context?: string }) =>
    api.post<Project>('/projects', body).then((r) => r.data),
  update: (id: string, body: Partial<Project>) =>
    api.patch<Project>(`/projects/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/projects/${id}`).then((r) => r.data),
};

export const mediaApi = {
  list: (projectId: string, params?: Record<string, string>) =>
    api.get<Asset[]>(`/projects/${projectId}/media`, { params }).then((r) => r.data),
  get: (id: string) => api.get<AssetDetail>(`/media/${id}`).then((r) => r.data),
  status: (id: string) => api.get<Asset>(`/media/${id}/status`).then((r) => r.data),
  upload: (projectId: string, files: File[], onProgress?: (pct: number) => void) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return api
      .post<{ assets: Asset[]; job_ids: string[]; skipped: { filename: string; reason: string }[] }>(
        `/projects/${projectId}/media`,
        form,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
          },
        },
      )
      .then((r) => r.data);
  },
  update: (id: string, body: Partial<Pick<Asset, 'title' | 'tags' | 'is_favorite'>>) =>
    api.patch<Asset>(`/media/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/media/${id}`).then((r) => r.data),
  reprocess: (id: string) => api.post<Job>(`/media/${id}/reprocess`).then((r) => r.data),
};

export const jobApi = {
  get: (id: string) => api.get<Job>(`/jobs/${id}`).then((r) => r.data),
  retry: (id: string) => api.post<Job>(`/jobs/${id}/retry`).then((r) => r.data),
};

export const generateApi = {
  options: () =>
    api
      .get<{
        content_types: string[];
        platforms: string[];
        tones: string[];
        lengths: string[];
        platform_rules: Record<string, string>;
        max_variations: number;
      }>('/generate/options')
      .then((r) => r.data),
  run: (body: Record<string, unknown>) =>
    api.post<GenerateResponse>('/generate', body).then((r) => r.data),
  list: (projectId: string, params?: Record<string, string | boolean>) =>
    api.get<GeneratedContent[]>(`/projects/${projectId}/content`, { params }).then((r) => r.data),
  get: (id: string) => api.get<GeneratedContent>(`/content/${id}`).then((r) => r.data),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<GeneratedContent>(`/content/${id}`, body).then((r) => r.data),
  versions: (id: string) => api.get(`/content/${id}/versions`).then((r) => r.data),
  restore: (id: string, version: number) =>
    api.post<GeneratedContent>(`/content/${id}/restore/${version}`).then((r) => r.data),
  remove: (id: string) => api.delete(`/content/${id}`).then((r) => r.data),
  exportUrl: (id: string, fmt: 'md' | 'txt' | 'json') => `/content/${id}/export?fmt=${fmt}`,
};

export const chatApi = {
  send: (body: { project_id: string; message: string; conversation_id?: string | null; asset_ids?: string[] }) =>
    api.post<ChatResponse>('/chat', body).then((r) => r.data),
  conversations: (projectId: string) =>
    api.get<Conversation[]>(`/projects/${projectId}/conversations`).then((r) => r.data),
  messages: (id: string) => api.get<ChatMessage[]>(`/conversations/${id}`).then((r) => r.data),
  remove: (id: string) => api.delete(`/conversations/${id}`).then((r) => r.data),
  search: (body: { project_id: string; query: string; asset_ids?: string[]; limit?: number }) =>
    api.post<{ results: import('@/types').Citation[]; mode: string; total: number }>('/search', body)
      .then((r) => r.data),
};

export const videoApi = {
  segments: (id: string) => api.get<VideoSegments>(`/video/${id}/segments`).then((r) => r.data),
  highlights: (id: string, body: Record<string, unknown>) =>
    api.post<{ clips: Highlight[]; mode: string; note: string }>(`/video/${id}/highlights`, body)
      .then((r) => r.data),
  clip: (id: string, body: Record<string, unknown>) =>
    api.post<Job>(`/video/${id}/clip`, body).then((r) => r.data),
  subtitles: (id: string, body: { fmt: 'srt' | 'vtt'; start_sec?: number }) =>
    api.post(`/video/${id}/subtitles`, body, { responseType: 'blob' }).then((r) => r.data as Blob),
  frames: (id: string, count = 12) =>
    api.get<{ frames: { time_sec: number; key: string }[] }>(`/video/${id}/frames`, { params: { count } })
      .then((r) => r.data),
};

export const studioApi = {
  thumbnailConcepts: (mediaId: string) =>
    api.post(`/thumbnails/${mediaId}/concepts`).then((r) => r.data),
  thumbnailPresets: () => api.get('/thumbnails/presets').then((r) => r.data),
  renderThumbnail: (mediaId: string, preset: string, body: Record<string, unknown>) =>
    api.post(`/thumbnails/${mediaId}/render?preset=${preset}`, body, { responseType: 'blob' })
      .then((r) => r.data as Blob),
  brands: () => api.get<BrandProfile[]>('/brand-profiles').then((r) => r.data),
  createBrand: (body: Record<string, unknown>) =>
    api.post<BrandProfile>('/brand-profiles', body).then((r) => r.data),
  updateBrand: (id: string, body: Record<string, unknown>) =>
    api.patch<BrandProfile>(`/brand-profiles/${id}`, body).then((r) => r.data),
  removeBrand: (id: string) => api.delete(`/brand-profiles/${id}`).then((r) => r.data),
  library: (params: Record<string, string | boolean | undefined>) =>
    api.get('/library', { params }).then((r) => r.data),
  calendar: (params?: Record<string, string>) =>
    api.get<CalendarEntry[]>('/calendar', { params }).then((r) => r.data),
  createEntry: (body: Record<string, unknown>) =>
    api.post<CalendarEntry>('/calendar', body).then((r) => r.data),
  updateEntry: (id: string, body: Record<string, unknown>) =>
    api.patch<CalendarEntry>(`/calendar/${id}`, body).then((r) => r.data),
  removeEntry: (id: string) => api.delete(`/calendar/${id}`).then((r) => r.data),
  social: () => api.get('/social/connections').then((r) => r.data),
  analytics: (params?: Record<string, string | number>) =>
    api.get<Analytics>('/analytics/overview', { params }).then((r) => r.data),
  notifications: () => api.get('/notifications').then((r) => r.data),
  readAll: () => api.post('/notifications/read-all').then((r) => r.data),
};

/** Downloads a blob as a file without leaving the page. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
