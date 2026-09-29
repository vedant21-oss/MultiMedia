export type Modality = 'video' | 'audio' | 'image' | 'document' | 'presentation' | 'text' | 'subtitle' | 'other';
export type AssetStatus = 'uploaded' | 'processing' | 'ready' | 'failed';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type GenerationSource = 'live' | 'demo';

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  storage_used_bytes: number;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

export interface ProjectStats {
  assets: number;
  ready: number;
  processing: number;
  failed: number;
  segments: number;
  generated: number;
  duration_sec: number;
  by_modality: Record<string, number>;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  context: string;
  color: string;
  tags: string;
  created_at: string;
  updated_at: string;
  stats: ProjectStats;
}

export interface Segment {
  id: string;
  asset_id: string;
  kind: string;
  ordinal: number;
  text: string;
  start_sec?: number | null;
  end_sec?: number | null;
  page_number?: number | null;
  slide_number?: number | null;
  speaker: string;
  frame_key: string;
  confidence: number;
}

export interface Asset {
  id: string;
  project_id: string;
  original_filename: string;
  mime_type: string;
  modality: Modality;
  size_bytes: number;
  status: AssetStatus;
  status_message: string;
  error: string;
  progress: number;
  duration_sec?: number | null;
  width?: number | null;
  height?: number | null;
  page_count?: number | null;
  title: string;
  summary: string;
  topics: string[];
  keywords: string[];
  language: string;
  thumbnail_key: string;
  analysis_source: string;
  processing_ms: number;
  is_favorite: boolean;
  tags: string;
  created_at: string;
  extra: Record<string, unknown>;
  segment_count: number;
}

export interface AssetDetail extends Asset {
  full_text: string;
  segments: Segment[];
}

export interface Citation {
  marker: number;
  segment_id?: string | null;
  asset_id?: string | null;
  asset_name: string;
  asset_title: string;
  modality: string;
  kind: string;
  quote: string;
  start_sec?: number | null;
  end_sec?: number | null;
  page_number?: number | null;
  slide_number?: number | null;
  locator_label: string;
  relevance: number;
}

export interface GeneratedContent {
  id: string;
  project_id: string;
  content_type: string;
  platform: string;
  title: string;
  body: string;
  structured: unknown;
  tone: string;
  language: string;
  audience: string;
  length: string;
  status: string;
  is_favorite: boolean;
  tags: string;
  variant_index: number;
  model_used: string;
  generation_source: GenerationSource;
  prompt_template: string;
  prompt_version: string;
  source_asset_ids: string[];
  tokens_used: number;
  generation_ms: number;
  created_at: string;
  updated_at: string;
  citations: Citation[];
  version_count: number;
}

export interface GenerateResponse {
  items: GeneratedContent[];
  mode: string;
  sources_note: string;
  sources_used: { id: string; filename: string; modality: string; title: string }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence: string;
  generation_source: GenerationSource;
  latency_ms: number;
  created_at: string;
  citations: Citation[];
}

export interface ChatResponse {
  conversation_id: string;
  message: ChatMessage;
  retrieval_mode: string;
  follow_ups: string[];
}

export interface Conversation {
  id: string;
  project_id: string;
  title: string;
  selected_asset_ids: string[];
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Job {
  id: string;
  asset_id?: string | null;
  kind: string;
  status: JobStatus;
  progress: number;
  step: string;
  error: string;
  attempts: number;
  result: Record<string, unknown>;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface Highlight {
  start_sec: number;
  end_sec: number;
  title: string;
  reason: string;
  transcript_excerpt: string;
  suggested_platform: string;
  review_note: string;
  duration_sec: number;
  source: string;
}

export interface VideoSegments {
  duration_sec?: number | null;
  scenes: { start_sec: number; end_sec: number; description: string; frame_key?: string }[];
  transcript: { id: string; start_sec: number; end_sec: number; speaker: string; text: string }[];
  frames: { time_sec: number; key: string }[];
  has_transcript: boolean;
  note: string;
}

export interface Capabilities {
  ai_mode: 'live' | 'demo' | 'degraded';
  features: Record<string, { available: boolean; mode?: string; needs?: string | null; fallback?: string }>;
  limits: { max_upload_mb: number; user_quota_mb: number; max_files_per_upload: number };
}

export interface Analytics {
  disclaimer: string;
  window_days: number;
  totals: Record<string, number>;
  processing: { succeeded: number; failed: number; success_rate: number | null; avg_processing_ms: number };
  by_modality: Record<string, number>;
  by_content_type: Record<string, number>;
  by_platform: Record<string, number>;
  by_status: Record<string, number>;
  daily: { assets: { date: string; count: number }[]; content: { date: string; count: number }[] };
}

export interface BrandProfile {
  id: string;
  name: string;
  description: string;
  tone: string;
  audience: string;
  preferred_phrases: string;
  banned_phrases: string;
  writing_rules: string;
  emoji_policy: string;
  is_default: boolean;
  created_at: string;
}

export interface CalendarEntry {
  id: string;
  project_id: string;
  content_id?: string | null;
  title: string;
  notes: string;
  platform: string;
  scheduled_for: string;
  status: string;
  campaign: string;
  published_at?: string | null;
}

export interface ApiErrorBody {
  detail: string;
  code: string;
  fields?: Record<string, string>;
  retryable?: boolean;
}
