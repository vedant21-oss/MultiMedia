import { ModalityStudio } from '@/components/ModalityStudio';

export default function ImageStudio() {
  return (
    <ModalityStudio
      title="Image Studio"
      subtitle="Vision descriptions, OCR text extraction, accessibility alt text and social captions."
      modalities={['image']}
      capabilityKey="vision_understanding"
      contentTypes={['caption', 'instagram_post', 'x_post', 'linkedin_post', 'blog_article']}
      emptyHint="Upload a JPG, PNG or WEBP. OCR runs locally with Tesseract even without an AI key."
    />
  );
}
