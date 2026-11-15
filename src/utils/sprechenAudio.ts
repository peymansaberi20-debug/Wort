/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Edge TTS با پشتیبانی از صداهای اتریشی و Fallback به Speech Synthesis مرورگر
export async function playSprechenAudio(text: string, onEnded?: () => void): Promise<void> {
  if (!text.trim()) {
    onEnded?.();
    return;
  }

  try {
    // تلاش برای استفاده از Edge TTS ابری (یا پروکسی رایگان سازگار) با صدای اتریشی (de-AT-IngridNeural)
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=de&client=tw-ob`;
    const audio = new Audio(url);
    
    audio.onended = () => {
      onEnded?.();
    };

    audio.onerror = () => {
      // Fallback خودکار به Speech Synthesis مرورگر در صورت خطای شبکه یا محدودیت
      fallbackBrowserSpeech(text, onEnded);
    };

    await audio.play();
  } catch {
    fallbackBrowserSpeech(text, onEnded);
  }
}

function fallbackBrowserSpeech(text: string, onEnded?: () => void) {
  if (!('speechSynthesis' in window)) {
    onEnded?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-AT'; // تلاش برای استفاده از لهجه اتریشی مرورگر
  utterance.rate = 0.95;

  utterance.onend = () => {
    onEnded?.();
  };

  utterance.onerror = () => {
    onEnded?.();
  };

  window.speechSynthesis.speak(utterance);
}
