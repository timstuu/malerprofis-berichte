import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, addDays, getISOWeek } from 'date-fns';

export const countWeekdays = (start: Date | string, end: Date | string) => {
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  let curr = new Date(s);
  while (curr <= e) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    curr.setDate(curr.getDate() + 1);
  }
  return count;
};

export const getContinuousPeriods = (dates: Date[]) => {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const periods: { start: Date; end: Date }[] = [];
  
  let currentStart = sorted[0];
  let currentEnd = sorted[0];
  
  for (let i = 1; i < sorted.length; i++) {
    const diffTime = sorted[i].getTime() - currentEnd.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 3) {
      currentEnd = sorted[i];
    } else {
      periods.push({ start: currentStart, end: currentEnd });
      currentStart = sorted[i];
      currentEnd = sorted[i];
    }
  }
  periods.push({ start: currentStart, end: currentEnd });
  return periods;
};

export interface GeneratePDFParams {
  type: 'wochenbericht' | 'abnahme' | 'urlaubsantrag';
  signatures: { employee?: string; customer?: string };
  userName: { firstName: string; lastName: string };
  weeklyEntries: Record<string, {
    entries: {
      id: string;
      project: string;
      projectNumber: string;
      description: string;
      hours: number;
      startTime?: string;
      endTime?: string;
      pause?: number;
    }[];
  }>;
  selectedWeek: Date;
  abnahme: {
    address: string;
    number: string;
    participants: string[];
    type: 'teil' | 'gesamt';
    status: 'ohne' | 'mit';
    tasks: { text: string; photo?: string }[];
    employeeSignature?: string;
    customerSignature?: string;
  };
  yearlyLeaveDays: number;
  selectedLeaveDates: string[];
  getTakenLeaveDays: () => number;
}

