import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Globe, Youtube, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '../../lib/api/http';

interface LinkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string, type: 'web' | 'youtube') => Promise<void>;
}

export const LinkImportDialog: React.FC<LinkImportDialogProps> = ({ open, onOpenChange, onSubmit }) => {
  const [activeTab, setActiveTab] = useState<'web' | 'youtube'>('web');
  const [url, setUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!url.trim() || isImporting) return;
    setIsImporting(true);
    try {
      await onSubmit(url.trim(), activeTab);
      setUrl('');
      onOpenChange(false);
      toast.success('Link added. It is being processed now.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not import that link.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a web page or YouTube video</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'web' | 'youtube')}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="web" className="flex items-center gap-1.5 text-xs">
              <Globe className="h-3.5 w-3.5" />
              <span>Web page</span>
            </TabsTrigger>
            <TabsTrigger value="youtube" className="flex items-center gap-1.5 text-xs">
              <Youtube className="h-3.5 w-3.5 text-red-500" />
              <span>YouTube video</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="web" className="space-y-2 pt-3">
            <Input
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              className="text-xs"
            />
            <p className="text-[11px] text-slate-400">The readable text of the page is saved. Pages that need a login are not supported.</p>
          </TabsContent>

          <TabsContent value="youtube" className="space-y-2 pt-3">
            <Input
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              className="text-xs"
            />
            <p className="text-[11px] text-slate-400">The video's captions are used as the source. Videos without captions cannot be imported.</p>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleImport} disabled={!url.trim() || isImporting}>
            {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
