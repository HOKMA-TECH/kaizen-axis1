import { jsPDF } from 'jspdf';

export interface ImageToPdfOptions {
    orientation?: 'portrait' | 'landscape';
    format?: 'a4' | 'fit';
}

/**
 * Converts multiple images into a single PDF document.
 * Images are scaled to fit the page while preserving their original aspect ratio.
 * Uses canvas to normalise EXIF orientation (fixes rotated phone photos).
 */
export async function imageToPdf(files: File[], options: ImageToPdfOptions = { orientation: 'portrait', format: 'a4' }): Promise<Blob> {
    let doc: jsPDF | null = null;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Draw through canvas so the browser applies EXIF orientation automatically
        const { dataUrl: imgData, width: imgW, height: imgH } = await fileToNormalisedDataUrl(file);
        const imgAspect = imgW / imgH;

        if (options.format === 'fit') {
            // Page dimensions match the image exactly (convert px → mm at 96 dpi)
            const mmW = (imgW / 96) * 25.4;
            const mmH = (imgH / 96) * 25.4;
            const orientation = imgAspect >= 1 ? 'l' : 'p';

            if (!doc) {
                doc = new jsPDF({ orientation, unit: 'mm', format: [mmW, mmH] });
            } else {
                doc.addPage([mmW, mmH], orientation);
            }

            const pageWidth  = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.addImage(imgData, getImgType(file), 0, 0, pageWidth, pageHeight, undefined, 'FAST');

        } else {
            // A4 mode: fit the image inside the page preserving aspect ratio, centered
            const orientation = options.orientation === 'landscape' ? 'l' : 'p';

            if (!doc) {
                doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
            } else {
                doc.addPage('a4', orientation);
            }

            const pageWidth  = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const pageAspect = pageWidth / pageHeight;

            let drawW: number;
            let drawH: number;

            if (imgAspect > pageAspect) {
                // Image is wider than the page → fit by width
                drawW = pageWidth;
                drawH = pageWidth / imgAspect;
            } else {
                // Image is taller than the page → fit by height
                drawH = pageHeight;
                drawW = pageHeight * imgAspect;
            }

            // Center on page
            const x = (pageWidth  - drawW) / 2;
            const y = (pageHeight - drawH) / 2;

            doc.addImage(imgData, getImgType(file), x, y, drawW, drawH, undefined, 'FAST');
        }
    }

    if (!doc) throw new Error('Nenhuma imagem fornecida');
    return doc.output('blob');
}

function getImgType(file: File): string {
    if (file.type === 'image/png')  return 'PNG';
    return 'JPEG'; // WEBP and JPEG both safe as JPEG output from canvas
}

/**
 * Loads a File through a canvas so the browser applies EXIF orientation
 * automatically. Returns a JPEG data URL with the correct orientation
 * plus the post-rotation dimensions.
 */
function fileToNormalisedDataUrl(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            // naturalWidth/Height are already post-EXIF in modern browsers
            const canvas = document.createElement('canvas');
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(objectUrl);
            resolve({
                dataUrl: canvas.toDataURL('image/jpeg', 0.95),
                width:   img.naturalWidth,
                height:  img.naturalHeight,
            });
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Falha ao carregar imagem')); };
        img.src = objectUrl;
    });
}
