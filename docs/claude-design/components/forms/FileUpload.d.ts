import * as React from 'react';

export interface UploadedFile { name: string; size?: string; progress?: number }
export interface FileUploadProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  hint?: string;
  files?: UploadedFile[];
  onRemove?: (file: UploadedFile) => void;
  required?: boolean;
  state?: 'idle' | 'error' | 'success';
  icon?: React.ReactNode;
}
export declare function FileUpload(props: FileUploadProps): JSX.Element;
