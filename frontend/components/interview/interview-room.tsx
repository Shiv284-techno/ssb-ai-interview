"use client";

import { useCallback, useEffect, useState } from "react";

import { CameraPanel } from "@/components/interview/camera-panel";
import { ControlBar } from "@/components/interview/control-bar";
import { InterviewerPanel } from "@/components/interview/interviewer-panel";
import { SessionEnded } from "@/components/interview/session-ended";
import { SessionHeader } from "@/components/interview/session-header";
import { WelcomeScreen } from "@/components/interview/welcome-screen";
import { useCamera } from "@/hooks/use-camera";
import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { INTERVIEW_QUESTIONS } from "@/lib/interview/questions";
import type { AiStatus, InterviewPhase } from "@/lib/interview/types";

/** How long the officer "asks" a question before it starts listening. */
const ASK_DURATION_MS = 3800;
/** How long the officer "considers" an answer before moving on. */
const THINK_DURATION_MS = 1400;

const LAST_QUESTION_INDEX = INTERVIEW_QUESTIONS.length - 1;

export function InterviewRoom() {
  const [phase, setPhase] = useState<InterviewPhase>("welcome");
  const [status, setStatus] = useState<AiStatus>("ready");
  const [questionIndex, setQuestionIndex] = useState(0);
  /** The candidate's mic intent, which survives pauses for the officer. */
  const [micOn, setMicOn] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finalDuration, setFinalDuration] = useState(0);

  const elapsedSeconds = useElapsedSeconds(startedAt);

  const {
    videoRef,
    status: cameraStatus,
    error: cameraError,
    start: startCamera,
    stop: stopCamera,
    toggle: toggleCamera,
  } = useCamera();

  const {
    status: speechStatus,
    transcript,
    interimTranscript,
    error: speechError,
    start: startListening,
    stop: stopListening,
    reset: resetTranscript,
  } = useSpeechRecognition();

  const {
    speak,
    stop: stopSpeaking,
    status: synthesisStatus,
  } = useSpeechSynthesis();

  const officerIsSpeaking = synthesisStatus === "speaking";
  const currentQuestion = INTERVIEW_QUESTIONS[questionIndex];

  // The only place recognition is started or stopped: listen when the candidate
  // has the mic on and the officer is not talking over them.
  useEffect(() => {
    if (phase === "live" && micOn && !officerIsSpeaking) {
      startListening();
    } else {
      stopListening();
    }
  }, [phase, micOn, officerIsSpeaking, startListening, stopListening]);

  // Read the active question aloud. `currentQuestion` is a stable reference
  // from the question list, so this fires once per question, not per render.
  useEffect(() => {
    if (phase !== "live") return;

    // Silence the mic before the officer starts, so the board's own voice is
    // never transcribed as the candidate's answer.
    stopListening();
    speak(currentQuestion.prompt);
  }, [phase, currentQuestion, speak, stopListening]);

  // The officer finishes asking the question, then hands over to the candidate.
  useEffect(() => {
    if (phase !== "live" || status !== "speaking") return;

    const timeoutId = window.setTimeout(
      () => setStatus("listening"),
      ASK_DURATION_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [phase, status]);

  // A pause for thought resolves into the next question being asked.
  useEffect(() => {
    if (phase !== "live" || status !== "thinking") return;

    const timeoutId = window.setTimeout(() => {
      setQuestionIndex((index) => Math.min(index + 1, LAST_QUESTION_INDEX));
      setStatus("speaking");
    }, THINK_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [phase, status]);

  const startInterview = useCallback(() => {
    setQuestionIndex(0);
    setFinalDuration(0);
    setStartedAt(Date.now());
    setStatus("speaking");
    setPhase("live");
    // Requested from the click itself, so the browser treats it as a user
    // gesture when it shows the permission prompt.
    startCamera();
    resetTranscript();
  }, [startCamera, resetTranscript]);

  const endInterview = useCallback(() => {
    setFinalDuration(elapsedSeconds);
    setStartedAt(null);
    setStatus("ready");
    setPhase("ended");
    setMicOn(false);
    stopCamera();
    stopListening();
    stopSpeaking();
  }, [elapsedSeconds, stopCamera, stopListening, stopSpeaking]);

  const toggleMic = useCallback(() => setMicOn((on) => !on), []);
  const askNextQuestion = useCallback(() => setStatus("thinking"), []);

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col bg-slate-950 font-sans text-slate-100">
      <SessionHeader
        phase={phase}
        elapsedSeconds={phase === "ended" ? finalDuration : elapsedSeconds}
      />

      {phase === "welcome" && (
        <WelcomeScreen
          onStart={startInterview}
          questionCount={INTERVIEW_QUESTIONS.length}
        />
      )}

      {phase === "ended" && (
        <SessionEnded
          durationSeconds={finalDuration}
          questionsCovered={questionIndex + 1}
          totalQuestions={INTERVIEW_QUESTIONS.length}
        />
      )}

      {phase === "live" && (
        <main className="grid flex-1 grid-cols-1 gap-4 p-4 sm:p-5 lg:min-h-0 lg:grid-cols-5 lg:gap-6 lg:overflow-hidden lg:p-6">
          <div className="flex min-h-0 flex-col lg:col-span-3">
            <CameraPanel
              cameraStatus={cameraStatus}
              cameraError={cameraError}
              videoRef={videoRef}
              micOn={micOn}
              onToggleCamera={toggleCamera}
              onRetryCamera={startCamera}
            />
          </div>
          <div className="flex min-h-0 flex-col lg:col-span-2">
            <InterviewerPanel
              status={status}
              question={currentQuestion}
              questionNumber={questionIndex + 1}
              totalQuestions={INTERVIEW_QUESTIONS.length}
              elapsedSeconds={elapsedSeconds}
              micOn={micOn}
              speechStatus={speechStatus}
              speechErrorMessage={speechError?.message ?? null}
              transcript={transcript}
              interimTranscript={interimTranscript}
              canAdvance={
                status !== "thinking" && questionIndex < LAST_QUESTION_INDEX
              }
              onNextQuestion={askNextQuestion}
            />
          </div>
        </main>
      )}

      <ControlBar
        phase={phase}
        cameraOn={cameraStatus === "active"}
        micOn={micOn}
        onToggleCamera={toggleCamera}
        onToggleMic={toggleMic}
        onStart={startInterview}
        onEnd={endInterview}
      />
    </div>
  );
}
