import { useCallback, useEffect, useRef, useState } from 'react';

type AudioContextConstructor = typeof AudioContext;

type WebAudioWindow = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

export function useAudioLevel() {
  const [level, setLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const smoothedLevelRef = useRef(0);

  const stop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }

    sourceRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
    smoothedLevelRef.current = 0;
    setLevel(0);
    setIsListening(false);
  }, []);

  const start = useCallback(async () => {
    if (audioContextRef.current) {
      return true;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support microphone capture.');
      return false;
    }

    const AudioContextClass =
      window.AudioContext || (window as WebAudioWindow).webkitAudioContext;

    if (!AudioContextClass) {
      setError('This browser does not support the Web Audio API.');
      return false;
    }

    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      const samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      streamRef.current = stream;
      setIsListening(true);

      const readLevel = () => {
        analyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }

        const rms = Math.sqrt(sum / samples.length);
        const nextLevel = Math.min(1, Math.max(0, rms * 4.5));
        smoothedLevelRef.current =
          smoothedLevelRef.current * 0.72 + nextLevel * 0.28;

        setLevel(smoothedLevelRef.current);
        animationFrameRef.current = requestAnimationFrame(readLevel);
      };

      readLevel();
      return true;
    } catch (requestError) {
      stop();

      if (requestError instanceof DOMException && requestError.name === 'NotAllowedError') {
        setError('Microphone permission was denied.');
        return false;
      }

      setError('Could not start microphone capture.');
      return false;
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return {
    level,
    isListening,
    error,
    start,
    stop,
  };
}
