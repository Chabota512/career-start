import { DocCategory, StoredDocument } from '@/context/AppContext';

const CV_PRIORITY: DocCategory[] = [
  'CV / Resume',
  'Academic Transcript',
  'Certificate',
  'Cover Letter',
  'Reference Letter',
  'Portfolio',
  'Other',
];

export function getCvContent(docs: StoredDocument[]): string | undefined {
  for (const cat of CV_PRIORITY) {
    const doc = docs.find(d => d.category === cat && d.extractedText?.trim());
    if (doc) return doc.extractedText;
  }
  return undefined;
}

export function buildDocumentsContext(docs: StoredDocument[]): string | undefined {
  const docsWithText = CV_PRIORITY
    .flatMap(cat => docs.filter(d => d.category === cat && d.extractedText?.trim()))
    .slice(0, 3);
  if (!docsWithText.length) return undefined;
  return docsWithText
    .map(d => `--- ${d.category}: ${d.name} ---\n${d.extractedText}`)
    .join('\n\n');
}
