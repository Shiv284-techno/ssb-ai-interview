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
import { useInterviewer, type InterviewTurn } from "@/hooks/use-interviewer";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { INTERVIEW_QUESTIONS } from "@/lib/interview/questions";
import type {
  AiStatus,
  InterviewPhase,
  InterviewQuestion,
} from "@/lib/interview/types";

/** The board always opens with this; every later question comes from the API. */
const OPENING_QUESTION = INTERVIEW_QUESTIONS[0];

interface InterviewRoomProps {
  /** Display name only — resolved server-side from the verified session. */
  candidateName: string;
}

export function InterviewRoom({ candidateName }: InterviewRoomProps) {
  const [phase, setPhase] = useState<InterviewPhase>("welcome");
  /** The full conversation, sent to the interviewer on every submission. */
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
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

  const {
    status: interviewerStatus,
    error: interviewerError,
    askInterviewer,
  } = useInterviewer();

  const officerIsSpeaking = synthesisStatus === "speaking";
  const isThinking = interviewerStatus === "thinking";
  /** Guards against a blank name in the sheet leaving the plate empty. */
  const displayName = candidateName.trim() || "You";

  const officerTurnCount = turns.reduce(
    (count, turn) => count + (turn.role === "officer" ? 1 : 0),
    0,
  );

  // The opening question keeps its authored focus; later ones are follow-ups.
  const currentQuestion: InterviewQuestion =
    officerTurnCount <= 1
      ? OPENING_QUESTION
      : {
          id: `officer-${officerTurnCount}`,
          prompt: turns[turns.length - 1]?.text ?? OPENING_QUESTION.prompt,
          focus: "Follow-up",
        };

  // Derived from what the officer is actually doing — no timers.
  const aiStatus: AiStatus =
    phase !== "live"
      ? "ready"
      : officerIsSpeaking
        ? "speaking"
        : isThinking
          ? "thinking"
          : "listening";

  const answerErrorMessage =
    speechStatus === "error" || speechStatus === "unsupported"
      ? (speechError?.message ?? null)
      : (interviewerError?.message ?? null);

  // The only place recognition is started or stopped: listen when the candidate
  // has the mic on and the officer is neither speaking nor considering a reply.
  useEffect(() => {
    if (phase === "live" && micOn && !officerIsSpeaking && !isThinking) {
      startListening();
    } else {
      stopListening();
    }
  }, [phase, micOn, officerIsSpeaking, isThinking, startListening, stopListening]);

  const startInterview = useCallback(() => {
    setTurns([{ role: "officer", text: OPENING_QUESTION.prompt }]);
    setFinalDuration(0);
    setStartedAt(Date.now());
    setPhase("live");
    // Requested from the click itself, so the browser treats it as a user
    // gesture when it shows the permission prompt.
    startCamera();
    resetTranscript();
    speak(OPENING_QUESTION.prompt);
  }, [startCamera, resetTranscript, speak]);

  const endInterview = useCallback(() => {
    setFinalDuration(elapsedSeconds);
    setStartedAt(null);
    setPhase("ended");
    setMicOn(false);
    stopCamera();
    stopListening();
    stopSpeaking();
  }, [elapsedSeconds, stopCamera, stopListening, stopSpeaking]);

  const toggleMic = useCallback(() => setMicOn((on) => !on), []);

  const canSubmitAnswer =
    phase === "live" &&
    !isThinking &&
    !officerIsSpeaking &&
    transcript.trim().length > 0;

  const submitAnswer = useCallback(async () => {
    const answer = transcript.trim();
    if (phase !== "live" || isThinking || answer.length === 0) return;

    // Silence the mic while the board considers the answer.
    stopListening();

    const answered: InterviewTurn[] = [
      ...turns,
      { role: "candidate", text: answer },
    ];
    setTurns(answered);
    resetTranscript();

    const reply = await askInterviewer(answered, elapsedSeconds);
    // Null means the request failed; the error is surfaced in the panel.
    if (!reply) return;

    setTurns((current) => [...current, { role: "officer", text: reply.question }]);
    speak(reply.question);
  }, [
    phase,
    isThinking,
    transcript,
    turns,
    elapsedSeconds,
    stopListening,
    resetTranscript,
    askInterviewer,
    speak,
  ]);

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col bg-slate-950 font-sans text-slate-100">
      <SessionHeader
        phase={phase}
        elapsedSeconds={phase === "ended" ? finalDuration : elapsedSeconds}
        candidateName={displayName}
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
          questionsCovered={officerTurnCount}
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
              candidateName={displayName}
            />
          </div>
          <div className="flex min-h-0 flex-col lg:col-span-2">
            <InterviewerPanel
              status={aiStatus}
              question={currentQuestion}
              questionNumber={officerTurnCount}
              elapsedSeconds={elapsedSeconds}
              micOn={micOn}
              speechStatus={speechStatus}
              errorMessage={answerErrorMessage}
              transcript={transcript}
              interimTranscript={interimTranscript}
              canSubmit={canSubmitAnswer}
              onSubmitAnswer={() => void submitAnswer()}
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
