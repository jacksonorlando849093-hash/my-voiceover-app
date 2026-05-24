export function loadLameJS(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).lamejs) {
      resolve((window as any).lamejs);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
    script.onload = () => {
      if ((window as any).lamejs) {
        resolve((window as any).lamejs);
      } else {
        reject(new Error("lamejs loaded but object not found in window"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load LAME MP3 Encoder library dynamically"));
    document.head.appendChild(script);
  });
}

/**
 * Encodes a browser AudioBuffer into a single high-quality mono/stereo MP3 Blob.
 */
export async function audioBufferToMp3(audioBuffer: AudioBuffer): Promise<Blob> {
  const lamejs = await loadLameJS();
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  
  // High quality bit-rate (128kbps or 192kbps)
  const kbps = 192;
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  const mp3Chunks: any[] = [];
  
  const sampleBlockSize = 1152;
  
  if (channels === 1) {
    // Mono Channel encoding
    const ch0 = audioBuffer.getChannelData(0);
    const intSamples = new Int16Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) {
      const s = Math.max(-1.0, Math.min(1.0, ch0[i]));
      intSamples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    for (let i = 0; i < intSamples.length; i += sampleBlockSize) {
      const chunk = intSamples.subarray(i, i + sampleBlockSize);
      const mp3buf = encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Chunks.push(mp3buf);
      }
    }
  } else {
    // Stereo Channels encoding
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.getChannelData(1);
    
    const leftSamples = new Int16Array(ch0.length);
    const rightSamples = new Int16Array(ch1.length);
    for (let i = 0; i < ch0.length; i++) {
      const s0 = Math.max(-1.0, Math.min(1.0, ch0[i]));
      leftSamples[i] = s0 < 0 ? s0 * 0x8000 : s0 * 0x7FFF;
      
      const s1 = Math.max(-1.0, Math.min(1.0, ch1[i]));
      rightSamples[i] = s1 < 0 ? s1 * 0x8000 : s1 * 0x7FFF;
    }
    
    for (let i = 0; i < leftSamples.length; i += sampleBlockSize) {
      const leftChunk = leftSamples.subarray(i, i + sampleBlockSize);
      const rightChunk = rightSamples.subarray(i, i + sampleBlockSize);
      const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Chunks.push(mp3buf);
      }
    }
  }
  
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Chunks.push(flushBuf);
  }
  
  return new Blob(mp3Chunks, { type: "audio/mp3" });
}

/**
 * Decodes a WAV dynamic base64 URL or normal URL into a browser AudioBuffer.
 */
export async function decodeAudioUrl(audioContext: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return new Promise((resolve, reject) => {
    audioContext.decodeAudioData(
      arrayBuffer,
      (decoded) => resolve(decoded),
      (err) => reject(new Error("Unable to decode audio stream: " + err))
    );
  });
}

/**
 * Concat multiple AudioBuffers into a single unified AudioBuffer with explicit silent spacing.
 */
export function mergeAudioBuffers(
  audioContext: AudioContext,
  buffers: AudioBuffer[],
  gapSeconds: number = 0.8
): AudioBuffer {
  if (buffers.length === 0) {
    return audioContext.createBuffer(1, 1, 44100);
  }
  
  const sampleRate = buffers[0].sampleRate;
  const numChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
  
  let totalLength = 0;
  for (let i = 0; i < buffers.length; i++) {
    totalLength += buffers[i].length;
    if (i < buffers.length - 1) {
      totalLength += Math.floor(gapSeconds * sampleRate);
    }
  }
  
  const mergedBuffer = audioContext.createBuffer(numChannels, totalLength, sampleRate);
  
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = mergedBuffer.getChannelData(channel);
    let offset = 0;
    
    for (let i = 0; i < buffers.length; i++) {
      const b = buffers[i];
      const srcChannel = channel < b.numberOfChannels ? channel : 0;
      const bData = b.getChannelData(srcChannel);
      
      channelData.set(bData, offset);
      offset += bData.length;
      
      if (i < buffers.length - 1) {
        offset += Math.floor(gapSeconds * sampleRate);
      }
    }
  }
  
  return mergedBuffer;
}

/**
 * Downloads a binary audio Blob cleanly onto the file system with custom names.
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Encodes an AudioBuffer into uncompressed high-fidelity 16-bit PCM WAV.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = raw PCM 16-bit
  const bitDepth = 16;
  
  let result;
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }
  
  const bufferLength = result.length * 2;
  const arrayBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(arrayBuffer);
  
  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + bufferLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numOfChan, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numOfChan * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numOfChan * 2, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, bufferLength, true);
  
  // write bytes
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([view], { type: 'audio/wav' });
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
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

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8005 : s * 0x7FFF, true);
  }
}
