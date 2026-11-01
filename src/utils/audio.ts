export interface SpeakOptions {
  rate?: number;
  vreg?: string;
  voiceName?: string;
  onEnd?: () => void;
  onErr?: (msg: string) => void;
}

export function getGermanVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter(v => /^de/i.test(v.lang));
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('Failed to stop speech:', e);
    }
  }
}

export function speak(
  text: string,
  options?: SpeakOptions | ((msg: string) => void)
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
    if (typeof options === 'object' && options?.onErr) {
      options.onErr('مرورگر شما از پخش صدا پشتیبانی نمی‌کند.');
    } else if (typeof options === 'function') {
      options('مرورگر شما از پخش صدا پشتیبانی نمی‌کند.');
    }
    return;
  }

  const opts: SpeakOptions = typeof options === 'object' ? options : {};

  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.vreg || 'de-DE';
    u.rate = opts.rate != null && !isNaN(opts.rate) ? opts.rate : 0.85;

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (opts.voiceName) {
      selectedVoice = voices.find(v => v.name === opts.voiceName);
    }
    if (!selectedVoice && opts.vreg) {
      selectedVoice = voices.find(v => v.lang.toLowerCase() === opts.vreg!.toLowerCase());
    }
    if (!selectedVoice) {
      selectedVoice = voices.find(v => /^de/i.test(v.lang));
    }
    if (selectedVoice) {
      u.voice = selectedVoice;
    }

    if (opts.onEnd) {
      u.onend = opts.onEnd;
    }

    window.speechSynthesis.speak(u);
  } catch (e) {
    console.error('Speech synthesis error:', e);
  }
}
