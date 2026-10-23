import { useState, useEffect, useRef, useCallback } from 'react';

// SpeechRecognition type declarations for Web Speech API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useVoiceInput(options?: { lang?: string }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [duration, setDuration] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = options?.lang || 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [options?.lang]);

  const startListening = useCallback(() => {
    setTranscript('');
    setDuration(0);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        timerRef.current = window.setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
      } catch {
        // Fallback or already running
      }
    } else {
      // Mock listening simulation for environments without audio device
      setIsListening(true);
      timerRef.current = window.setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
      const simulatedText = 'In distributed systems, Strict Two-Phase Locking ensures that concurrent transactions remain serializable and prevents cascading rollbacks...';
      let index = 0;
      const simInterval = setInterval(() => {
        if (index < simulatedText.length) {
          setTranscript(simulatedText.slice(0, index + 8));
          index += 8;
        } else {
          clearInterval(simInterval);
        }
      }, 300);
    }
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // noop
      }
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setDuration(0);
  }, []);

  return {
    isListening,
    transcript,
    setTranscript,
    isSupported,
    duration,
    startListening,
    stopListening,
    resetTranscript,
  };
}
