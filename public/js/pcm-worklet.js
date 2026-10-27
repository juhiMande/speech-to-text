// Runs on the audio thread. Converts the mic stream (usually 44.1/48 kHz float)
// into 16 kHz mono PCM16 and posts ~100 ms chunks back to the main thread.

const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 1600; // 100 ms at 16 kHz

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.residual = new Float32Array(0);
    this.pending = [];
    this.pendingLength = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    const merged = new Float32Array(this.residual.length + channel.length);
    merged.set(this.residual);
    merged.set(channel, this.residual.length);

    const outLength = Math.floor(merged.length / this.ratio);
    const out = new Int16Array(outLength);
    let energy = 0;

    for (let i = 0; i < outLength; i++) {
      // average the source samples that fall into this output sample (cheap low-pass)
      const start = Math.floor(i * this.ratio);
      const end = Math.min(Math.floor((i + 1) * this.ratio), merged.length);
      let sum = 0;
      for (let j = start; j < end; j++) sum += merged[j];
      const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      energy += sample * sample;
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    this.residual = merged.slice(Math.floor(outLength * this.ratio));
    this.pending.push(out);
    this.pendingLength += outLength;
    this.level = Math.sqrt(energy / Math.max(1, outLength));

    if (this.pendingLength >= CHUNK_SAMPLES) {
      const chunk = new Int16Array(this.pendingLength);
      let offset = 0;
      for (const part of this.pending) {
        chunk.set(part, offset);
        offset += part.length;
      }
      this.pending = [];
      this.pendingLength = 0;
      this.port.postMessage({ pcm: chunk.buffer, level: this.level }, [chunk.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
