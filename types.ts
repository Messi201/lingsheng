export interface AudioProcessingState {
  isProcessing: boolean;
  statusMessage: string;
}

export interface RingtoneSettings {
  fadeIn: boolean;
  fadeOut: boolean;
  duration: number; // in seconds
  fileName: string;
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  EDIT = 'EDIT',
  DOWNLOAD = 'DOWNLOAD'
}