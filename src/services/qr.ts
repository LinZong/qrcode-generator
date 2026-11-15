import QRCode from 'qrcode';
import type { GeneratedQr, QrInput, QrOptions } from '../types';

export function validateInput({ text, options }: QrInput): void {
  if (!text.trim()) throw new Error('Enter some text or a URL to get started.');
  validateOptions(options);
}

export function validateOptions(options: QrOptions): void {
  if (!Number.isInteger(options.size) || options.size < 128 || options.size > 2048) {
    throw new Error('Size must be a whole number between 128 and 2048 px.');
  }
  if (!Number.isInteger(options.margin) || options.margin < 0 || options.margin > 16) {
    throw new Error('Margin must be a whole number between 0 and 16 modules.');
  }
  if (!['L', 'M', 'Q', 'H'].includes(options.errorCorrectionLevel)) {
    throw new Error('Choose a valid error correction level.');
  }
}

export function inputKey(input: QrInput): string {
  return JSON.stringify([
    input.text,
    input.options.size,
    input.options.margin,
    input.options.errorCorrectionLevel,
  ]);
}

export function generateQr(input: QrInput): GeneratedQr {
  validateInput(input);
  let matrix;
  try {
    matrix = QRCode.create(input.text, {
      errorCorrectionLevel: input.options.errorCorrectionLevel,
    }).modules;
  } catch {
    throw new Error(
      'This text is too long for a QR code at this correction level. Shorten it or choose a lower level.',
    );
  }
  const { size, margin } = input.options;
  const total = matrix.size + margin * 2;
  if (size < total) {
    throw new Error(
      `This QR code needs at least ${total} px. Increase the size or reduce the margin.`,
    );
  }
  const modules = Uint8Array.from(matrix.data);
  const paths: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (modules[y * matrix.size + x]) paths.push(`M${x + margin},${y + margin}h1v1h-1z`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${paths.join('')}" fill="#000"/></svg>`;
  return {
    text: input.text,
    options: { ...input.options },
    svg,
    modules,
    moduleCount: matrix.size,
  };
}

// Integer pixel boundaries keep all pixels opaque and avoid blurred module edges.
export function rasterizeQr(qr: GeneratedQr): Uint8ClampedArray<ArrayBuffer> {
  const { size, margin } = qr.options;
  const total = qr.moduleCount + margin * 2;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < qr.moduleCount; y++) {
    for (let x = 0; x < qr.moduleCount; x++) {
      if (!qr.modules[y * qr.moduleCount + x]) continue;
      const startX = Math.floor(((x + margin) * size) / total);
      const endX = Math.floor(((x + margin + 1) * size) / total);
      const startY = Math.floor(((y + margin) * size) / total);
      const endY = Math.floor(((y + margin + 1) * size) / total);
      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const i = (py * size + px) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return data;
}

export async function pngBytes(qr: GeneratedQr): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = qr.options.size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image rendering is unavailable. Please restart the app.');
  context.putImageData(new ImageData(rasterizeQr(qr), canvas.width, canvas.height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Could not create the PNG image.'))),
      'image/png',
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}
