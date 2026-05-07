class PcmStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 4096;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (output) {
      output.fill(0);
    }

    if (!input) {
      return true;
    }

    for (let index = 0; index < input.length; index += 1) {
      this.buffer.push(input[index]);
    }

    if (this.buffer.length >= this.bufferSize) {
      const chunk = new Float32Array(this.buffer.splice(0, this.bufferSize));
      this.port.postMessage(chunk, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-stream-processor', PcmStreamProcessor);
