/**
 * Writes a string to a DataView.
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Encodes an AudioBuffer to a WAV Blob.
 */
export function audioBufferToWav(buffer: AudioBuffer, opt?: { float32?: boolean }): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = opt?.float32 ? 3 : 1; // 3 = Float32, 1 = PCM
  const bitDepth = format === 3 ? 32 : 16;

  let result: Float32Array;
  if (numChannels === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }

  return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
}

/**
 * Encodes an AudioBuffer to an MP3 Blob using lamejs.
 */
export function audioBufferToMp3(buffer: AudioBuffer): Blob {
  // @ts-ignore - lamejs is loaded globally via script tag
  if (!window.lamejs) {
    throw new Error('lamejs library not loaded');
  }

  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const kbps = 192; // Standard high quality
  
  // @ts-ignore
  const mp3encoder = new window.lamejs.Mp3Encoder(channels, sampleRate, kbps);
  
  const mp3Data = [];
  
  // Convert samples to Int16
  const sampleLeft = new Int16Array(buffer.length);
  const dataLeft = buffer.getChannelData(0);
  
  // Helper to convert float to int16
  for (let i = 0; i < dataLeft.length; i++) {
    sampleLeft[i] = Math.max(-1, Math.min(1, dataLeft[i])) * 32767.5;
  }

  let sampleBlock;

  if (channels === 2) {
    const sampleRight = new Int16Array(buffer.length);
    const dataRight = buffer.getChannelData(1);
    for (let i = 0; i < dataRight.length; i++) {
      sampleRight[i] = Math.max(-1, Math.min(1, dataRight[i])) * 32767.5;
    }
    sampleBlock = mp3encoder.encodeBuffer(sampleLeft, sampleRight);
  } else {
    sampleBlock = mp3encoder.encodeBuffer(sampleLeft);
  }
  
  if (sampleBlock.length > 0) {
    mp3Data.push(sampleBlock);
  }
  
  const endBlock = mp3encoder.flush();
  if (endBlock.length > 0) {
    mp3Data.push(endBlock);
  }
  
  return new Blob(mp3Data, { type: 'audio/mp3' });
}

function interleave(inputL: Float32Array, inputR: Float32Array) {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);

  let index = 0;
  let inputIndex = 0;

  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function encodeWAV(samples: Float32Array, format: number, sampleRate: number, numChannels: number, bitDepth: number) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * bytesPerSample, true);

  if (format === 1) { // PCM
    floatTo16BitPCM(view, 44, samples);
  } else {
    writeFloat32(view, 44, samples);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeFloat32(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true);
  }
}