export const generatePDFBlob = async (params: GeneratePDFParams) => {
  const {
    type,
    signatures,
    userName,
    weeklyEntries,
    selectedWeek,
    abnahme,
    yearlyLeaveDays,
    selectedLeaveDates,
    getTakenLeaveDays,
  } = params;

  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(10);
  doc.text("Malermeister Uderstadt GmbH", 20, 15);
  doc.text("Luisenweg 7, 20537 Hamburg", 20, 20);
  
  try {
    const img = new Image();
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    img.src = `${window.location.origin}${baseUrl}logo.png?v=1.1.1`;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    
    const maxWidth = 40;
    const maxHeight = 20;
    let logoWidth = maxWidth;
    let logoHeight = maxHeight;
    if (img.width && img.height) {
      const ratio = img.width / img.height;
      if (ratio > maxWidth / maxHeight) {
        logoWidth = maxWidth;
        logoHeight = maxWidth / ratio;
      } else {
        logoHeight = maxHeight;
        logoWidth = maxHeight * ratio;
      }
    }
    const logoX = 190 - logoWidth; // Aligns the right edge to x=190
    doc.addImage(img, 'PNG', logoX, 10, logoWidth, logoHeight); 
  } catch (e) {
    console.error("Failed to load logo.png for PDF generation, using fallback", e);
    doc.setFontSize(14);
    doc.text("Malerprofis", 150, 20);
    doc.setFontSize(10);
  }
  
  doc.setFontSize(16);
  doc.text(type === 'wochenbericht' ? 'Wochenbericht' : type === 'abnahme' ? 'Abnahmeprotokoll' : 'Urlaubsantrag', 20, 40);
  doc.setFontSize(12);
  doc.text(`Mitarbeiter: ${userName.firstName} ${userName.lastName}`, 20, 50);
  
  let currentY = 60;
  
  if (type === 'wochenbericht') {
      const germanDayToOffset: { [key: string]: number } = {
        Montag: 0,
        Dienstag: 1,
        Mittwoch: 2,
        Donnerstag: 3,
        Freitag: 4,
        Samstag: 5,
        Sonntag: 6,
      };
      const tableData = Object.entries(weeklyEntries).flatMap(([day, data]) => {
        const offset = germanDayToOffset[day] ?? 0;
        const entryDate = format(addDays(selectedWeek, offset), 'dd.MM.yyyy');
        return data.entries.map(e => [
          entryDate, 
          e.projectNumber || '-', 
          e.project, 
          e.description || '-', 
          e.startTime || '-', 
          e.endTime || '-', 
          e.pause !== undefined ? `${e.pause} Min.` : '-', 
          `${e.hours} h`
        ]);
      });
      autoTable(doc, {
        startY: currentY,
        head: [['Datum', 'Nr.', 'Baustelle', 'Beschreibung', 'Startzeit', 'Endzeit', 'Pause', 'Std.']],
        body: tableData,
      });
      currentY = (doc as any).lastAutoTable.finalY + 20;
      
      // Signature area
      doc.text(`Datum: ${format(new Date(), 'dd.MM.yyyy')}`, 20, currentY);
      doc.text("Unterschrift Mitarbeiter:", 20, currentY + 10);
      if (signatures.employee) {
          doc.addImage(signatures.employee, 'PNG', 20, currentY + 15, 50, 20);
      }
  } else if (type === 'abnahme') {
      doc.text(`Baustelle / Adresse: ${abnahme.address}`, 20, currentY);
      doc.text(`Baustellennummer: ${abnahme.number}`, 20, currentY + 10);
      doc.text(`Teilnehmer: ${abnahme.participants.join(', ')}`, 20, currentY + 20);
      doc.text(`Art der Abnahme: ${abnahme.type === 'teil' ? 'Teilabnahme' : 'Gesamtabnahme'}`, 20, currentY + 30);
      doc.text(`Status: ${abnahme.status === 'ohne' ? 'Ohne sichtbare Mängel' : 'Mit Mängeln/Restarbeiten'}`, 20, currentY + 40);
      
      currentY += 50;
      if (abnahme.status === 'mit' && abnahme.tasks && abnahme.tasks.length > 0) {
        doc.text(`Mängel/Kommentar:`, 20, currentY);
        currentY += 10;
        
        abnahme.tasks.forEach((task) => {
          // Check if text would overflow
          if (currentY > 275) {
            doc.addPage();
            currentY = 20;
          }
          doc.text(`- ${task.text}`, 25, currentY);
          currentY += 7;
          
          if (task.photo) {
            // Check if image would overflow (needs 37.5mm + margin)
            if (currentY > 230) {
              doc.addPage();
              currentY = 20;
            }
            try {
              let formatType = 'JPEG';
              if (task.photo.includes('image/png')) {
                formatType = 'PNG';
              }
              doc.addImage(task.photo, formatType, 25, currentY, 50, 37.5);
              currentY += 42;
            } catch (e) {
              console.error("Error drawing photo in PDF:", e);
              doc.text("[Fehler beim Laden des Fotos]", 25, currentY);
              currentY += 7;
            }
          }
        });
        currentY += 5;
      }
      
      // Signature area
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.text(`Datum: ${format(new Date(), 'dd.MM.yyyy')}`, 20, currentY);
      doc.text("Unterschrift Mitarbeiter:", 20, currentY + 10);
      if (signatures.employee) {
          doc.addImage(signatures.employee, 'PNG', 20, currentY + 15, 50, 20);
      }
      
      doc.text(`Datum: ${format(new Date(), 'dd.MM.yyyy')}`, 120, currentY);
      doc.text("Unterschrift Kunde:", 120, currentY + 10);
      if (signatures.customer) {
          doc.addImage(signatures.customer, 'PNG', 120, currentY + 15, 50, 20);
      }
  } else if (type === 'urlaubsantrag') {
      let currentY = 60;
      const selectedCount = selectedLeaveDates.filter(d => {
        const date = new Date(d);
        const day = date.getDay();
        return day !== 0 && day !== 6;
      }).length;

      doc.text(`Jahresurlaub: ${yearlyLeaveDays} Tage`, 20, currentY);
      doc.text(`Genommener Urlaub: ${getTakenLeaveDays()} Tage`, 20, currentY + 10);
      doc.text(`Dieser Antrag: ${selectedCount} Tage`, 20, currentY + 20);
      doc.text(`Zukünftiger Resturlaub: ${Math.max(0, yearlyLeaveDays - getTakenLeaveDays() - selectedCount)} Tage`, 20, currentY + 30);
      
      currentY += 50;
      doc.text('Geplante Urlaubszeiträume:', 20, currentY);
      currentY += 10;
      
      const sortedDates = [...selectedLeaveDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      const periods = getContinuousPeriods(sortedDates.map(d => new Date(d)));
      
      periods.forEach(p => {
        if (currentY > 275) {
          doc.addPage();
          currentY = 20;
        }
        const kw = getISOWeek(p.start);
        const startStr = format(p.start, 'dd.MM.yyyy');
        const endStr = format(p.end, 'dd.MM.yyyy');
        const count = countWeekdays(p.start, p.end);
        doc.text(`- KW ${kw} (${startStr} - ${endStr}) – ${count} Tage`, 25, currentY);
        currentY += 10;
      });
      
      currentY += 10;
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.text(`Datum: ${format(new Date(), 'dd.MM.yyyy')}`, 20, currentY);
      doc.text("Unterschrift Mitarbeiter:", 20, currentY + 10);
      if (signatures.employee) {
          doc.addImage(signatures.employee, 'PNG', 20, currentY + 15, 50, 20);
      }
  }
  
  return doc.output('blob');
};
