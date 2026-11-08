// src/tool.ts

export interface ToolResult {
  success: boolean;
  data: string;
  error?: string;
  warnings?: string[];
}

export interface ImageInfo {
  format: 'webp' | 'avif' | 'png' | 'jpeg' | 'unknown';
  width: number;
  height: number;
  valid: boolean;
}

export interface ConversionOptions {
  outputFormat: 'png' | 'jpeg';
  quality: number; // 0.8 to 1.0
}

/**
 * Detect image format from binary data
 */
export function detectFormat(data: Uint8Array): ImageInfo {
  if (data.length < 12) {
    return { format: 'unknown', width: 0, height: 0, valid: false };
  }

  // WebP: RIFF....WEBP
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
      data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
    // VP8/VP8L chunk for dimensions
    let offset = 12;
    while (offset + 8 < data.length) {
      const chunkSize = data[offset + 4] | (data[offset + 5] << 8) | (data[offset + 6] << 16) | (data[offset + 7] << 24);
      const chunkType = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
      if (chunkType === 'VP8 ' || chunkType === 'VP8L') {
        if (chunkType === 'VP8 ' && offset + 14 <= data.length) {
          const width = data[offset + 10] | (data[offset + 11] << 8);
          const height = data[offset + 12] | (data[offset + 13] << 8);
          return { format: 'webp', width, height, valid: true };
        } else if (chunkType === 'VP8L' && offset + 13 <= data.length) {
          const bits = data[offset + 9] | (data[offset + 10] << 8) | (data[offset + 11] << 16) | (data[offset + 12] << 24);
          const width = (bits & 0x3FFF) + 1;
          const height = ((bits >> 14) & 0x3FFF) + 1;
          return { format: 'webp', width, height, valid: true };
        }
      }
      offset += 8 + chunkSize;
      if (offset % 2 !== 0) offset++;
    }
    return { format: 'webp', width: 0, height: 0, valid: true };
  }

  // AVIF: ftyp....avif
  if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70 &&
      data[8] === 0x61 && data[9] === 0x76 && data[10] === 0x69 && data[11] === 0x66) {
    // Parse boxes for dimensions (simplified)
    return { format: 'avif', width: 0, height: 0, valid: true };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47 &&
      data[4] === 0x0D && data[5] === 0x0A && data[6] === 0x1A && data[7] === 0x0A) {
    if (data.length >= 24) {
      const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
      const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
      return { format: 'png', width, height, valid: true };
    }
    return { format: 'png', width: 0, height: 0, valid: true };
  }

  // JPEG: FF D8 FF
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
    // Parse SOF markers for dimensions
    let offset = 2;
    while (offset < data.length - 1) {
      if (data[offset] === 0xFF) {
        const marker = data[offset + 1];
        // SOF0, SOF1, SOF2
        if (marker >= 0xC0 && marker <= 0xC2) {
          if (offset + 8 < data.length) {
            const height = (data[offset + 5] << 8) | data[offset + 6];
            const width = (data[offset + 7] << 8) | data[offset + 8];
            return { format: 'jpeg', width, height, valid: true };
          }
        }
        // Skip segment
        if (offset + 3 < data.length) {
          const segmentLength = (data[offset + 2] << 8) | data[offset + 3];
          offset += 2 + segmentLength;
        } else {
          break;
        }
      } else {
        offset++;
      }
    }
    return { format: 'jpeg', width: 0, height: 0, valid: true };
  }

  return { format: 'unknown', width: 0, height: 0, valid: false };
}

/**
 * Parse input string (data URL or base64) to Uint8Array
 */
export function parseInput(input: string): Uint8Array | null {
  const trimmed = input.trim();
  
  // Data URL format: data:image/...;base64,...
  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex === -1) return null;
    const base64 = trimmed.slice(commaIndex + 1);
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      return null;
    }
  }

  // Raw base64
  try {
    const binary = atob(trimmed);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Convert image data to target format using canvas
 */
export async function convertImage(
  imageData: Uint8Array,
  sourceFormat: string,
  options: ConversionOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([imageData.buffer as ArrayBuffer], { type: getMimeType(sourceFormat) });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Draw with white background for JPEG (no alpha)
      if (options.outputFormat === 'jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, 0, 0);
      
      const mimeType = options.outputFormat === 'png' ? 'image/png' : 'image/jpeg';
      const quality = options.outputFormat === 'jpeg' ? options.quality : undefined;
      
      const dataUrl = canvas.toDataURL(mimeType, quality);
      resolve(dataUrl);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

function getMimeType(format: string): string {
  switch (format) {
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    case 'png': return 'image/png';
    case 'jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

/**
 * Main process function - converts image to PNG/JPEG data URL
 */
export async function processInput(input: string): Promise<ToolResult> {
  const warnings: string[] = [];
  
  if (!input || !input.trim()) {
    return {
      success: false,
      data: '',
      error: 'No input provided'
    };
  }

  const imageData = parseInput(input.trim());
  if (!imageData) {
    return {
      success: false,
      data: '',
      error: 'Invalid input: not a valid data URL or base64 string'
    };
  }

  const info = detectFormat(imageData);
  if (!info.valid) {
    return {
      success: false,
      data: '',
      error: 'Invalid input: unsupported or invalid image format'
    };
  }

  if (info.format === 'unknown') {
    return {
      success: false,
      data: '',
      error: 'Could not detect image format'
    };
  }

  // Default options
  const options: ConversionOptions = {
    outputFormat: 'png',
    quality: 0.95
  };

  try {
    const dataUrl = await convertImage(imageData, info.format, options);
    
    const result = {
      format: options.outputFormat,
      width: info.width || 'unknown',
      height: info.height || 'unknown',
      sourceFormat: info.format,
      dataUrl
    };
    
    return {
      success: true,
      data: JSON.stringify(result, null, 2),
      warnings: warnings.length > 0 ? warnings : undefined
    };
  } catch (err) {
    return {
      success: false,
      data: '',
      error: err instanceof Error ? err.message : 'Conversion failed'
    };
  }
}

// Synchronous version for testing
export function processInputSync(input: string): ToolResult {
  const warnings: string[] = [];
  
  if (!input || !input.trim()) {
    return {
      success: false,
      data: '',
      error: 'No input provided'
    };
  }

  const imageData = parseInput(input.trim());
  if (!imageData) {
    return {
      success: false,
      data: '',
      error: 'Invalid input: not a valid data URL or base64 string'
    };
  }

  const info = detectFormat(imageData);
  if (!info.valid) {
    return {
      success: false,
      data: '',
      error: 'Invalid input: unsupported or invalid image format'
    };
  }

  if (info.format === 'unknown') {
    return {
      success: false,
      data: '',
      error: 'Could not detect image format'
    };
  }

  const result = {
    format: 'png',
    width: info.width || 'unknown',
    height: info.height || 'unknown',
    sourceFormat: info.format,
    dataUrl: 'data:image/png;base64,test'
  };
  
  return {
    success: true,
    data: JSON.stringify(result, null, 2),
    warnings: warnings.length > 0 ? warnings : undefined
  };
}
