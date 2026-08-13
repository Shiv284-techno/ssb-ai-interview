"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `lib.dom` ships SpeechRecognitionResult/ResultList but not the recognition
 * object itself, so the parts we use are declared locally.
 */
interface SpeechRecognitionResultEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export type SpeechStatus = "idle" | "listening" | "error" | "unsupported";

export type SpeechErrorKind =
  | "unsupported"
  | "permission-denied"
  | "no-microphone"
  | "network"
  | "unknown";

export interface SpeechError {
  kind: SpeechErrorKind;
  /** Message written for the candidate, not for the console. */
  message: string;
}

export interface UseSpeechRecognitionResult {
  status: SpeechStatus;
  /** Everything recognised so far in this session. */
  transcript: string;
  /** The phrase currently being recognised, not yet finalised. */
  interimTranscript: string;
  error: SpeechError | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;

  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function toSpeechError(code: string): SpeechError {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        kind: "permission-denied",
        message:
          "Microphone access was blocked. Allow microphone permission for this site, then try again.",
      };
    case "audio-capture":
      return {
        kind: "no-microphone",
        message: "No microphone was found. Connect one and try again.",
      };
    case "network":
      return {
        kind: "network",
        message:
          "Speech recognition needs a network connection and could not reach the service.",
      };
    default:
      return {
        kind: "unknown",
        message: "Speech recognition stopped unexpectedly. Please try again.",
      };
  }
}

/** Errors that end the session for good, rather than a pause we can resume from. */
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "network",
]);

/**
 * Browser speech-to-text. Owns the SpeechRecognition lifecycle and returns the
 * transcript — it does not talk to any AI or backend.
 */
export function useSpeechRecognition(
  lang = "en-IN",
): UseSpeechRecognitionResult {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  /** True while the user wants to be heard, so silence timeouts can resume. */
  const shouldListenRef = useRef(false);

  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<SpeechError | null>(null);

  const teardown = useCallback(() => {
    shouldListenRef.current = false;

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;

    recognition.onstart = null;
    recognition.onend = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.abort();
  }, []);

  const stop = useCallback(() => {
    teardown();
    setInterimTranscript("");
    setStatus("idle");
  }, [teardown]);

  const start = useCallback(() => {
    if (recognitionRef.current) return;

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setStatus("unsupported");
      setError({
        kind: "unsupported",
        message:
          "This browser cannot recognise speech. Use Chrome or Edge over HTTPS or localhost.",
      });
      return;
    }

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setStatus("listening");

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      const trimmedFinal = finalText.trim();
      if (trimmedFinal) {
        setTranscript((previous) =>
          previous ? `${previous} ${trimmedFinal}` : trimmedFinal,
        );
      }
      setInterimTranscript(interimText.trim());
    };

    recognition.onerror = (event) => {
      // "aborted" is our own stop(); "no-speech" is just a pause.
      if (event.error === "aborted" || event.error === "no-speech") return;

      if (FATAL_ERRORS.has(event.error)) {
        shouldListenRef.current = false;
        setError(toSpeechError(event.error));
        setStatus("error");
      }
    };

    recognition.onend = () => {
      // Chrome ends the session on silence — resume while the user is still on.
      if (shouldListenRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
          return;
        } catch {
          shouldListenRef.current = false;
        }
      }

      setInterimTranscript("");
      setStatus((current) => (current === "error" ? current : "idle"));
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    setError(null);

    try {
      recognition.start();
    } catch {
      teardown();
      setStatus("error");
      setError(toSpeechError("unknown"));
    }
  }, [lang, teardown]);

  const reset = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  // Release the microphone if the component unmounts while listening.
  useEffect(() => teardown, [teardown]);

  return {
    status,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}
