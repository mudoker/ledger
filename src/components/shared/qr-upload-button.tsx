'use client';

import React, { useState, useRef } from 'react';
import { CloudUpload } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Reads and optimizes an image file into a Base64 data URL string.
 * Automatically scales down large photos (e.g. from mobile cameras)
 * to max 1024x1024 to keep payload lightweight (<150KB) and prevent HTTP 413 errors.
 */
export function readImageAsDataUrl(file: File, maxDimension = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }

    // Only process images
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read image file'));
        return;
      }

      // If we are in non-browser environment (e.g. SSR/test), resolve data URL directly
      if (typeof window === 'undefined' || typeof Image === 'undefined') {
        resolve(result);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(result);
            return;
          }

          // Use white background in case of transparent PNG/WebP converted to JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Export as JPEG with good compression
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch {
          // Fallback to original data URL if canvas fails
          resolve(result);
        }
      };
      img.onerror = () => {
        // Fallback to original data URL
        resolve(result);
      };
      img.src = result;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (variant === 'dropzone') {
    return (
      <div
        role="button"
        tabIndex={disabled || isReading ? -1 : 0}
        onClick={() => {
          if (disabled || isReading) return;
          fileInputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled && !isReading) {
              fileInputRef.current?.click();
            }
          }
        }}
        className={cn(
          "relative flex flex-col items-center justify-center py-6 px-4 rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/50 bg-background/50 hover:bg-primary/5 cursor-pointer transition-colors text-center group overflow-hidden touch-manipulation",
          (disabled || isReading) && "opacity-60 cursor-not-allowed pointer-events-none",
          className
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          disabled={disabled || isReading}
          tabIndex={-1}
          aria-label={label}
          title=""
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 file:hidden"
          style={{ fontSize: '100px' }}
          onChange={handleFileChange}
          onClick={(e) => {
            // Let the native file dialog trigger without bubbling to parent form or container
            e.stopPropagation();
          }}
        />
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2 group-hover:scale-105 transition-transform pointer-events-none">
          {isReading ? (
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : (
            <CloudUpload className="w-5 h-5" />
          )}
        </div>
        <span className="text-xs font-bold text-foreground pointer-events-none">
          {isReading ? 'Optimizing image...' : label}
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5 pointer-events-none">
          PNG, JPG, WebP screenshot or photo
        </span>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={disabled || isReading ? -1 : 0}
      onClick={() => {
        if (disabled || isReading) return;
        fileInputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled && !isReading) {
            fileInputRef.current?.click();
          }
        }
      }}
      className={cn(
        "relative inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border/80 text-xs font-semibold text-foreground cursor-pointer transition-colors active:scale-95 overflow-hidden touch-manipulation",
        (disabled || isReading) && "opacity-60 cursor-not-allowed pointer-events-none",
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        disabled={disabled || isReading}
        tabIndex={-1}
        aria-label={label}
        title=""
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 file:hidden"
        style={{ fontSize: '100px' }}
        onChange={handleFileChange}
        onClick={(e) => {
          e.stopPropagation();
        }}
      />
      {isReading ? (
        <div className="w-3 h-3 border-[1.5px] border-primary/30 border-t-primary rounded-full animate-spin pointer-events-none" />
      ) : (
        <CloudUpload className="w-3.5 h-3.5 text-primary pointer-events-none" />
      )}
      <span className="pointer-events-none">{isReading ? 'Optimizing...' : label}</span>
    </div>
  );
}
