'use client';

import React, { useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

/**
 * Reads any image file into a Base64 data URL string.
 */
export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };
    reader.onerror = () => {
      reject(reader.error || new Error('FileReader error'));
    };
    reader.readAsDataURL(file);
  });
}

export interface QrUploadButtonProps {
  onImageSelected: (dataUrl: string, file: File) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  variant?: 'compact' | 'dropzone';
  accept?: string;
}

/**
 * Reusable QR code image uploader component with file-to-dataURL reading.
 * Shared between BillConfiguration and GroupConfiguration.
 */
export function QrUploadButton({
  onImageSelected,
  disabled = false,
  label = 'Upload QR',
  className,
  variant = 'compact',
  accept = 'image/*',
}: QrUploadButtonProps) {
  const [isReading, setIsReading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsReading(true);
    try {
      const dataUrl = await readImageAsDataUrl(file);
      onImageSelected(dataUrl, file);
    } catch (err) {
      console.warn('Failed to parse uploaded QR image:', err);
    } finally {
      setIsReading(false);
      // Reset input value so re-uploading the same file still fires onChange
      e.target.value = '';
    }
  };

  if (variant === 'dropzone') {
    return (
      <label
        className={cn(
          "flex flex-col items-center justify-center py-6 px-4 rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/50 bg-background/50 hover:bg-primary/5 cursor-pointer transition-colors text-center group",
          disabled && "opacity-60 cursor-not-allowed pointer-events-none",
          className
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2 group-hover:scale-105 transition-transform">
          {isReading ? (
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : (
            <CloudUpload className="w-5 h-5" />
          )}
        </div>
        <span className="text-xs font-bold text-foreground">
          {isReading ? 'Reading image...' : label}
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5">
          PNG, JPG, WebP screenshot or image
        </span>
        <Input
          type="file"
          accept={accept}
          disabled={disabled || isReading}
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>
    );
  }

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border/80 text-xs font-semibold text-foreground cursor-pointer transition-colors active:scale-95",
        disabled && "opacity-60 cursor-not-allowed pointer-events-none",
        className
      )}
    >
      {isReading ? (
        <div className="w-3 h-3 border-[1.5px] border-primary/30 border-t-primary rounded-full animate-spin" />
      ) : (
        <CloudUpload className="w-3.5 h-3.5 text-primary" />
      )}
      <span>{isReading ? 'Loading...' : label}</span>
      <Input
        type="file"
        accept={accept}
        disabled={disabled || isReading}
        className="sr-only"
        onChange={handleFileChange}
      />
    </label>
  );
}
