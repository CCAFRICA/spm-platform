/**
 * File Validator — DS-005 client-side file type and size validation.
 *
 * Validates files BEFORE upload to Supabase Storage.
 * Rejects dangerous executables, validates MIME types and extensions.
 */

export type FileCategory = 'spreadsheets' | 'text' | 'documents' | 'archives';

interface CategoryDef {
  extensions: string[];
  mimeTypes: string[];
  maxSize: number;
}

export const ACCEPTED_TYPES: Record<FileCategory, CategoryDef> = {
  spreadsheets: {
    extensions: ['.xlsx', '.xls', '.csv', '.tsv'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/tab-separated-values',
    ],
    maxSize: 500 * 1024 * 1024, // 500MB
  },
  text: {
    extensions: ['.txt', '.dat', '.pipe'],
    mimeTypes: ['text/plain'],
    maxSize: 500 * 1024 * 1024,
  },
  documents: {
    extensions: ['.pdf', '.pptx', '.docx'],
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxSize: 100 * 1024 * 1024, // 100MB
  },
  archives: {
    extensions: ['.zip', '.gz'],
    mimeTypes: ['application/zip', 'application/gzip'],
    maxSize: 1024 * 1024 * 1024, // 1GB
  },
};

const REJECTED_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.py', '.cmd', '.ps1', '.vbs', '.msi', '.dll', '.com'];

export interface FileValidationResult {
  valid: boolean;
  category?: FileCategory;
  error?: string;
}

/**
 * Validate a file for ingestion.
 * Returns { valid: true, category } or { valid: false, error }.
 */
export function validateFile(
  file: File,
  acceptCategories?: FileCategory[]
): FileValidationResult {
  const name = file.name.toLowerCase();
  const ext = '.' + name.split('.').pop();

  // Check rejected extensions first
  if (REJECTED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Rejected file type: ${ext} — executable files are not allowed` };
  }

  // Find matching category
  const categories = acceptCategories || (Object.keys(ACCEPTED_TYPES) as FileCategory[]);

  for (const cat of categories) {
    const def = ACCEPTED_TYPES[cat];
    const extMatch = def.extensions.includes(ext);
    const mimeMatch = file.type ? def.mimeTypes.includes(file.type) : false;

    if (extMatch || mimeMatch) {
      // Check size
      if (file.size > def.maxSize) {
        const maxMB = Math.round(def.maxSize / (1024 * 1024));
        const fileMB = (file.size / (1024 * 1024)).toFixed(1);
        return { valid: false, error: `File too large: ${fileMB}MB exceeds ${maxMB}MB limit for ${cat}` };
      }
      return { valid: true, category: cat };
    }
  }

  return { valid: false, error: `Unsupported file type: ${ext} (${file.type || 'unknown MIME'})` };
}

/**
 * Get the accept string for HTML file inputs based on categories.
 */
export function getAcceptString(categories?: FileCategory[]): string {
  const cats = categories || (Object.keys(ACCEPTED_TYPES) as FileCategory[]);
  const extensions: string[] = [];
  const mimes: string[] = [];

  for (const cat of cats) {
    const def = ACCEPTED_TYPES[cat];
    extensions.push(...def.extensions);
    mimes.push(...def.mimeTypes);
  }

  return [...new Set([...extensions, ...mimes])].join(',');
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
