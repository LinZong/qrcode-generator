export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrOptions {
  size: number;
  margin: number;
  errorCorrectionLevel: ErrorCorrectionLevel;
}

export interface QrInput {
  text: string;
  options: QrOptions;
}

export interface GeneratedQr extends QrInput {
  svg: string;
  moduleCount: number;
  modules: Uint8Array;
}

export interface HistoryEntry extends QrInput {
  id: string;
  generatedAt: string;
}

export const DEFAULT_OPTIONS: QrOptions = {
  size: 512,
  margin: 4,
  errorCorrectionLevel: 'M',
};
