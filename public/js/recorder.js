// Microphone capture -> 16 kHz PCM16 chunks via an AudioWorklet.

export class MicStreamer {
  constructor({ onChunk, onLevel }) {
    this.onChunk = onChunk;
    this.onLevel = onLevel;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule("/js/pcm-worklet.js");

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-processor");
    this.node.port.onmessage = ({ data }) => {
      this.onChunk(data.pcm);
      if (this.onLevel) this.onLevel(data.level);
    };

    // The worklet has to be connected to the graph to be pulled; send it into a muted gain.
    this.mute = this.ctx.createGain();
    this.mute.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(this.mute).connect(this.ctx.destination);
  }

  async stop() {
    if (this.node) this.node.port.onmessage = null;
    this.source?.disconnect();
    this.node?.disconnect();
    this.mute?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
    this.stream = this.ctx = this.source = this.node = this.mute = null;
  }
}
