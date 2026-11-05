// src/utils/speech.ts
class SpeechService {
  private synth: SpeechSynthesis | null = null;
  private germanVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = this.initVoices.bind(this);
      }
    }
  }

  private initVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    this.germanVoice =
      voices.find(v => v.lang.startsWith('de') && (v.name.includes('Google') || v.name.includes('Natural'))) ||
      voices.find(v => v.lang.startsWith('de')) ||
      null;
  }

  public speakGerman(text: string): void {
    if (!this.synth) return;
    if (this.synth.speaking) {
      this.synth.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    if (this.germanVoice) {
      utterance.voice = this.germanVoice;
    }
    utterance.rate = 0.9;
    this.synth.speak(utterance);
  }
}

export const speechService = new SpeechService();
