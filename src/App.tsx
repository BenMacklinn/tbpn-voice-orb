import { useEffect, useMemo, useState } from 'react';
import { VoiceOrb, type OrbState } from './components/VoiceOrb';
import { type GrokVoicePhase, useGrokVoice } from './hooks/useGrokVoice';

const stateOptions: Array<{
  id: OrbState;
  label: string;
}> = [
  {
    id: 'idle',
    label: 'Idle',
  },
  {
    id: 'listening',
    label: 'Listening',
  },
  {
    id: 'processing',
    label: 'Processing',
  },
  {
    id: 'speaking',
    label: 'Speaking',
  },
];

const phaseLabels: Record<GrokVoicePhase, string> = {
  idle: 'Ready',
  connecting: 'Connecting…',
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
};

const phaseToOrbState: Record<GrokVoicePhase, OrbState> = {
  idle: 'idle',
  connecting: 'processing',
  listening: 'listening',
  processing: 'processing',
  speaking: 'speaking',
};

function App() {
  const [demoOrbState, setDemoOrbState] = useState<OrbState>('idle');
  const [demoLevel, setDemoLevel] = useState(0);
  const grokVoice = useGrokVoice();
  const orbState = grokVoice.isActive ? phaseToOrbState[grokVoice.phase] : demoOrbState;

  useEffect(() => {
    if (grokVoice.isActive && orbState === 'speaking') {
      setDemoLevel(0);
      return;
    }

    if (orbState !== 'speaking' && orbState !== 'processing') {
      setDemoLevel(0);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const animateDemoLevel = (time: number) => {
      const elapsed = (time - startedAt) / 1000;
      const speechCadence =
        0.42 +
        Math.sin(elapsed * 7.5) * 0.16 +
        Math.sin(elapsed * 13.25) * 0.08;
      const thinkingCadence = 0.2 + Math.sin(elapsed * 2.4) * 0.05;

      setDemoLevel(orbState === 'speaking' ? speechCadence : thinkingCadence);
      frame = requestAnimationFrame(animateDemoLevel);
    };

    frame = requestAnimationFrame(animateDemoLevel);
    return () => cancelAnimationFrame(frame);
  }, [grokVoice.isActive, orbState]);

  const orbLevel = useMemo(() => {
    if (orbState === 'listening') {
      return grokVoice.isActive ? grokVoice.level : 0.18;
    }

    if (grokVoice.isActive && orbState === 'speaking') {
      return grokVoice.outputLevel;
    }

    if (orbState === 'speaking' || orbState === 'processing') {
      return Math.max(grokVoice.level * 0.65, demoLevel);
    }

    return grokVoice.level * 0.2;
  }, [demoLevel, grokVoice.isActive, grokVoice.level, grokVoice.outputLevel, orbState]);

  const handleVoiceToggle = async () => {
    if (grokVoice.isActive) {
      grokVoice.stop();
      return;
    }

    await grokVoice.start();
  };

  const handleStateChange = (nextState: OrbState) => {
    setDemoOrbState(nextState);
  };

  return (
    <main className="app-shell">
      <div className="studio-backdrop" />
      <VoiceOrb state={orbState} level={orbLevel} micActive={grokVoice.isActive} />

      <section className="control-panel" aria-label="Voice orb controls">
        {grokVoice.error ? <p className="error-message">{grokVoice.error}</p> : null}

        <div className="state-grid">
          {stateOptions.map((option) => (
            <button
              className={option.id === orbState ? 'state-card is-active' : 'state-card'}
              disabled={grokVoice.isActive}
              key={option.id}
              type="button"
              onClick={() => handleStateChange(option.id)}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        <button
          className={grokVoice.isActive ? 'mic-button is-active' : 'mic-button'}
          type="button"
          onClick={handleVoiceToggle}
        >
          {grokVoice.isActive ? 'Stop Orb' : 'Start Orb'}
        </button>

        <div className="voice-status" aria-live="polite">
          <span>{phaseLabels[grokVoice.phase]}</span>
          <p>
            {grokVoice.assistantTranscript ||
              'Tap Start Orb, allow the mic, then speak.'}
          </p>
        </div>

        <div
          className="level-meter"
          aria-label={`Microphone level ${Math.round(grokVoice.level * 100)}%`}
        >
          <span style={{ transform: `scaleX(${Math.max(0.04, grokVoice.level)})` }} />
        </div>
      </section>
    </main>
  );
}

export default App;
