export interface DecodedWav {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly durationSeconds: number;
}

/** Encodes mono PCM as a portable 16-bit little-endian WAV. */
export function encodeMonoPcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new Error('WAV sample rate must be a positive integer.');
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + (index * 2), sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767), true);
  }
  return buffer;
}

/** Decodes uncompressed integer PCM or 32-bit float WAV and mixes channels to mono. */
export function decodeWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  if (view.byteLength < 44 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('This file is not a valid WAV recording.');
  }
  let offset = 12;
  let format: { type: number; channels: number; sampleRate: number; bits: number; blockAlign: number } | null = null;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > view.byteLength) throw new Error('The WAV recording is truncated.');
    if (id === 'fmt ' && size >= 16) {
      format = {
        type: view.getUint16(body, true), channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true), blockAlign: view.getUint16(body + 12, true),
        bits: view.getUint16(body + 14, true)
      };
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = size;
    }
    offset = body + size + (size % 2);
  }
  if (!format || dataOffset < 0 || !dataLength) throw new Error('The WAV recording has no usable audio data.');
  if (format.channels < 1 || format.sampleRate <= 0 || format.blockAlign <= 0) throw new Error('The WAV audio format is invalid.');
  const supported = (format.type === 1 && [8, 16, 24, 32].includes(format.bits)) || (format.type === 3 && format.bits === 32);
  if (!supported) throw new Error('This WAV encoding is unsupported. Use PCM or 32-bit float WAV.');
  const frameCount = Math.floor(dataLength / format.blockAlign);
  if (!frameCount) throw new Error('The WAV recording is empty.');
  const bytesPerSample = format.bits / 8;
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let mono = 0;
    for (let channel = 0; channel < format.channels; channel += 1) {
      mono += readSample(view, dataOffset + (frame * format.blockAlign) + (channel * bytesPerSample), format.type, format.bits);
    }
    samples[frame] = mono / format.channels;
  }
  return {
    samples, sampleRate: format.sampleRate, channelCount: format.channels,
    durationSeconds: samples.length / format.sampleRate
  };
}

function readSample(view: DataView, offset: number, type: number, bits: number): number {
  if (type === 3) return Math.max(-1, Math.min(1, view.getFloat32(offset, true)));
  if (bits === 8) return (view.getUint8(offset) - 128) / 128;
  if (bits === 16) return view.getInt16(offset, true) / 32_768;
  if (bits === 24) {
    let value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    if (value & 0x800000) value |= 0xff000000;
    return value / 8_388_608;
  }
  return view.getInt32(offset, true) / 2_147_483_648;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index));
  return value;
}

