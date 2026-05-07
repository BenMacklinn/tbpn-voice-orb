import { useCallback, useEffect, useRef, useState } from 'react';

const XAI_REALTIME_URL =
  'wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0';
const TARGET_SAMPLE_RATE = 24_000;

export type GrokVoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking';

type AudioContextConstructor = typeof AudioContext;

type WebAudioWindow = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

type RealtimeTokenResponse = {
  value?: string;
  error?: string;
};

type XaiRealtimeEvent = {
  type: string;
  delta?: string;
  transcript?: string;
  error?: {
    message?: string;
  };
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function float32ToBase64Pcm16(float32Array: Float32Array) {
  const pcm16 = new Int16Array(float32Array.length);

  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return bytesToBase64(new Uint8Array(pcm16.buffer));
}

function base64Pcm16ToFloat32(base64Audio: string) {
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);

  for (let index = 0; index < pcm16.length; index += 1) {
    float32[index] = pcm16[index] / 32768;
  }

  return float32;
}

function calculateLevel(samples: ArrayLike<number>) {
  let sum = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    sum += sample * sample;
  }

  return Math.min(1, Math.sqrt(sum / samples.length) * 4.5);
}

function calculateLevelFromAnalyser(
  analyser: AnalyserNode,
  samples: Float32Array<ArrayBuffer>,
) {
  analyser.getFloatTimeDomainData(samples);
  return Math.min(1, calculateLevel(samples) * 1.35);
}

async function createRealtimeToken() {
  const response = await fetch('/api/xai/realtime-token', {
    method: 'POST',
  });
  const data = (await response.json()) as RealtimeTokenResponse;

  if (!response.ok || typeof data.value !== 'string') {
    throw new Error(data.error || 'Could not start Grok voice.');
  }

  return data.value;
}

