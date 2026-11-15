import jsQR from 'jsqr';
import { DEFAULT_OPTIONS } from '../types';
import { generateQr, inputKey, rasterizeQr } from '../services/qr';

describe('QR generation', () => {
  it.each([
    'Hello world',
    'https://example.com/a?b=1&c=2',
    '你好，世界 🌍',
    '  line one\nline two\t🙂  ',
  ])('round-trips original content: %s', (text) => {
    const qr = generateQr({ text, options: DEFAULT_OPTIONS });
    expect(jsQR(rasterizeQr(qr), 512, 512)?.data).toBe(text);
  });

  it.each(['L', 'M', 'Q', 'H'] as const)(
    'round-trips correction level %s at a non-multiple size',
    (errorCorrectionLevel) => {
      const qr = generateQr({
        text: 'A useful connection 你好',
        options: { ...DEFAULT_OPTIONS, size: 513, errorCorrectionLevel },
      });
      expect(jsQR(rasterizeQr(qr), 513, 513)?.data).toBe(qr.text);
      expect(qr.svg).toContain('width="513" height="513"');
      const svg = new DOMParser().parseFromString(qr.svg, 'image/svg+xml');
      expect(svg.querySelector('parsererror')).toBeNull();
      expect(svg.querySelector('svg')?.getAttribute('viewBox')).toBe(
        `0 0 ${qr.moduleCount + 8} ${qr.moduleCount + 8}`,
      );
    },
  );

  it.each([0, 4, 16])('respects margin %s and exact pixel size', (margin) => {
    const qr = generateQr({
      text: 'Margin test',
      options: { ...DEFAULT_OPTIONS, size: 256, margin },
    });
    const pixels = rasterizeQr(qr);
    expect(pixels.length).toBe(256 * 256 * 4);
    const firstBlackPixel = pixels.findIndex((v, i) => i % 4 === 0 && v === 0) / 4;
    const edge = Math.floor((margin * 256) / (qr.moduleCount + margin * 2));
    expect(firstBlackPixel).toBe(edge * 256 + edge);
    expect(jsQR(pixels, 256, 256)?.data).toBe('Margin test');
  });

  it('rejects empty content, invalid parameters, capacity overflow, and undersized output', () => {
    for (const text of ['', '  \n\t'])
      expect(() => generateQr({ text, options: DEFAULT_OPTIONS })).toThrow('Enter some text');
    for (const size of [NaN, 127, 2049, 512.5])
      expect(() => generateQr({ text: 'test', options: { ...DEFAULT_OPTIONS, size } })).toThrow(
        'Size',
      );
    for (const margin of [NaN, -1, 17, 1.5])
      expect(() => generateQr({ text: 'test', options: { ...DEFAULT_OPTIONS, margin } })).toThrow(
        'Margin',
      );
    expect(() => generateQr({ text: 'x'.repeat(5000), options: DEFAULT_OPTIONS })).toThrow(
      'too long',
    );
    expect(() =>
      generateQr({
        text: 'x'.repeat(1000),
        options: { ...DEFAULT_OPTIONS, size: 128, margin: 16, errorCorrectionLevel: 'H' },
      }),
    ).toThrow('needs at least');
  });

  it('does not embed input markup in SVG', () => {
    const qr = generateQr({ text: '<script>alert("test")</script>', options: DEFAULT_OPTIONS });
    expect(qr.svg).not.toContain('<script');
    expect(inputKey(qr)).not.toBe(inputKey({ ...qr, text: qr.text + ' ' }));
  });
});
