import { createSequencer } from './sequencer.js';

// Renders the NES sound in the audio thread. processorOptions: { data (decoded sound data), music
// (start the song at once) }. Messages: { type: 'music' }, { type: 'stop' }, { type: 'sfx', name }.
class NesAudio extends AudioWorkletProcessor {
  constructor({ processorOptions: { data, music } }) {
    super();
    this.sequencer = createSequencer(data, sampleRate);
    if (music) this.sequencer.playMusic();
    this.port.onmessage = ({ data: message }) => {
      if (message.type === 'music') this.sequencer.playMusic();
      else if (message.type === 'stop') this.sequencer.stopMusic();
      else if (message.type === 'sfx') this.sequencer.playEffect(message.name);
    };
  }

  process(inputs, outputs) {
    this.sequencer.render(outputs[0][0]);
    return true;
  }
}

registerProcessor('nes-audio', NesAudio);
