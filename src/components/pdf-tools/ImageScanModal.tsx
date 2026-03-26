import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ScanLine, AlertTriangle, CheckCircle2, RotateCcw, RotateCw } from 'lucide-react';

interface ImageScanModalProps {
    imageFile: File;
    onConfirm: (croppedFile: File) => void;
    onClose: () => void;
}

// ─── Script loaders ───────────────────────────────────────────────────────────

function loadScript(id: string, src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) { resolve(); return; }
        const s = document.createElement('script');
        s.id = id; s.src = src; s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
        document.head.appendChild(s);
    });
}

async function loadOpenCV(): Promise<void> {
    if ((window as any).cv?.Mat) return;
    await loadScript('opencv-script', 'https://docs.opencv.org/4.x/opencv.js');
    await new Promise<void>(res => {
        const t = setInterval(() => { if ((window as any).cv?.Mat) { clearInterval(t); res(); } }, 100);
    });
}

async function loadJscanify(): Promise<void> {
    if ((window as any).jscanify) return;
    await loadScript('jscanify-script', 'https://unpkg.com/jscanify@1.4.0/src/jscanify.js');
    await new Promise<void>(res => {
        const t = setInterval(() => { if ((window as any).jscanify) { clearInterval(t); res(); } }, 50);
    });
}

/** Rotates an image (data URL) by `degrees` and returns a new data URL */
function rotateDataUrl(dataUrl: string, degrees: number): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const rad = (degrees * Math.PI) / 180;
            const sin = Math.abs(Math.sin(rad));
            const cos = Math.abs(Math.cos(rad));
            const w = Math.round(img.width * cos + img.height * sin);
            const h = Math.round(img.width * sin + img.height * cos);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.translate(w / 2, h / 2);
            ctx.rotate(rad);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.src = dataUrl;
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImageScanModal({ imageFile, onConfirm, onClose }: ImageScanModalProps) {
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [originalUrl, setOriginalUrl] = useState('');
    const [baseCroppedUrl, setBaseCroppedUrl] = useState(''); // jscanify result (unchanged)
    const [rotation, setRotation] = useState(0);             // user-applied extra rotation
    const [displayUrl, setDisplayUrl] = useState('');        // baseCropped + rotation applied
    const confirmCanvasRef = useRef<HTMLCanvasElement>(null);

    // Apply rotation whenever base or rotation changes
    useEffect(() => {
        if (!baseCroppedUrl) return;
        if (rotation === 0) { setDisplayUrl(baseCroppedUrl); return; }
        rotateDataUrl(baseCroppedUrl, rotation).then(setDisplayUrl);
    }, [baseCroppedUrl, rotation]);

    useEffect(() => {
        let cancelled = false;
        const objUrl = URL.createObjectURL(imageFile);
        setOriginalUrl(objUrl);

        async function run() {
            try {
                const img = new Image();
                await new Promise<void>((res, rej) => {
                    img.onload = () => res(); img.onerror = rej; img.src = objUrl;
                });

                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = img.naturalWidth;
                srcCanvas.height = img.naturalHeight;
                srcCanvas.getContext('2d')!.drawImage(img, 0, 0);

                await loadOpenCV();
                if (cancelled) return;
                await loadJscanify();
                if (cancelled) return;

                const cv = (window as any).cv;
                const Jscanify = (window as any).jscanify;
                const scanner = new Jscanify();

                const src = cv.imread(srcCanvas);
                const contour = scanner.findPaperContour(src);

                if (!contour || contour.rows === 0) {
                    src.delete();
                    throw new Error('detect_failed');
                }

                const rect = cv.boundingRect(contour);
                src.delete();

                const resultCanvas = scanner.extractPaper(srcCanvas, rect.width, rect.height);

                if (!cancelled) {
                    const url = resultCanvas.toDataURL('image/jpeg', 0.95);
                    setBaseCroppedUrl(url);
                    setDisplayUrl(url);
                    setRotation(0);
                    setStatus('success');
                }
            } catch (err: any) {
                if (cancelled) return;
                if (err?.message === 'detect_failed') {
                    setErrorMsg('Não foi possível detectar o documento.\nTente com melhor iluminação ou mais contraste entre o documento e o fundo.');
                } else {
                    setErrorMsg(err?.message || 'Erro inesperado.');
                }
                setStatus('error');
            }
        }

        run();
        return () => { cancelled = true; URL.revokeObjectURL(objUrl); };
    }, [imageFile]);

    const rotate = (deg: number) => setRotation(r => r + deg);

    const handleConfirm = async () => {
        if (!displayUrl) return;
        const img = new Image();
        img.src = displayUrl;
        await new Promise<void>(res => { img.onload = () => res(); });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        canvas.toBlob(blob => {
            if (blob) onConfirm(new File([blob], imageFile.name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.95);
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
                            <p className="text-xs text-gray-500 dark:text-gray-400">Detecção automática + ajuste de rotação</p>
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
                                <span className="text-xs text-gray-400">(Na primeira vez pode demorar alguns segundos)</span>
                            </p>
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
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Original</p>
                                    <img src={originalUrl} alt="Original" className="w-full h-auto rounded-xl border border-gray-200 dark:border-gray-700 object-contain max-h-[50vh]" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <CheckCircle2 size={12} /> Documento Detectado
                                    </p>
                                    <img src={displayUrl} alt="Recortado" className="w-full h-auto rounded-xl border-2 border-amber-400 object-contain max-h-[50vh]" />
                                </div>
                            </div>

                            {/* Rotation controls */}
                            <div className="bg-gray-50 dark:bg-[#202c33] rounded-xl p-3">
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 text-center">
                                    Ajustar Rotação {rotation !== 0 && <span className="text-amber-600">({rotation > 0 ? '+' : ''}{rotation}°)</span>}
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => rotate(-90)} className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 dark:text-gray-200">−90°</button>
                                    <button onClick={() => rotate(-5)}  className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 dark:text-gray-200">−5°</button>
                                    <button onClick={() => rotate(-1)}  className="px-3 py-1.5 text-xs bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 dark:text-gray-200 flex items-center gap-1"><RotateCcw size={12}/>−1°</button>
                                    <button onClick={() => setRotation(0)} className="px-3 py-1.5 text-xs bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 dark:text-gray-400">Reset</button>
                                    <button onClick={() => rotate(1)}   className="px-3 py-1.5 text-xs bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 dark:text-gray-200 flex items-center gap-1"><RotateCw size={12}/>+1°</button>
                                    <button onClick={() => rotate(5)}   className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 dark:text-gray-200">+5°</button>
                                    <button onClick={() => rotate(90)}  className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-[#1a2329] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 dark:text-gray-200">+90°</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#0d1418] flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 px-4 bg-white dark:bg-[#202c33] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors">
                        {status === 'error' ? 'Fechar' : 'Cancelar'}
                    </button>
                    {status === 'success' && (
                        <button onClick={handleConfirm} className="flex-[2] py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                            <CheckCircle2 size={16} /> Confirmar Recorte
                        </button>
                    )}
                </div>
                <canvas ref={confirmCanvasRef} className="hidden" />
            </div>
        </div>,
        document.body
    );
}
