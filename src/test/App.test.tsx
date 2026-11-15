import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { readHistory, writeHistory } from '../services/history';
import { copyQr, saveQr } from '../services/native';
import { readOptions, writeOptions } from '../services/settings';
import { DEFAULT_OPTIONS, type HistoryEntry } from '../types';

vi.mock('../services/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/history')>()),
  readHistory: vi.fn(),
  writeHistory: vi.fn(),
}));
vi.mock('../services/native', () => ({ copyQr: vi.fn(), saveQr: vi.fn() }));
vi.mock('../services/settings', () => ({ readOptions: vi.fn(), writeOptions: vi.fn() }));

beforeEach(() => {
  vi.mocked(readHistory).mockResolvedValue([]);
  vi.mocked(writeHistory).mockResolvedValue();
  vi.mocked(copyQr).mockResolvedValue();
  vi.mocked(saveQr).mockResolvedValue(true);
  vi.mocked(readOptions).mockResolvedValue({ ...DEFAULT_OPTIONS });
  vi.mocked(writeOptions).mockResolvedValue();
});

async function start() {
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Generate QR code' })).toBeEnabled(),
  );
  return user;
}

describe('desktop workflow', () => {
  it('keeps the history toggle in the sidebar and preserves the draft across collapse', async () => {
    const user = await start();
    await user.type(screen.getByLabelText('Text or URL'), 'Keep my draft');
    const sidebar = screen.getByRole('complementary', { name: 'Generation history' });
    const collapse = within(sidebar).getByRole('button', { name: 'Collapse history' });
    expect(screen.getByRole('banner')).not.toContainElement(collapse);
    await user.click(collapse);
    const expand = within(sidebar).getByRole('button', { name: 'Expand history' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'New QR code' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Text or URL')).toHaveValue('Keep my draft');
    await user.click(expand);
    expect(within(sidebar).getByRole('button', { name: 'Collapse history' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'New QR code' })).toBeVisible();
  });

  it('restores saved options, remembers valid edits, and preserves them for a new code', async () => {
    vi.mocked(readOptions).mockResolvedValue({ size: 768, margin: 6, errorCorrectionLevel: 'H' });
    const user = await start();
    expect(screen.getByLabelText('Image size')).toHaveValue(768);
    expect(screen.getByLabelText('Margin')).toHaveValue(6);
    expect(screen.getByLabelText('Error correction')).toHaveValue('H');
    await user.clear(screen.getByLabelText('Image size'));
    expect(writeOptions).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Image size'), '1024');
    await waitFor(() =>
      expect(writeOptions).toHaveBeenLastCalledWith({
        size: 1024,
        margin: 6,
        errorCorrectionLevel: 'H',
      }),
    );
    await user.selectOptions(screen.getByLabelText('Error correction'), 'Q');
    expect(writeOptions).toHaveBeenLastCalledWith({
      size: 1024,
      margin: 6,
      errorCorrectionLevel: 'Q',
    });
    await user.type(screen.getByLabelText('Text or URL'), 'A new draft');
    await user.click(screen.getByRole('button', { name: 'New QR code' }));
    expect(screen.getByLabelText('Text or URL')).toHaveValue('');
    expect(screen.getByLabelText('Image size')).toHaveValue(1024);
    expect(screen.getByLabelText('Error correction')).toHaveValue('Q');
  });

  it('reports option persistence failures without preventing generation', async () => {
    vi.mocked(writeOptions).mockRejectedValue(new Error('Disk full'));
    const user = await start();
    await user.selectOptions(screen.getByLabelText('Error correction'), 'H');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not remember options'),
    );
    await user.type(screen.getByLabelText('Text or URL'), 'Still works');
    await user.click(screen.getByRole('button', { name: 'Generate QR code' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save PNG' })).toBeEnabled());
  });

  it('only records successful explicit generation and blocks stale exports', async () => {
    const user = await start();
    const generate = screen.getByRole('button', { name: 'Generate QR code' });
    const save = screen.getByRole('button', { name: 'Save PNG' });
    expect(save).toBeDisabled();
    await user.click(generate);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter some text');
    expect(writeHistory).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Text or URL'), 'Hello QR');
    expect(writeHistory).not.toHaveBeenCalled();
    await user.click(generate);
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByAltText('Generated QR code')).toBeVisible();
    expect(writeHistory).toHaveBeenCalledOnce();
    await user.type(screen.getByLabelText('Text or URL'), '!');
    expect(save).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy image' })).toBeDisabled();
    expect(screen.getByText('Changes pending')).toBeVisible();
    await user.click(generate);
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    expect(saveQr).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello QR!' }), 'png');
    expect(screen.getByRole('status')).toHaveTextContent('PNG saved successfully');
  });

  it('restores exact settings without recording again and confirms clearing', async () => {
    const entry: HistoryEntry = {
      id: 'saved',
      text: '你好 🌍',
      options: { ...DEFAULT_OPTIONS, size: 768, margin: 6, errorCorrectionLevel: 'H' },
      generatedAt: '2026-01-01T00:00:00Z',
    };
    vi.mocked(readHistory).mockResolvedValue([entry]);
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'Restore 你好 🌍' }));
    expect(screen.getByLabelText('Text or URL')).toHaveValue(entry.text);
    expect(screen.getByLabelText('Image size')).toHaveValue(768);
    expect(screen.getByLabelText('Margin')).toHaveValue(6);
    expect(screen.getByLabelText('Error correction')).toHaveValue('H');
    expect(writeHistory).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Keep history' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear history' }));
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear history' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writeHistory).toHaveBeenCalledWith([]);
    expect(screen.queryByRole('button', { name: 'Restore 你好 🌍' })).not.toBeInTheDocument();
  });

  it('keeps generation and export usable when storage cannot load', async () => {
    vi.mocked(readHistory).mockRejectedValue(new Error('Invalid history'));
    const user = await start();
    expect(screen.getByRole('alert')).toHaveTextContent('existing file has been left unchanged');
    await user.type(screen.getByLabelText('Text or URL'), 'Works offline');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy image' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Copy image' }));
    expect(copyQr).toHaveBeenCalledOnce();
    expect(writeHistory).not.toHaveBeenCalled();
  });

  it('preserves preview when history save fails and reports clipboard errors', async () => {
    vi.mocked(writeHistory).mockRejectedValue(new Error('Disk full'));
    vi.mocked(copyQr).mockRejectedValue(new Error('Clipboard busy'));
    const user = await start();
    await user.type(screen.getByLabelText('Text or URL'), 'Keep this preview');
    await user.click(screen.getByRole('button', { name: 'Generate QR code' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy image' })).toBeEnabled());
    expect(screen.getByAltText('Generated QR code')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Disk full');
    await user.click(screen.getByRole('button', { name: 'Copy image' }));
    expect(
      screen
        .getAllByRole('alert')
        .some((element) => element.textContent?.includes('Clipboard busy')),
    ).toBe(true);
  });

  it('deletes one record and starts a fresh draft without erasing history', async () => {
    const entry: HistoryEntry = {
      id: 'first',
      text: 'first',
      options: DEFAULT_OPTIONS,
      generatedAt: '2026-01-01T00:00:00Z',
    };
    vi.mocked(readHistory).mockResolvedValue([entry, { ...entry, id: 'second', text: 'second' }]);
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'Delete first' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Restore first' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Restore second' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore second' }));
    await user.click(screen.getByRole('button', { name: 'New QR code' }));
    expect(screen.getByLabelText('Text or URL')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Restore second' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save SVG' })).toBeDisabled();
  });

  it('treats cancelled export as a no-op without a success toast', async () => {
    vi.mocked(saveQr).mockResolvedValue(false);
    const user = await start();
    await user.type(screen.getByLabelText('Text or URL'), 'Cancel save');
    await user.click(screen.getByRole('button', { name: 'Generate QR code' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save SVG' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save SVG' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
