import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ScanLine, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ImageScanModalProps {
    imageFile: File;
    onConfirm: (croppedFile: File) => void;
    onClose: () => void;
}

// Loads OpenCV.js from CDN (only once)
function loadOpenCV(): Promise<void> {
    return new Promise((resolve, reject) => {
        if ((window as any).cv?.Mat) {
            resolve();
            return;
        }
        if (document.getElementById('opencv-script')) {
            // Already loading — poll until ready
            const poll = setInterval(() => {
                if ((window as any).cv?.Mat) {
                    clearInterval(poll);
                    resolve();
                }
            }, 100);
            return;
        }
        const script = document.createElement('script');
        script.id = 'opencv-script';
        script.src = 'https://docs.opencv.org/4.x/opencv.js';
        script.async = true;
        script.onload = () => {
            // OpenCV sets cv['onRuntimeInitialized'] once WASM is ready
            const waitReady = setInterval(() => {
                if ((window as any).cv?.Mat) {
                    clearInterval(waitReady);
                    resolve();
                }
            }, 100);
        };
        script.onerror = () => reject(new Error('Falha ao carregar OpenCV.'));
        document.head.appendChild(script);
    });
}

export function ImageScanModal({ imageFile, onConfirm, onClose }: ImageScanModalProps) {
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [croppedDataUrl, setCroppedDataUrl] = useState('');
    const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
    const originalCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            try {
                setStatus('loading');

                // Draw original image
                const img = new Image();
                const objectUrl = URL.createObjectURL(imageFile);
                await new Promise<void>((res, rej) => {
                    img.onload = () => res();
                    img.onerror = rej;
                    img.src = objectUrl;
                });

                if (originalCanvasRef.current) {
                    const ctx = originalCanvasRef.current.getContext('2d')!;
                    originalCanvasRef.current.width = img.naturalWidth;
                    originalCanvasRef.current.height = img.naturalHeight;
                    ctx.drawImage(img, 0, 0);
                }

                // Load OpenCV (may take a few seconds on first use)
                await loadOpenCV();
                if (cancelled) return;

                const cv = (window as any).cv;
                // @ts-ignore
                const jscanify = (await import('jscanify')).default;
                const scanner = new jscanify();

                // Load image into cv.Mat via canvas
                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = img.naturalWidth;
                srcCanvas.height = img.naturalHeight;
                const srcCtx = srcCanvas.getContext('2d')!;
                srcCtx.drawImage(img, 0, 0);

                const src = cv.imread(srcCanvas);
                const contour = scanner.findPaperContour(src);

                if (!contour) {
                    throw new Error('detect_failed');
                }

                // Extract paper with perspective correction
                // Output size preserves aspect from the detected contour
                const resultWidth = img.naturalWidth;
                const resultHeight = img.naturalHeight;
                const resultCanvas = scanner.extractPaper(srcCanvas, resultWidth, resultHeight);
                src.delete();

                // Convert result canvas to Blob
                const blob: Blob = await new Promise(res =>
                    resultCanvas.toBlob(b => res(b!), 'image/jpeg', 0.95)
                );

                const croppedFile = new File([blob], imageFile.name, { type: 'image/jpeg' });

                URL.revokeObjectURL(objectUrl);

                if (!cancelled) {
                    setCroppedDataUrl(resultCanvas.toDataURL('image/jpeg'));
                    setCroppedBlob(blob);
                    setStatus('success');
                }
            } catch (err: any) {
                if (cancelled) return;
                if (err?.message === 'detect_failed') {
                    setErrorMsg('Não foi possível detectar o documento.\nTente com uma foto com mais contraste entre o documento e o fundo.');
                } else {
                    setErrorMsg(err?.message || 'Erro inesperado ao processar a imagem.');
                }
                setStatus('error');
            }
        }

        run();
        return () => { cancelled = true; };
    }, [imageFile]);

    const handleConfirm = () => {
        if (!croppedBlob) return;
        const croppedFile = new File([croppedBlob], imageFile.name, { type: 'image/jpeg' });
        onConfirm(croppedFile);
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1a2329] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-lg">
                            <ScanLine size={20} />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-900 dark:text-white">Auto-Recortar Documento</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Detecção automática de bordas e correção de perspectiva</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    {status === 'loading' && (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <Loader2 size={40} className="animate-spin text-amber-500" />
                            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                                Detectando bordas do documento...
                                <br />
                                <span className="text-xs text-gray-400">(Na primeira vez pode demorar alguns segundos para carregar o motor de detecção)</span>
                            </p>
                            <canvas ref={originalCanvasRef} className="hidden" />
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                                <AlertTriangle size={32} className="text-red-500" />
                            </div>
                            <p className="text-sm text-red-600 dark:text-red-400 text-center whitespace-pre-line">{errorMsg}</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Original</p>
                                <canvas ref={originalCanvasRef} className="w-full h-auto rounded-xl border border-gray-200 dark:border-gray-700 object-contain" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <CheckCircle2 size={12} /> Documento Detectado
                                </p>
                                <img
                                    src={croppedDataUrl}
                                    alt="Documento recortado"
                                    className="w-full h-auto rounded-xl border-2 border-amber-400 object-contain"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#0d1418] flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 bg-white dark:bg-[#202c33] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
                    >
                        {status === 'error' ? 'Fechar' : 'Cancelar'}
                    </button>
                    {status === 'success' && (
                        <button
                            onClick={handleConfirm}
                            className="flex-[2] py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <CheckCircle2 size={16} /> Confirmar Recorte
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