export function useGrokVoice() {
  const [phase, setPhase] = useState<GrokVoicePhase>('idle');
  const [level, setLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantTranscript, setAssistantTranscript] = useState('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputAnimationFrameRef = useRef<number | null>(null);
  const inputSamplesRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputSamplesRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const audioInputNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackTimeRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);
  const outputAnimationFrameRef = useRef<number | null>(null);
  const sampleRateRef = useRef(TARGET_SAMPLE_RATE);
  const smoothedLevelRef = useRef(0);
  const smoothedOutputLevelRef = useRef(0);
  const stopRequestedRef = useRef(false);

  const stopInputMeter = useCallback(() => {
    if (inputAnimationFrameRef.current !== null) {
      cancelAnimationFrame(inputAnimationFrameRef.current);
      inputAnimationFrameRef.current = null;
    }

    smoothedLevelRef.current = 0;
    setLevel(0);
  }, []);

  const startInputMeter = useCallback(() => {
    if (inputAnimationFrameRef.current !== null) {
      return;
    }

    const animateInputLevel = () => {
      const analyser = inputAnalyserRef.current;
      const samples = inputSamplesRef.current;

      if (!analyser || !samples) {
        stopInputMeter();
        return;
      }

      const nextLevel = calculateLevelFromAnalyser(analyser, samples);
      smoothedLevelRef.current =
        smoothedLevelRef.current * 0.84 + nextLevel * 0.16;
      setLevel(smoothedLevelRef.current);
      inputAnimationFrameRef.current = requestAnimationFrame(animateInputLevel);
    };

    inputAnimationFrameRef.current = requestAnimationFrame(animateInputLevel);
  }, [stopInputMeter]);

  const stopOutputMeter = useCallback(() => {
    if (outputAnimationFrameRef.current !== null) {
      cancelAnimationFrame(outputAnimationFrameRef.current);
      outputAnimationFrameRef.current = null;
    }

    smoothedOutputLevelRef.current = 0;
    setOutputLevel(0);
  }, []);

  const startOutputMeter = useCallback(() => {
    if (outputAnimationFrameRef.current !== null) {
      return;
    }

    const animateOutputLevel = () => {
      const audioContext = audioContextRef.current;
      if (!audioContext) {
        stopOutputMeter();
        return;
      }

      const analyser = outputAnalyserRef.current;
      const samples = outputSamplesRef.current;
      const nextLevel = analyser && samples ? calculateLevelFromAnalyser(analyser, samples) : 0;
      smoothedOutputLevelRef.current =
        smoothedOutputLevelRef.current * 0.78 + nextLevel * 0.22;
      setOutputLevel(smoothedOutputLevelRef.current);

      if (playbackSourcesRef.current.size > 0 || smoothedOutputLevelRef.current > 0.01) {
        outputAnimationFrameRef.current = requestAnimationFrame(animateOutputLevel);
      } else {
        outputAnimationFrameRef.current = null;
        setOutputLevel(0);
      }
    };

    outputAnimationFrameRef.current = requestAnimationFrame(animateOutputLevel);
  }, [stopOutputMeter]);

  const clearPlayback = useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }

    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // The source may already be stopped by the time barge-in arrives.
      }
      source.disconnect();
    }

    playbackSourcesRef.current.clear();
    playbackTimeRef.current = audioContextRef.current?.currentTime ?? 0;
    stopOutputMeter();
  }, [stopOutputMeter]);

  const scheduleListeningAfterPlayback = useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current);
    }

    const audioContext = audioContextRef.current;
    const delayMs = audioContext
      ? Math.max(0, (playbackTimeRef.current - audioContext.currentTime) * 1000)
      : 0;

    playbackTimerRef.current = window.setTimeout(() => {
      if (!stopRequestedRef.current && websocketRef.current?.readyState === WebSocket.OPEN) {
        setPhase('listening');
      }
    }, delayMs + 120);
  }, []);

  const playAudioDelta = useCallback((base64Audio: string) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      return;
    }

    const samples = base64Pcm16ToFloat32(base64Audio);
    const audioBuffer = audioContext.createBuffer(
      1,
      samples.length,
      sampleRateRef.current,
    );
    audioBuffer.copyToChannel(samples, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputAnalyserRef.current ?? audioContext.destination);

    const startAt = Math.max(audioContext.currentTime, playbackTimeRef.current);
    const endAt = startAt + audioBuffer.duration;
    source.start(startAt);
    playbackTimeRef.current = endAt;
    startOutputMeter();
    playbackSourcesRef.current.add(source);
    source.onended = () => {
      playbackSourcesRef.current.delete(source);
    };
  }, [startOutputMeter]);

  const handleRealtimeEvent = useCallback(
    (event: XaiRealtimeEvent) => {
      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          clearPlayback();
          setPhase('listening');
          break;
        case 'input_audio_buffer.speech_stopped':
        case 'input_audio_buffer.committed':
          setPhase('processing');
          break;
        case 'response.created':
          setAssistantTranscript('');
          setPhase('processing');
          break;
        case 'response.output_audio.delta':
          if (event.delta) {
            setPhase('speaking');
            playAudioDelta(event.delta);
          }
          break;
        case 'response.output_audio_transcript.delta':
          if (event.delta) {
            setAssistantTranscript((current) => `${current}${event.delta}`);
          }
          break;
        case 'response.done':
          scheduleListeningAfterPlayback();
          break;
        case 'error':
          setError(event.error?.message || 'Grok voice returned an error.');
          break;
        default:
          break;
      }
    },
    [clearPlayback, playAudioDelta, scheduleListeningAfterPlayback],
  );

  const cleanupSession = useCallback(() => {
    const websocket = websocketRef.current;
    websocketRef.current = null;
    if (
      websocket &&
      websocket.readyState !== WebSocket.CLOSED &&
      websocket.readyState !== WebSocket.CLOSING
    ) {
      websocket.close();
    }

    audioInputNodeRef.current?.disconnect();
    inputAnalyserRef.current?.disconnect();
    inputSourceRef.current?.disconnect();
    outputAnalyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }

    clearPlayback();
    stopInputMeter();
    inputAnalyserRef.current = null;
    inputSamplesRef.current = null;
    audioInputNodeRef.current = null;
    inputSourceRef.current = null;
    outputAnalyserRef.current = null;
    outputSamplesRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
    smoothedLevelRef.current = 0;
    stopOutputMeter();
  }, [clearPlayback, stopInputMeter, stopOutputMeter]);

  const startAudioCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone capture.');
    }

    const AudioContextClass =
      window.AudioContext || (window as WebAudioWindow).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error('This browser does not support the Web Audio API.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const audioContext = new AudioContextClass({
      sampleRate: TARGET_SAMPLE_RATE,
    });
    const inputSource = audioContext.createMediaStreamSource(stream);
    const inputAnalyser = audioContext.createAnalyser();
    const outputAnalyser = audioContext.createAnalyser();
    await audioContext.audioWorklet.addModule('/audio-worklets/pcm-stream-processor.js');
    const audioInputNode = new AudioWorkletNode(audioContext, 'pcm-stream-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    inputAnalyser.fftSize = 1024;
    inputAnalyser.smoothingTimeConstant = 0.82;
    outputAnalyser.fftSize = 1024;
    outputAnalyser.smoothingTimeConstant = 0.68;
    outputAnalyser.connect(audioContext.destination);
    sampleRateRef.current = audioContext.sampleRate;
    playbackTimeRef.current = audioContext.currentTime;

    audioInputNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const websocket = websocketRef.current;
      if (websocket?.readyState === WebSocket.OPEN) {
        websocket.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: float32ToBase64Pcm16(event.data),
          }),
        );
      }
    };

    inputSource.connect(inputAnalyser);
    inputSource.connect(audioInputNode);
    audioInputNode.connect(audioContext.destination);
    await audioContext.resume();

    streamRef.current = stream;
    audioContextRef.current = audioContext;
    inputAnalyserRef.current = inputAnalyser;
    inputSamplesRef.current = new Float32Array(inputAnalyser.fftSize);
    inputSourceRef.current = inputSource;
    outputAnalyserRef.current = outputAnalyser;
    outputSamplesRef.current = new Float32Array(outputAnalyser.fftSize);
    audioInputNodeRef.current = audioInputNode;
    startInputMeter();
  }, [startInputMeter]);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    cleanupSession();
    setIsActive(false);
    setPhase('idle');
  }, [cleanupSession]);

  const start = useCallback(async () => {
    if (isActive) {
      return true;
    }

    setAssistantTranscript('');
    setError(null);
    setIsActive(true);
    setPhase('connecting');
    stopRequestedRef.current = false;

    try {
      const [token] = await Promise.all([createRealtimeToken(), startAudioCapture()]);

      if (stopRequestedRef.current) {
        cleanupSession();
        return false;
      }

      const websocket = new WebSocket(XAI_REALTIME_URL, [
        `xai-client-secret.${token}`,
      ]);
      websocketRef.current = websocket;

      websocket.onopen = () => {
        websocket.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              instructions:
                'You are a concise, conversational voice assistant. Keep spoken replies brief unless the user asks for detail.',
              voice: 'leo',
              turn_detection: {
                type: 'server_vad',
              },
              audio: {
                input: {
                  format: {
                    type: 'audio/pcm',
                    rate: sampleRateRef.current,
                  },
                },
                output: {
                  format: {
                    type: 'audio/pcm',
                    rate: sampleRateRef.current,
                  },
                },
              },
            },
          }),
        );
        setPhase('listening');
      };

      websocket.onmessage = (message) => {
        const event = JSON.parse(String(message.data)) as XaiRealtimeEvent;
        handleRealtimeEvent(event);
      };

      websocket.onerror = () => {
        setError('Grok voice connection failed.');
      };

      websocket.onclose = () => {
        if (!stopRequestedRef.current) {
          cleanupSession();
          setIsActive(false);
          setPhase('idle');
          setError('Grok voice disconnected.');
        }
      };

      return true;
    } catch (startError) {
      cleanupSession();
      setIsActive(false);
      setPhase('idle');

      if (startError instanceof DOMException && startError.name === 'NotAllowedError') {
        setError('Microphone permission was denied.');
      } else if (startError instanceof Error) {
        setError(startError.message);
      } else {
        setError('Could not start Grok voice.');
      }

      return false;
    }
  }, [cleanupSession, handleRealtimeEvent, isActive, startAudioCapture]);

  useEffect(() => () => cleanupSession(), [cleanupSession]);

  return {
    assistantTranscript,
    error,
    isActive,
    level,
    outputLevel,
    phase,
    start,
    stop,
  };
}
