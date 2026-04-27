import { PDFToolType } from '@/pages/PdfTools';

interface PdfToolConfigProps {
    toolId: PDFToolType;
    config: any;
    onChange: (newConfig: any) => void;
}

export function PdfToolConfig({ toolId, config, onChange }: PdfToolConfigProps) {
    if (toolId === 'image-to-pdf') {
        return (
            <div className="bg-gray-50 dark:bg-[#1a2329] p-4 rounded-xl border border-gray-200 dark:border-gray-800 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Orientação da Página</label>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <input type="radio" checked={config.orientation === 'portrait'} onChange={() => onChange({ ...config, orientation: 'portrait' })} className="text-gold-500 focus:ring-gold-500" />
                            Retrato
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <input type="radio" checked={config.orientation === 'landscape'} onChange={() => onChange({ ...config, orientation: 'landscape' })} className="text-gold-500 focus:ring-gold-500" />
                            Paisagem
                        </label>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tamanho</label>
                    <select value={config.format || 'a4'} onChange={e => onChange({ ...config, format: e.target.value })} className="w-full rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-200 focus:ring-gold-500 focus:border-gold-500 text-sm">
                        <option value="a4">A4 (Padrão)</option>
                        <option value="fit">Ajustar à imagem</option>
                    </select>
                </div>
            </div>
        );
    }

    if (toolId === 'split-pdf') {
        return (
            <div className="bg-gray-50 dark:bg-[#1a2329] p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Intervalo de Páginas</label>
                <input
                    type="text"
                    placeholder="Ex: 1-5, 10, 15-30"
                    value={config.pages || ''}
                    onChange={e => onChange({ ...config, pages: e.target.value })}
                    className="w-full rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-200 focus:ring-gold-500 focus:border-gold-500 text-sm placeholder:text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-2">Vírgulas separam, hífens definem intervalos. Sem limite de páginas.</p>
            </div>
        );
    }

    if (toolId === 'compress-pdf') {
        return (
            <div className="bg-gray-50 dark:bg-[#1a2329] p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nível de Compressão (Qualidade)</label>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 w-12 text-right">Menor</span>
                    <input
                        type="range" min="0.1" max="1" step="0.1"
                        value={config.quality || 0.5}
                        onChange={e => onChange({ ...config, quality: parseFloat(e.target.value) })}
                        className="flex-1 accent-gold-500"
                    />
                    <span className="text-xs text-gray-500 w-12">Maior</span>
                </div>
            </div>
        );
    }

    if (toolId === 'protect-pdf' || toolId === 'unlock-pdf') {
        return (
            <div className="bg-gray-50 dark:bg-[#1a2329] p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {toolId === 'protect-pdf' ? 'Definir Senha' : 'Senha Atual do PDF'}
                </label>
                <input
                    type="password"
                    placeholder="Digite a senha..."
                    value={config.password || ''}
                    onChange={e => onChange({ ...config, password: e.target.value })}
                    className="w-full rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-200 focus:ring-gold-500 focus:border-gold-500 text-sm"
                />
            </div>
        );
    }

    return null;
}
