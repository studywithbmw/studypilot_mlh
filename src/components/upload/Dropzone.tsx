import React, { useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { UploadCloud, File, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface DropzoneProps {
  onFilesAccepted: (files: File[]) => void;
  maxSizeMb?: number;
  disabled?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFilesAccepted,
  maxSizeMb = 50,
  disabled = false,
}) => {
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (fileRejections.length > 0) {
        toast.error(`Some files were rejected. Max file size is ${maxSizeMb}MB.`);
      }
      if (acceptedFiles.length > 0) {
        onFilesAccepted(acceptedFiles);
      }
    },
    [onFilesAccepted, maxSizeMb]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: maxSizeMb * 1024 * 1024,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none ${
        isDragActive
          ? 'border-emerald-500 bg-emerald-500/10 scale-101'
          : 'border-slate-300 dark:border-slate-800 hover:border-emerald-500/50 bg-white/50 dark:bg-slate-900/40'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-500 mb-3 border border-emerald-500/20">
        <UploadCloud className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
        {isDragActive ? 'Drop your files here' : 'Drag & drop documents here, or browse'}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-3">
        Supports PDF, DOCX, PPTX, TXT, and Markdown files up to {maxSizeMb}MB each.
      </p>
      <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-medium">
        Fast local chunking & embeddings
      </span>
    </div>
  );
};
