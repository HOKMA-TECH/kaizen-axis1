import { PDFDocument } from 'pdf-lib';

/**
 * Parses a range string like "1-3,5,8-10" into an array of zero-based indices.
 */
function parsePageRanges(rangeStr: string, maxPages: number): number[] {
    const indices = new Set<number>();
    const parts = rangeStr.split(',').map(p => p.trim());

    for (const part of parts) {
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-');
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                    if (i > 0 && i <= maxPages) {
                        indices.add(i - 1); // zero-based
                    }
                }
            }
        } else {
            const page = parseInt(part, 10);
            if (!isNaN(page) && page > 0 && page <= maxPages) {
                indices.add(page - 1);
            }
        }
    }

    return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Extracts specific pages from a PDF based on a range string.
 */
export async function splitPdf(file: File, rangeString: string): Promise<Blob> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);

    const pageCount = pdf.getPageCount();
    const indicesToExtract = parsePageRanges(rangeString, pageCount);

    if (indicesToExtract.length === 0) {
        throw new Error('Nenhuma página válida encontrada no intervalo fornecido.');
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdf, indicesToExtract);

    copiedPages.forEach((page) => {
        newPdf.addPage(page);
    });

    const pdfBytes = await newPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}
