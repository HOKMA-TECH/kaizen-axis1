import { PDFDocument } from 'pdf-lib';

/**
 * Reorders pages in a PDF document according to the array of 0-based indices provided.
 */
export async function reorderPdf(file: File, newOrderIndices: number[]): Promise<Blob> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);

    const pageCount = pdf.getPageCount();

    if (newOrderIndices.length !== pageCount) {
        throw new Error('A quantidade de índices deve coincidir com o número total de páginas.');
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdf, newOrderIndices);

    copiedPages.forEach((page) => {
        newPdf.addPage(page);
    });

    const pdfBytes = await newPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}
