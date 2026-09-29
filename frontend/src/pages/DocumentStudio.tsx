import { ModalityStudio } from '@/components/ModalityStudio';

export default function DocumentStudio() {
  return (
    <ModalityStudio
      title="Document Studio"
      subtitle="PDFs, Word files and slide decks — parsed with page and slide numbers preserved, then turned into whatever you need."
      modalities={['document', 'presentation', 'text']}
      contentTypes={[
        'study_notes', 'quiz', 'flashcards', 'blog_article',
        'video_script', 'newsletter', 'linkedin_post',
      ]}
      emptyHint="Upload a PDF, DOCX, PPTX or text file. Text extraction and the OCR fallback for scans both run locally — no AI key required."
    />
  );
}
