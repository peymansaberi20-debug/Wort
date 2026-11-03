
export interface SpeakOptions {
  rate?: number;
  vreg?: string;
  voiceName?: string;
  onEnd?: () => void;
  onErr?: (msg: string) => void;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }
  return window.speechSynthesis;
}

function isGermanVoice(voice: SpeechSynthesisVoice): boolean {
  return /^de(?:-|$)/i.test(voice.lang.trim());
}

export function getGermanVoices(): SpeechSynthesisVoice[] {
  const synth = getSpeechSynthesis();
  if (!synth) return [];

  try {
    return synth.getVoices().filter(isGermanVoice);
  } catch (e) {
    console.warn('Failed to get German voices:', e);
    return [];
  }
}

/**
 * Wait for Safari to expose its available voices.
 * Resolves with the available German voices, even if the list stays empty.
 */
export function getGermanVoicesAsync(
  maxWaitMs = 2500
): Promise<SpeechSynthesisVoice[]> {
  const synth = getSpeechSynthesis();
  if (!synth) return Promise.resolve([]);

  return new Promise(resolve => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (finished) return;
      finished = true;

      if (timer !== undefined) clearTimeout(timer);
      synth.removeEventListener('voiceschanged', checkVoices);

      resolve(getGermanVoices());
    };

    const checkVoices = () => {
      if (getGermanVoices().length > 0) {
        finish();
      }
    };

    synth.addEventListener('voiceschanged', checkVoices);

    timer = setTimeout(finish, maxWaitMs);

    // Safari may already have voices available.
    checkVoices();
  });
}

export function stopSpeaking(): void {
  const synth = getSpeechSynthesis();
  if (!synth) return;

  try {
    synth.cancel();
  } catch (e) {
    console.warn('Failed to stop speech:', e);
  }
}

export async function speak(
  text: string,
  options?: SpeakOptions | ((msg: string) => void)
): Promise<void> {
  const synth = getSpeechSynthesis();

  const opts: SpeakOptions =
    typeof options === 'object' && options !== null ? options : {};

  const reportError = (msg: string) => {
    if (typeof options === 'function') {
      options(msg);
    } else {
      opts.onErr?.(msg);
    }
  };

  if (!synth || !text?.trim()) {
    if (!synth) reportError('مرورگر شما از پخش صدا پشتیبانی نمی‌کند.');
    return;
  }

  try {
    // On iOS, the voice list may not be ready immediately.
    let voices = getGermanVoices();

    if (voices.length === 0) {
      voices = await getGermanVoicesAsync();
    }

    // Do not interrupt a newer utterance while waiting for voices.
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = opts.vreg || 'de-DE';
    utterance.rate =
      opts.rate != null && Number.isFinite(opts.rate)
        ? Math.max(0.1, Math.min(10, opts.rate))
        : 0.85;

    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (opts.voiceName) {
      selectedVoice = voices.find(v => v.name === opts.voiceName);
    }

    if (!selectedVoice && opts.vreg) {
      const requestedLang = opts.vreg.toLowerCase();

      selectedVoice = voices.find(
        v => v.lang.toLowerCase() === requestedLang
      );
    }

    if (!selectedVoice) {
      selectedVoice = voices.find(
        v => /^de-DE$/i.test(v.lang)
      );
    }

    if (!selectedVoice) {
      selectedVoice = voices[0];
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    if (opts.onEnd) {
      utterance.onend = opts.onEnd;
    }

    utterance.onerror = event => {
      opts.onErr?.(`خطا در پخش تلفظ: ${event.error}`);
    };

    synth.speak(utterance);
  } catch (e) {
    console.error('Speech synthesis error:', e);
    reportError('پخش تلفظ با خطا مواجه شد.');
  }
}
