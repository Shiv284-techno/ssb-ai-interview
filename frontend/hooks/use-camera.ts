"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type CameraStatus = "idle" | "requesting" | "active" | "error";

export type CameraErrorKind =
  | "unsupported"
  | "permission-denied"
  | "not-found"
  | "in-use"
  | "unknown";

export interface CameraError {
  kind: CameraErrorKind;
  /** Message written for the candidate, not for the console. */
  message: string;
}

export interface UseCameraResult {
  /** Attach to the <video> element that should show the preview. */
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: CameraError | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};

function isGetUserMediaSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function errorName(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "name" in cause) {
    return String((cause as { name: unknown }).name);
  }
  return "";
}

function toCameraError(cause: unknown): CameraError {
  switch (errorName(cause)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return {
        kind: "permission-denied",
        message:
          "Camera access was blocked. Allow camera permission for this site in your browser, then try again.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return {
        kind: "not-found",
        message:
          "No camera was found. Connect a webcam and try again.",
      };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return {
        kind: "in-use",
        message:
          "The camera could not be started. It may be in use by another application.",
      };
    default:
      return {
        kind: "unknown",
        message: "The camera failed to start. Please try again.",
      };
  }
}

/**
 * Owns the webcam stream: permission, lifecycle and teardown. UI components
 * only read `status`/`error` and attach `videoRef` — they never touch
 * `getUserMedia` or the `MediaStream` themselves.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Bumped by every start/stop so a superseded request discards its stream. */
  const requestIdRef = useRef(0);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraError | null>(null);

  // Bind the stream to the video element whenever either changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    video.muted = true;

    if (stream) {
      // Autoplay can reject if the element is detached mid-play; harmless here.
      void video.play().catch(() => undefined);
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // Release the webcam if the component unmounts while it is running.
  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      stopTracks(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    stopTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setStatus("idle");
    setError(null);
  }, []);

  const start = useCallback(() => {
    if (streamRef.current) return;

    if (!isGetUserMediaSupported()) {
      setStatus("error");
      setError({
        kind: "unsupported",
        message:
          "This browser cannot access the camera. Use a recent Chrome, Edge, Firefox or Safari over HTTPS or localhost.",
      });
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("requesting");
    setError(null);

    void navigator.mediaDevices
      .getUserMedia(VIDEO_CONSTRAINTS)
      .then((mediaStream) => {
        // Cancelled or superseded while the permission prompt was open.
        if (requestId !== requestIdRef.current) {
          stopTracks(mediaStream);
          return;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setStatus("active");
      })
      .catch((cause: unknown) => {
        if (requestId !== requestIdRef.current) return;

        streamRef.current = null;
        setStream(null);
        setStatus("error");
        setError(toCameraError(cause));
      });
  }, []);

  const toggle = useCallback(() => {
    if (status === "active" || status === "requesting") {
      stop();
    } else {
      start();
    }
  }, [status, start, stop]);

  return { videoRef, status, error, start, stop, toggle };
}
