import { useCallback } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

export function useExport() {
  const exportMarkdown = useCallback((filename: string, content: string) => {
    try {
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename.replace(/\.md$/, '')}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}.md successfully`);
    } catch {
      toast.error('Failed to export Markdown file');
    }
  }, []);

  const exportPDF = useCallback((title: string, content: string, citations?: { snippet: string; docName: string }[]) => {
    try {
      const doc = new jsPDF();
      const margin = 16;
      let yPos = 24;

      // Header
      doc.setFontSize(18);
      doc.setTextColor(16, 185, 129); // Emerald
      doc.text('StudyPilot Export', margin, yPos);
      yPos += 10;

      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(title, margin, yPos);
      yPos += 10;

      doc.setDrawColor(226, 232, 240);
      doc.line(margin, yPos, 195, yPos);
      yPos += 10;

      // Content text wrapped
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      const splitLines = doc.splitTextToSize(content.replace(/[#*`]/g, ''), 175);
      
      splitLines.forEach((line: string) => {
        if (yPos > 275) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, margin, yPos);
        yPos += 6;
      });

      if (citations && citations.length > 0) {
        yPos += 10;
        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(12);
        doc.setTextColor(16, 185, 129);
        doc.text('Grounded Citations', margin, yPos);
        yPos += 8;

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        citations.forEach((cit, idx) => {
          if (yPos > 275) {
            doc.addPage();
            yPos = 20;
          }
          const citText = `[${idx + 1}] ${cit.docName}: "${cit.snippet}"`;
          const citLines = doc.splitTextToSize(citText, 175);
          doc.text(citLines, margin, yPos);
          yPos += citLines.length * 5 + 4;
        });
      }

      doc.save(`${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`);
      toast.success('Generated and downloaded PDF document');
    } catch {
      toast.error('Failed to generate PDF');
    }
  }, []);

  const exportAnkiCSV = useCallback((deckTitle: string, cards: { front: string; back: string }[]) => {
    try {
      const csvRows = cards.map((c) => {
        const cleanFront = `"${c.front.replace(/"/g, '""')}"`;
        const cleanBack = `"${c.back.replace(/"/g, '""')}"`;
        return `${cleanFront}\t${cleanBack}`;
      });
      const content = csvRows.join('\n');
      const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${deckTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_anki.tsv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${cards.length} cards to Anki-compatible TSV`);
    } catch {
      toast.error('Failed to export Anki flashcards');
    }
  }, []);

  return {
    exportMarkdown,
    exportPDF,
    exportAnkiCSV,
  };
}
