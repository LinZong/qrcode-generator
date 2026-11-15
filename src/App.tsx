import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  History,
  Info,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  QrCode,
  Trash2,
  X,
} from 'lucide-react';
import { DEFAULT_OPTIONS, type GeneratedQr, type HistoryEntry, type QrOptions } from './types';
import { generateQr, inputKey, validateOptions } from './services/qr';
import { addHistory, readHistory, writeHistory } from './services/history';
import { copyQr, saveQr } from './services/native';
import { readOptions, writeOptions } from './services/settings';

const levels = [
  { value: 'L', label: 'Low', recovery: '7%' },
  { value: 'M', label: 'Medium', recovery: '15%' },
  { value: 'Q', label: 'Quartile', recovery: '25%' },
  { value: 'H', label: 'High', recovery: '30%' },
] as const;

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export default function App() {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<QrOptions>({ ...DEFAULT_OPTIONS });
  const [result, setResult] = useState<GeneratedQr | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [historyOpen, setHistoryOpen] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const operationLock = useRef(false);
  const settingsRevision = useRef(0);
  const dirty = result !== null && inputKey(result) !== inputKey({ text, options });
  const canExport = !!result && !dirty && !busy;

  useEffect(() => {
    let active = true;
    readOptions()
      .then((saved) => {
        if (active) setOptions(saved);
      })
      .catch(() => {
        if (active) setSettingsError('Could not load saved options. Using defaults.');
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function changeOptions(next: QrOptions) {
    setOptions(next);
    try {
      validateOptions(next);
    } catch {
      return;
    }
    const revision = ++settingsRevision.current;
    void writeOptions(next)
      .then(() => {
        if (revision === settingsRevision.current) setSettingsError('');
      })
      .catch((e: unknown) => {
        if (revision === settingsRevision.current)
          setSettingsError(`Could not remember options: ${messageFor(e)}`);
      });
  }

  useEffect(() => {
    let active = true;
    readHistory()
      .then((saved) => {
        if (active) {
          setEntries(saved);
          setHistoryState('ready');
        }
      })
      .catch(() => {
        if (active) {
          setHistoryState('error');
          setStorageError(
            'History could not be loaded. Your existing file has been left unchanged. You can still generate, save, and copy QR codes. Restart the app to retry.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!confirmClear) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !operationLock.current) {
        setConfirmClear(false);
        clearRef.current?.focus();
      }
      if (event.key === 'Tab') {
        const buttons = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button:not(:disabled)'),
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmClear]);

  async function persist(next: HistoryEntry[]): Promise<boolean> {
    try {
      await writeHistory(next);
      setEntries(next);
      setStorageError('');
      return true;
    } catch (e) {
      setStorageError(
        `Could not save history: ${messageFor(e)} Your previous history is still shown.`,
      );
      return false;
    }
  }

  async function generate() {
    if (operationLock.current || confirmClear || settingsLoading || historyState === 'loading')
      return;
    operationLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const qr = generateQr({ text, options });
      setResult(qr);
      if (historyState === 'ready') await persist(addHistory(entries, qr));
    } catch (e) {
      setError(messageFor(e));
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  async function exportResult(format: 'png' | 'svg' | 'copy') {
    if (!result || !canExport || operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    setAction(format);
    setError('');
    setNotice('');
    try {
      if (format === 'copy') {
        await copyQr(result);
        setNotice('QR code copied to clipboard.');
      } else if (await saveQr(result, format)) {
        setNotice(`${format.toUpperCase()} saved successfully.`);
      }
    } catch (e) {
      setError(`Could not ${format === 'copy' ? 'copy image' : 'save image'}: ${messageFor(e)}`);
    } finally {
      operationLock.current = false;
      setBusy(false);
      setAction('');
    }
  }

  function restore(entry: HistoryEntry) {
    if (busy || settingsLoading) return;
    try {
      const qr = generateQr(entry);
      setText(entry.text);
      changeOptions({ ...entry.options });
      setResult(qr);
      setError('');
      setNotice('');
    } catch (e) {
      setError(messageFor(e));
    }
  }

  async function remove(id?: string) {
    if (operationLock.current || historyState !== 'ready') return;
    operationLock.current = true;
    setBusy(true);
    try {
      const success = await persist(id ? entries.filter((entry) => entry.id !== id) : []);
      if (success && !id) {
        setConfirmClear(false);
        clearRef.current?.focus();
      }
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  function newCode() {
    if (busy) return;
    setText('');
    setResult(null);
    setError('');
    setNotice('');
    textRef.current?.focus();
  }

  return (
    <div className="app-shell">
      <header className="app-header" inert={confirmClear}>
        <a className="brand" href="#main" aria-label="QR Code Generator home">
          <span className="brand-mark">
            <QrCode size={22} strokeWidth={2.2} />
          </span>
          <span>QR Code Generator</span>
        </a>
      </header>

      <div className={`workspace ${historyOpen ? '' : 'history-hidden'}`}>
        <aside
          className={`history-panel ${historyOpen ? '' : 'history-collapsed'}`}
          aria-label="Generation history"
          inert={confirmClear}
        >
          <div className="history-heading">
            {historyOpen && (
              <div>
                <History size={17} />
                <h2>History</h2>
                <span className="count">{entries.length}</span>
              </div>
            )}
            <div className="history-heading-actions">
              {historyOpen && (
                <button
                  ref={clearRef}
                  className="icon-button"
                  aria-label="Clear history"
                  disabled={!entries.length || busy}
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                className="icon-button history-toggle"
                aria-label={historyOpen ? 'Collapse history' : 'Expand history'}
                title={historyOpen ? 'Collapse history' : 'Expand history'}
                aria-expanded={historyOpen}
                aria-controls="history-content"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                {historyOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
              </button>
            </div>
          </div>
          <div id="history-content" className="history-content" hidden={!historyOpen}>
            <button className="new-button" onClick={newCode} disabled={busy || settingsLoading}>
              <Plus size={17} />
              New QR code
            </button>
            <div className="history-list">
              {historyState === 'loading' && (
                <p className="history-empty">
                  <LoaderCircle size={22} className="spin" />
                  Loading history…
                </p>
              )}
              {historyState === 'error' && (
                <p className="history-empty">
                  <Info size={24} />
                  History unavailable<span>Restart the app to try again.</span>
                </p>
              )}
              {historyState === 'ready' && !entries.length && (
                <div className="history-empty">
                  <span className="empty-icon">
                    <Clock3 size={25} />
                  </span>
                  <strong>No history yet</strong>
                  <span>Generated QR codes appear here.</span>
                </div>
              )}
              {entries.map((entry) => (
                <div
                  className={`history-item ${result && inputKey(result) === inputKey(entry) ? 'selected' : ''}`}
                  key={entry.id}
                >
                  <button
                    className="history-restore"
                    disabled={busy || settingsLoading}
                    onClick={() => restore(entry)}
                    title={entry.text}
                    aria-label={`Restore ${entry.text}`}
                  >
                    <span className="history-item-icon">
                      <QrCode size={20} />
                    </span>
                    <span className="history-item-body">
                      <strong>{entry.text.replace(/\s+/g, ' ')}</strong>
                      <time dateTime={entry.generatedAt}>{shortDate(entry.generatedAt)}</time>
                      <span>
                        {entry.options.size} px <b>·</b> Level {entry.options.errorCorrectionLevel}
                      </span>
                    </span>
                  </button>
                  <button
                    className="icon-button delete-entry"
                    aria-label={`Delete ${entry.text}`}
                    onClick={() => void remove(entry.id)}
                    disabled={busy}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main id="main" inert={confirmClear}>
          <div className="page-heading">
            <h1>Generate QR code</h1>
          </div>
          {storageError && (
            <div className="storage-warning" role="alert">
              <Info size={17} />
              <span>{storageError}</span>
            </div>
          )}
          {settingsError && (
            <div className="storage-warning" role="alert">
              <Info size={17} />
              <span>{settingsError}</span>
            </div>
          )}
          <div className="editor-grid">
            <section className="editor-card" aria-labelledby="content-heading">
              <div className="section-heading">
                <span className="step-number">01</span>
                <h2 id="content-heading">Content</h2>
              </div>
              <label className="field-label" htmlFor="content">
                Text or URL
              </label>
              <div className="textarea-wrap">
                <textarea
                  id="content"
                  ref={textRef}
                  value={text}
                  disabled={busy}
                  placeholder="Enter text or a URL"
                  onChange={(e) => {
                    setText(e.target.value);
                    setError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void generate();
                    }
                  }}
                  spellCheck={false}
                />
                <span className="character-count">
                  {Array.from(text).length.toLocaleString()} characters
                </span>
              </div>
              <div className="section-heading settings-heading">
                <span className="step-number">02</span>
                <h2>Options</h2>
              </div>
              <div className="number-fields">
                <div>
                  <label className="field-label" htmlFor="size">
                    Image size
                  </label>
                  <div className="number-input">
                    <input
                      id="size"
                      type="number"
                      min={128}
                      max={2048}
                      step={1}
                      disabled={busy || settingsLoading}
                      value={Number.isNaN(options.size) ? '' : options.size}
                      onChange={(e) => changeOptions({ ...options, size: e.target.valueAsNumber })}
                    />
                    <span>px</span>
                  </div>
                  <span className="field-hint">128 – 2048 px</span>
                </div>
                <div>
                  <label className="field-label" htmlFor="margin">
                    Margin
                  </label>
                  <div className="number-input">
                    <input
                      id="margin"
                      type="number"
                      min={0}
                      max={16}
                      step={1}
                      disabled={busy || settingsLoading}
                      value={Number.isNaN(options.margin) ? '' : options.margin}
                      onChange={(e) =>
                        changeOptions({ ...options, margin: e.target.valueAsNumber })
                      }
                    />
                    <span>modules</span>
                  </div>
                  <span className="field-hint">Quiet space around your code</span>
                </div>
              </div>
              <label className="field-label correction-label" htmlFor="correction">
                Error correction
              </label>
              <div className="select-wrap">
                <select
                  id="correction"
                  disabled={busy || settingsLoading}
                  value={options.errorCorrectionLevel}
                  onChange={(e) =>
                    changeOptions({
                      ...options,
                      errorCorrectionLevel: e.target.value as QrOptions['errorCorrectionLevel'],
                    })
                  }
                >
                  {levels.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.value} — {level.label} ({level.recovery} recovery)
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} />
              </div>
              <p className="field-hint correction-hint">
                <Info size={13} />
                Higher levels stay readable with more damage.
              </p>
              {options.margin < 4 && (
                <p className="margin-note">
                  A margin of at least 4 modules is recommended for reliable scanning.
                </p>
              )}
              <button
                className="generate-button"
                disabled={busy || settingsLoading || historyState === 'loading'}
                onClick={() => void generate()}
              >
                {busy && !action ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <QrCode size={17} />
                )}
                Generate QR code
                <ArrowRight size={17} />
              </button>
              <span className="shortcut-hint">
                <kbd>{navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl'}</kbd> + <kbd>Enter</kbd>{' '}
                to generate
              </span>
            </section>

            <section className="preview-card" aria-labelledby="preview-heading">
              <div className="preview-heading">
                <h2 id="preview-heading">Preview</h2>
                <span className={`preview-status ${result && !dirty ? 'ready' : ''}`}>
                  <span />
                  {dirty ? 'Changes pending' : result ? 'Generated' : 'Not generated'}
                </span>
              </div>
              <div className={`preview-area ${result ? 'has-result' : ''}`}>
                {result ? (
                  <div className={`qr-image-wrap ${dirty ? 'stale' : ''}`}>
                    <img
                      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`}
                      alt="Generated QR code"
                      width={result.options.size}
                      height={result.options.size}
                    />
                  </div>
                ) : (
                  <div className="preview-empty">
                    <div className="preview-placeholder">
                      <QrCode size={78} strokeWidth={1} />
                      <span className="corner tl" />
                      <span className="corner tr" />
                      <span className="corner bl" />
                      <span className="corner br" />
                    </div>
                    <strong>No QR code yet</strong>
                    <p>Enter text and select Generate QR code.</p>
                  </div>
                )}
              </div>
              {result && (
                <div className="preview-caption">
                  <>
                    <span>
                      {result.options.size} × {result.options.size} px
                    </span>
                    <span className="caption-dot">·</span>
                    <span>Margin {result.options.margin}</span>
                    <span className="caption-dot">·</span>
                    <span>Level {result.options.errorCorrectionLevel}</span>
                  </>
                </div>
              )}
              {dirty && <p className="dirty-hint">Generate again to apply your changes.</p>}
              <div className="export-actions">
                <button disabled={!canExport} onClick={() => void exportResult('png')}>
                  {action === 'png' ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  Save PNG
                </button>
                <button disabled={!canExport} onClick={() => void exportResult('svg')}>
                  {action === 'svg' ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  Save SVG
                </button>
              </div>
              <button
                className="copy-button"
                disabled={!canExport}
                onClick={() => void exportResult('copy')}
              >
                {action === 'copy' ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Copy size={16} />
                )}
                Copy image
              </button>
            </section>
          </div>
          {error && (
            <div className="error-message" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {confirmClear && (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-title"
            aria-describedby="clear-description"
            className="modal"
          >
            <span className="modal-icon">
              <Trash2 size={22} />
            </span>
            <h2 id="clear-title">Clear your history?</h2>
            <p id="clear-description">
              This will permanently remove all {entries.length} saved records from this device.
              Exported images will stay in your files.
            </p>
            <div className="modal-actions">
              <button
                ref={cancelRef}
                disabled={busy}
                onClick={() => {
                  setConfirmClear(false);
                  clearRef.current?.focus();
                }}
              >
                Keep history
              </button>
              <button className="danger-button" disabled={busy} onClick={() => void remove()}>
                {busy ? 'Clearing…' : 'Clear history'}
              </button>
            </div>
            {storageError && (
              <p role="alert" className="modal-error">
                {storageError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
