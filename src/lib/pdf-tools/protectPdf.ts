import { PDFDocument } from '@cantoo/pdf-lib';

/**
 * Protects a PDF with a password using AES-128 encryption.
 * Uses @cantoo/pdf-lib which extends pdf-lib with encryption support.
 */
export async function protectPdf(file: File, password: string): Promise<Blob> {
    if (!password || password.trim().length === 0) {
        throw new Error('Por favor, informe uma senha para proteger o PDF.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    await pdf.encrypt({
        userPassword: password,
        ownerPassword: password,
        permissions: {
            printing: 'lowResolution',
            modifying: false,
            copying: false,
            annotating: false,
            fillingForms: false,
            contentAccessibility: true,
            documentAssembly: false,
        },
    });

    const pdfBytes = await pdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}
