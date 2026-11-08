// tests/tool.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  detectFormat,
  parseInput,
  processInputSync,
  ToolResult
} from '../src/tool.ts';

describe('detectFormat', () => {
  it('detects WebP from RIFF header', () => {
    // RIFF....WEBP header (minimal)
    const webpHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50, // WEBP
      0x56, 0x50, 0x38, 0x20, // VP8 
      0x00, 0x00, 0x00, 0x00, // chunk size
      0x00, 0x00,             // version
      0x80, 0x02,             // width: 640
      0xE0, 0x01              // height: 480
    ]);
    const result = detectFormat(webpHeader);
    expect(result.format).toBe('webp');
    expect(result.valid).toBe(true);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it('detects PNG from signature', () => {
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x02, 0x80, // width: 640
      0x00, 0x00, 0x01, 0xE0  // height: 480
    ]);
    const result = detectFormat(pngHeader);
    expect(result.format).toBe('png');
    expect(result.valid).toBe(true);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it('detects JPEG from FF D8 FF signature', () => {
    // Minimal JPEG with SOF0 marker
    const jpegHeader = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, // SOI + APP0
      0x00, 0x10,             // APP0 length
      0x4A, 0x46, 0x49, 0x46, 0x00, // JFIF\0
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xFF, 0xC0,             // SOF0
      0x00, 0x0B,             // length
      0x08,                   // precision
      0x01, 0xE0,             // height: 480
      0x02, 0x80,             // width: 640
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01
    ]);
    const result = detectFormat(jpegHeader);
    expect(result.format).toBe('jpeg');
    expect(result.valid).toBe(true);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it('detects AVIF from ftyp box', () => {
    const avifHeader = new Uint8Array([
      0x00, 0x00, 0x00, 0x1C, // size
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x61, 0x76, 0x69, 0x66, // avif
      0x00, 0x00, 0x00, 0x00,
      0x61, 0x76, 0x69, 0x66,
      0x6D, 0x69, 0x66, 0x31
    ]);
    const result = detectFormat(avifHeader);
    expect(result.format).toBe('avif');
    expect(result.valid).toBe(true);
  });

  it('returns unknown for invalid data', () => {
    const invalid = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const result = detectFormat(invalid);
    expect(result.format).toBe('unknown');
    expect(result.valid).toBe(false);
  });
});

describe('parseInput', () => {
  it('parses data URL', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = parseInput(dataUrl);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
    expect(result![0]).toBe(0x89); // PNG signature
  });

  it('parses raw base64', () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = parseInput(base64);
    expect(result).not.toBeNull();
    expect(result![0]).toBe(0x89);
  });

  it('returns null for invalid base64', () => {
    const result = parseInput('not valid base64!@#$');
    expect(result).toBeNull();
  });
});

describe('processInputSync', () => {
  it('processes valid PNG data URL', () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = processInputSync(pngBase64);
    expect(result.success).toBe(true);
    const data = JSON.parse(result.data);
    expect(data.format).toBe('png');
    expect(data.sourceFormat).toBe('png');
  });

  it('detects format from base64 JPEG', () => {
    // Minimal JPEG base64
    const jpegBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AB//2Q==';
    const result = processInputSync(jpegBase64);
    expect(result.success).toBe(true);
    const data = JSON.parse(result.data);
    expect(data.sourceFormat).toBe('jpeg');
  });

  it('returns error for empty input', () => {
    const result = processInputSync('');
    expect(result.success).toBe(false);
    expect(result.error).toBe('No input provided');
  });

  it('returns error for invalid input', () => {
    const result = processInputSync('not an image');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid input');
  });
});
