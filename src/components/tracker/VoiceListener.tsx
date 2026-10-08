"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX, Radio, Sparkles } from "lucide-react";

interface VoiceListenerProps {
  onSendMessage: (transcript: string) => void;
  isLoading: boolean;
  onVoiceStateChange?: (isListening: boolean) => void;
}

export function VoiceListener({
  onSendMessage,
  isLoading,
  onVoiceStateChange
}: VoiceListenerProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTranscriptRef = useRef<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = "es-MX";

        recog.onresult = (event: any) => {
          // Descartar si el asistente está hablando por altavoz o si la API está procesando
          if (typeof window !== "undefined" && (window as any).__IS_ASSISTANT_SPEAKING__) {
            accumulatedTranscriptRef.current = "";
            setInterimTranscript("");
            return;
          }

          let currentInterim = "";
          let finalChunk = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalChunk += transcript + " ";
            } else {
              currentInterim += transcript;
            }
          }

          if (finalChunk) {
            accumulatedTranscriptRef.current += finalChunk;
          }

          setInterimTranscript(
            (accumulatedTranscriptRef.current + " " + currentInterim).trim()
          );

          // Reiniciar temporizador de silencio (1.8s tras pausar)
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          silenceTimeoutRef.current = setTimeout(() => {
            if (typeof window !== "undefined" && (window as any).__IS_ASSISTANT_SPEAKING__) {
              return;
            }
            const finalSpeech = (accumulatedTranscriptRef.current + " " + currentInterim).trim();
            if (finalSpeech.length > 2) {
              // Enviar instrucción reconocida
              onSendMessage(finalSpeech);
              accumulatedTranscriptRef.current = "";
              setInterimTranscript("");
            }
          }, 1800);
        };

        recog.onerror = (event: any) => {
          console.warn("Speech recognition error:", event.error);
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            setIsListening(false);
          }
        };

        recog.onend = () => {
          // Si el usuario no ha cancelado conscientemente, mantener la reconexión en modo continuo
          if (recognitionRef.current?._shouldKeepRunning && !isLoading) {
            try {
              recog.start();
            } catch {
              // Ignore already started
            }
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = recog;
      }
    }

    return () => {
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (recognitionRef.current) {
        recognitionRef.current._shouldKeepRunning = false;
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [onSendMessage, isLoading]);

  useEffect(() => {
    onVoiceStateChange?.(isListening);
  }, [isListening, onVoiceStateChange]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current._shouldKeepRunning = false;
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      setInterimTranscript("");
      accumulatedTranscriptRef.current = "";
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    } else {
      try {
        window.speechSynthesis?.cancel(); // Cancel any ongoing speech
        recognitionRef.current._shouldKeepRunning = true;
        accumulatedTranscriptRef.current = "";
        setInterimTranscript("");
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Error starting speech recognition:", e);
      }
    }
  };

  const toggleTts = () => {
    if (isSpeaking) {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
    }
    setTtsEnabled(!ttsEnabled);
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Speech Visualizer Badge if listening */}
      {isListening && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-full animate-pulse">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          <span className="text-[10px] font-bold text-rose-700 tracking-tight">
            {interimTranscript ? interimTranscript.slice(-30) : "Escuchando voz..."}
          </span>
        </div>
      )}

      {/* TTS Audio Toggle */}
      <button
        type="button"
        onClick={toggleTts}
        className={`p-1.5 rounded-lg border transition-colors ${
          ttsEnabled
            ? "text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
            : "text-slate-400 bg-slate-50 border-slate-200 hover:bg-slate-100"
        }`}
        title={ttsEnabled ? "Voz de confirmación activada" : "Voz de confirmación desactivada"}
      >
        {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
      </button>

      {/* Main Microphone Button */}
      <button
        type="button"
        onClick={toggleListening}
        disabled={isLoading}
        className={`relative p-2 rounded-xl border transition-all duration-300 shadow-xs flex items-center justify-center ${
          isListening
            ? "bg-rose-600 text-white border-rose-600 shadow-rose-200 shadow-md ring-4 ring-rose-100 scale-105"
            : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50"
        } disabled:opacity-40`}
        title={isListening ? "Detener escucha continua" : "Activar dictado y órdenes por voz"}
      >
        {isListening ? (
          <Mic size={16} className="animate-pulse" />
        ) : (
          <Mic size={16} />
        )}
      </button>
    </div>
  );
}

// Helper to speak out concise assistant confirmations
export function speakAssistantText(text?: string) {
  if (!text || typeof text !== "string" || typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();

    // Strip markdown formatting and extract clean first sentence or summary
    const cleanText = text
      .replace(/[#*`_~]/g, "")
      .replace(/\[.*?\]\(.*?\)/g, "")
      .split("\n")[0]
      .trim();

    if (!cleanText) return;

    (window as any).__IS_ASSISTANT_SPEAKING__ = true;

    const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 200));
    utterance.lang = "es-MX";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick a Spanish voice if available
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith("es"));
    if (esVoice) {
      utterance.voice = esVoice;
    }

    utterance.onend = () => {
      // Buffer de 600ms para evitar eco del final
      setTimeout(() => {
        if (typeof window !== "undefined") {
          (window as any).__IS_ASSISTANT_SPEAKING__ = false;
        }
      }, 600);
    };

    utterance.onerror = () => {
      if (typeof window !== "undefined") {
        (window as any).__IS_ASSISTANT_SPEAKING__ = false;
      }
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
    if (typeof window !== "undefined") {
      (window as any).__IS_ASSISTANT_SPEAKING__ = false;
    }
  }
}
