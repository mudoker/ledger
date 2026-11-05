'use client';

import React, { useState, useRef } from 'react';
import { CloudUpload } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Reads and optimizes an image file into a Base64 data URL string.
 * Automatically scales down large photos (e.g. from mobile cameras)
 * to max 800x800 to keep payload lightweight (<100KB) and prevent HTTP 413 errors.
 */
export function readImageAsDataUrl(file: File, maxDimension = 800, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }

    // Process images by MIME type or extension (important for iOS Safari HEIC/HEIF or empty type)
    const isImageMime = file.type ? file.type.startsWith('image/') : false;
    const isImageExt = Boolean(file.name && /\.(png|jpe?g|webp|gif|heic|heif|bmp|svg|tiff?)$/i.test(file.name));
    if (!isImageMime && !isImageExt && file.type !== '') {
      reject(new Error('Selected file is not a supported image'));
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
  onError?: (error: Error) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  variant?: 'compact' | 'dropzone';
  accept?: string;
}

/**
 * Reusable QR code image uploader component with file-to-dataURL reading.
 * Uses native <label> trigger for 100% reliable mobile browser file picking without click collisions.
 */
export function QrUploadButton({
  onImageSelected,
  onError,
  disabled = false,
  label = 'Upload QR',
  className,
  variant = 'compact',
  accept = 'image/*,.png,.jpg,.jpeg,.webp,.heic,.heif',
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
      if (onError && err instanceof Error) {
        onError(err);
      }
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
      <label
        className={cn(
          "relative flex flex-col items-center justify-center py-6 px-4 rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/50 bg-background/50 hover:bg-primary/5 cursor-pointer transition-colors text-center group overflow-hidden touch-manipulation select-none",
          (disabled || isReading) && "opacity-60 cursor-not-allowed pointer-events-none",
          className
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          disabled={disabled || isReading}
          className="sr-only"
          onChange={handleFileChange}
        />
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2 group-hover:scale-105 transition-transform">
          {isReading ? (
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : (
            <CloudUpload className="w-5 h-5" />
          )}
        </div>
        <span className="text-xs font-bold text-foreground">
          {isReading ? 'Optimizing image...' : label}
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5">
          PNG, JPG, WebP screenshot or photo
        </span>
      </label>
    );
  }

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border/80 text-xs font-semibold text-foreground cursor-pointer transition-colors active:scale-95 overflow-hidden touch-manipulation select-none",
        (disabled || isReading) && "opacity-60 cursor-not-allowed pointer-events-none",
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        disabled={disabled || isReading}
        className="sr-only"
        onChange={handleFileChange}
      />
      {isReading ? (
        <div className="w-3 h-3 border-[1.5px] border-primary/30 border-t-primary rounded-full animate-spin" />
      ) : (
        <CloudUpload className="w-3.5 h-3.5 text-primary" />
      )}
      <span>{isReading ? 'Optimizing...' : label}</span>
    </label>
  );
}
