import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { FileText, FileDown, Layers, Download } from 'lucide-react';
import { useExport } from '../../hooks/useExport';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  content: string;
  citations?: Array<{ snippet: string; docName: string }>;
  flashcards?: Array<{ front: string; back: string }>;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  title,
  content,
  citations = [],
  flashcards = [],
}) => {
  const { exportMarkdown, exportPDF, exportAnkiCSV } = useExport();
  const [format, setFormat] = useState<'pdf' | 'markdown' | 'anki'>(
    flashcards.length > 0 ? 'anki' : 'pdf'
  );
  const [includeCitations, setIncludeCitations] = useState(true);
  const [filename, setFilename] = useState(title.replace(/[^a-zA-Z0-9_-]/g, '_'));

  const handleExport = () => {
    if (format === 'markdown') {
      let fullContent = `# ${title}\n\n${content}\n`;
      if (includeCitations && citations.length > 0) {
        fullContent += `\n\n## Grounded Citations\n`;
        citations.forEach((c, idx) => {
          fullContent += `[${idx + 1}] **${c.docName}**: "${c.snippet}"\n\n`;
        });
      }
      exportMarkdown(filename, fullContent);
    } else if (format === 'pdf') {
      exportPDF(title, content, includeCitations ? citations : []);
    } else if (format === 'anki' && flashcards.length > 0) {
      exportAnkiCSV(title, flashcards);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Download className="h-4 w-4" />
            </div>
            <DialogTitle>Export Study Material</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2 text-xs">
          {/* Format Selection */}
          <div>
            <label className="text-[11px] font-medium text-slate-500 block mb-1.5">
              Select Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  format === 'pdf'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <FileDown className="h-4 w-4" />
                <span>PDF Document</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('markdown')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  format === 'markdown'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Markdown (.md)</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('anki')}
                disabled={flashcards.length === 0}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                  format === 'anki'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                } ${flashcards.length === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <Layers className="h-4 w-4" />
                <span>Anki (TSV/CSV)</span>
              </button>
            </div>
          </div>

          {/* Filename Input */}
          <div>
            <label className="text-[11px] font-medium text-slate-500">File Name</label>
            <Input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>

          {/* Citations toggle */}
          {format !== 'anki' && citations.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-700 dark:text-slate-300">
                Include Grounded Citations & Snippets ({citations.length})
              </span>
              <Switch checked={includeCitations} onCheckedChange={setIncludeCitations} />
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" />
            <span>Download File</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
