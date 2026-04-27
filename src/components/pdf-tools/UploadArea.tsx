import { UploadCloud, FileText, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { useRef } from 'react';

interface UploadAreaProps {
  onFilesSelected: (files: File[]) => void;
  accept: string;
  label: string;
  sublabel: string;
  iconType?: 'image' | 'pdf';
}

export function UploadArea({ onFilesSelected, accept, label, sublabel, iconType = 'image' }: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div 
      className="border-2 border-dashed border-surface-200 dark:border-surface-700 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-surface-50/50 hover:bg-surface-100/50 transition-colors group relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept={accept} 
        multiple 
        onChange={handleFileChange} 
      />
      
      {/* Composed Icon Illustration */}
      <div className="mb-6 relative h-16 w-24 flex items-center justify-center select-none pointer-events-none">
        {iconType === 'image' ? (
           <>
             <div className="absolute left-2 top-2 bg-white dark:bg-surface-800 p-2 rounded-lg shadow-sm border border-surface-200 transform -rotate-6 z-10">
               <ImageIcon size={24} className="text-purple-500" />
               <span className="absolute -bottom-2 -right-2 bg-purple-100 text-purple-700 text-[8px] font-bold px-1 rounded">JPG</span>
             </div>
             <div className="absolute right-2 top-0 bg-white dark:bg-surface-800 p-2 rounded-lg shadow-sm border border-surface-200 transform rotate-6 z-20">
               <FileText size={24} className="text-red-500" />
               <span className="absolute -bottom-2 -right-2 bg-red-100 text-red-700 text-[8px] font-bold px-1 rounded">PDF</span>
             </div>
             <ArrowRight className="absolute text-surface-300 z-0" size={20} />
           </>
        ) : (
           <>
             <div className="absolute left-2 top-2 bg-white dark:bg-surface-800 p-2 rounded-lg shadow-sm border border-surface-200 transform -rotate-6 z-10">
               <FileText size={24} className="text-red-500" />
               <span className="absolute -bottom-2 -right-2 bg-red-100 text-red-700 text-[8px] font-bold px-1 rounded">PDF</span>
             </div>
             <div className="absolute right-2 top-0 bg-white dark:bg-surface-800 p-2 rounded-lg shadow-sm border border-surface-200 transform rotate-6 z-20">
               <FileText size={24} className="text-red-500" />
               <span className="absolute -bottom-2 -right-2 bg-red-100 text-red-700 text-[8px] font-bold px-1 rounded">PDF</span>
             </div>
             <ArrowRight className="absolute text-surface-300 z-0" size={20} />
           </>
        )}
      </div>

      <h3 className="text-sm font-medium text-text-primary mb-4">Solte seus arquivos aqui</h3>

      <div className="flex items-center w-full max-w-[200px] gap-3 mb-4">
        <div className="h-[1px] bg-surface-200 flex-1"></div>
        <span className="text-[10px] text-text-secondary uppercase font-bold text-surface-400">OU</span>
        <div className="h-[1px] bg-surface-200 flex-1"></div>
      </div>

      <button
        onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
        }}
        className="bg-gray-900 hover:bg-black text-white text-xs font-bold py-2.5 px-6 rounded-lg shadow-md shadow-gray-900/10 transition-all hover:scale-105 active:scale-95 mb-3"
      >
        {label}
      </button>

      <p className="text-[10px] text-text-secondary opacity-60">{sublabel}</p>
    </div>
  );
}
