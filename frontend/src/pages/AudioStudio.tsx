import { ModalityStudio } from '@/components/ModalityStudio';

export default function AudioStudio() {
  return (
    <ModalityStudio
      title="Audio & Podcast Studio"
      subtitle="Transcripts with timestamps, chapter-style show notes, episode copy and subtitle exports."
      modalities={['audio']}
      capabilityKey="transcription"
      contentTypes={['show_notes', 'blog_article', 'caption', 'linkedin_post', 'study_notes', 'newsletter']}
      emptyHint="Upload an MP3, WAV or M4A. Transcription needs an AI key; duration and stream metadata are read locally by FFmpeg."
    />
  );
}
