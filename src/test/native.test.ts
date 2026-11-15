import { Image } from '@tauri-apps/api/image';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { copyQr, saveQr } from '../services/native';
import { generateQr } from '../services/qr';
import { DEFAULT_OPTIONS } from '../types';

vi.mock('@tauri-apps/api/image', () => ({ Image: { new: vi.fn() } }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: vi.fn() }));

const qr = generateQr({ text: 'Native services', options: DEFAULT_OPTIONS });

describe('native export services', () => {
  it('writes valid SVG bytes only to the user-selected path', async () => {
    vi.mocked(save).mockResolvedValue('/chosen/code.svg');
    expect(await saveQr(qr, 'svg')).toBe(true);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: 'SVG image', extensions: ['svg'] }] }),
    );
    expect(writeFile).toHaveBeenCalledWith('/chosen/code.svg', new TextEncoder().encode(qr.svg));
  });

  it('treats cancelling the save dialog as a no-op', async () => {
    vi.mocked(save).mockResolvedValue(null);
    expect(await saveQr(qr, 'png')).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('propagates disk errors', async () => {
    vi.mocked(save).mockResolvedValue('/chosen/code.svg');
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('Permission denied'));
    await expect(saveQr(qr, 'svg')).rejects.toThrow('Permission denied');
  });

  it('copies an opaque RGBA image and releases its native resource', async () => {
    const close = vi.fn();
    const image = { close };
    vi.mocked(Image.new).mockResolvedValue(image as never);
    await copyQr(qr);
    expect(Image.new).toHaveBeenCalledWith(expect.any(Uint8Array), 512, 512);
    expect(writeImage).toHaveBeenCalledWith(image);
    expect(close).toHaveBeenCalledOnce();
  });

  it('releases the native resource even when the clipboard is busy', async () => {
    const close = vi.fn();
    vi.mocked(Image.new).mockResolvedValue({ close } as never);
    vi.mocked(writeImage).mockRejectedValueOnce(new Error('Clipboard busy'));
    await expect(copyQr(qr)).rejects.toThrow('Clipboard busy');
    expect(close).toHaveBeenCalledOnce();
  });
});
