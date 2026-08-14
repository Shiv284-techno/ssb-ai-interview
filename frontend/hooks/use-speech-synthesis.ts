"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechSynthesisStatus = "idle" | "speaking" | "unsupported";

export interface UseSpeechSynthesisResult {
  status: SpeechSynthesisStatus;
  speak: (text: string) => void;
  stop: () => void;
}

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  return window.speechSynthesis;
}

/**
 * Browser text-to-speech. Owns the utterance lifecycle and nothing else — it
 * does not decide what to say, and never talks to an AI or backend.
 */
export function useSpeechSynthesis(
  lang = "en-IN",
): UseSpeechSynthesisResult {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [status, setStatus] = useState<SpeechSynthesisStatus>("idle");

  const stop = useCallback(() => {
    const utterance = utteranceRef.current;
    utteranceRef.current = null;

    // Detach first so the cancel below cannot fire a stale handler.
    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
    }

    getSynthesis()?.cancel();
    setStatus((current) => (current === "unsupported" ? current : "idle"));
  }, []);

  const speak = useCallback(
    (text: string) => {
      const synthesis = getSynthesis();
      if (!synthesis) {
        setStatus("unsupported");
        return;
      }

      const trimmed = text.trim();
      if (!trimmed) return;

      // Whatever is queued or mid-sentence is dropped before the new line.
      stop();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = lang;

      const finish = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setStatus("idle");
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      utteranceRef.current = utterance;
      setStatus("speaking");
      synthesis.speak(utterance);
    },
    [lang, stop],
  );

  // Stop speaking if the component unmounts mid-sentence.
  useEffect(() => stop, [stop]);

  return { status, speak, stop };
}
