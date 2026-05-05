import { useEffect, useMemo, useState } from 'react';
import { VoiceOrb, type OrbState } from './components/VoiceOrb';
import { useAudioLevel } from './hooks/useAudioLevel';

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

function App() {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [demoLevel, setDemoLevel] = useState(0);
  const { level, isListening, error, start, stop } = useAudioLevel();

  useEffect(() => {
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
  }, [orbState]);

  const orbLevel = useMemo(() => {
    if (orbState === 'listening') {
      return isListening ? level : 0.18;
    }

    if (orbState === 'speaking' || orbState === 'processing') {
      return Math.max(level * 0.65, demoLevel);
    }

    return level * 0.2;
  }, [demoLevel, isListening, level, orbState]);

  const handleMicToggle = async () => {
    if (isListening) {
      stop();
      if (orbState === 'listening') {
        setOrbState('idle');
      }
      return;
    }

    const didStart = await start();
    if (didStart) {
      setOrbState('listening');
    }
  };

  const handleStateChange = (nextState: OrbState) => {
    setOrbState(nextState);
  };

  return (
    <main className="app-shell">
      <div className="studio-backdrop" />
      <VoiceOrb state={orbState} level={orbLevel} micActive={isListening} />

      <section className="control-panel" aria-label="Voice orb controls">
        {error ? <p className="error-message">{error}</p> : null}

        <div className="state-grid">
          {stateOptions.map((option) => (
            <button
              className={option.id === orbState ? 'state-card is-active' : 'state-card'}
              key={option.id}
              type="button"
              onClick={() => handleStateChange(option.id)}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        <button className="mic-button" type="button" onClick={handleMicToggle}>
          {isListening ? 'Stop mic' : 'Start mic'}
        </button>

        <div className="level-meter" aria-label={`Microphone level ${Math.round(level * 100)}%`}>
          <span style={{ transform: `scaleX(${Math.max(0.04, level)})` }} />
        </div>
      </section>
    </main>
  );
}

export default App;
