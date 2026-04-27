
export interface FileItem {
  id: string;
  file: File;
  name: string;
  type: 'image' | 'pdf';
  rotation: number; // 0, 90, 180, 270
  size: string;
  previewUrl?: string; // For images
}

export interface GeneratedFile {
  id: string;
  name: string;
  type: 'Convertido' | 'Mesclado';
  createdAt: Date;
  size: string;
}
