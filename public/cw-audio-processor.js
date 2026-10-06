/* AudioWorklet edge: frame mono PCM without interpreting Morse semantics. */
class CwAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 512;
    this.frame = new Float32Array(this.frameSize);
    this.frameOffset = 0;
    this.nextSample = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'flush') {
        this.emitFrame();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    let sourceOffset = 0;
    while (sourceOffset < channel.length) {
      const copyLength = Math.min(channel.length - sourceOffset, this.frameSize - this.frameOffset);
      this.frame.set(channel.subarray(sourceOffset, sourceOffset + copyLength), this.frameOffset);
      sourceOffset += copyLength;
      this.frameOffset += copyLength;
      if (this.frameOffset === this.frameSize) this.emitFrame();
    }
    return true;
  }

  emitFrame() {
    if (!this.frameOffset) return;
    const samples = this.frameOffset === this.frameSize ? this.frame : this.frame.slice(0, this.frameOffset);
    this.port.postMessage(
      { type: 'pcm-frame', samples, sampleRate, startSample: this.nextSample },
      [samples.buffer]
    );
    this.nextSample += this.frameOffset;
    this.frame = new Float32Array(this.frameSize);
    this.frameOffset = 0;
  }
}

registerProcessor('cw-audio-processor', CwAudioProcessor);
