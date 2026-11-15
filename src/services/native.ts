import { Image } from '@tauri-apps/api/image';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { GeneratedQr } from '../types';
import { pngBytes, rasterizeQr } from './qr';

export async function saveQr(qr: GeneratedQr, format: 'png' | 'svg'): Promise<boolean> {
  const path = await save({
    title: 'Save QR code',
    defaultPath: `qrcode-${qr.options.size}.${format}`,
    filters: [{ name: format === 'png' ? 'PNG image' : 'SVG image', extensions: [format] }],
  });
  if (!path) return false;
  const bytes = format === 'png' ? await pngBytes(qr) : new TextEncoder().encode(qr.svg);
  await writeFile(path, bytes);
  return true;
}

export async function copyQr(qr: GeneratedQr): Promise<void> {
  const rgba = rasterizeQr(qr);
  const image = await Image.new(
    new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
    qr.options.size,
    qr.options.size,
  );
  try {
    await writeImage(image);
  } finally {
    await image.close();
  }
}
