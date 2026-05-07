import { useEffect, useRef, useState, type CSSProperties } from 'react';
import tGraphicSrc from '../../t-graphic.png';

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

type VoiceOrbProps = {
  state: OrbState;
  level: number;
  micActive: boolean;
};

const stateLabels: Record<OrbState, string> = {
  idle: 'Passive signal',
  listening: 'Listening live',
  processing: 'Compute lock',
  speaking: 'Broadcast reply',
};

const particles = Array.from({ length: 18 }, (_, index) => index);
const waveformBars = Array.from({ length: 16 }, (_, index) => index);

export function VoiceOrb({ state, level, micActive }: VoiceOrbProps) {
  const previousStateRef = useRef(state);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const normalizedLevel = Math.min(1, Math.max(0, level));
  const visualLevel =
    state === 'listening'
      ? normalizedLevel
      : state === 'speaking'
        ? Math.max(normalizedLevel, 0.14)
        : state === 'processing'
          ? 0.28
          : 0.08;

  const stateEnergy = {
    idle: 0.2,
    listening: 0.78,
    processing: 0.48,
    speaking: 0.68,
  }[state];
  const ripple = visualLevel * 0.9 + stateEnergy * 0.25;
  const glow = 0.35 + visualLevel * 0.8 + stateEnergy * 0.25;
  const scale = 1 + visualLevel * (state === 'listening' ? 0.2 : state === 'speaking' ? 0.15 : 0.12);

  const orbStyle = {
    '--orb-level': visualLevel.toFixed(3),
    '--orb-scale': scale.toFixed(3),
    '--orb-breathe-scale': (scale * 1.035).toFixed(3),
    '--orb-listen-scale': (scale + visualLevel * 0.08).toFixed(3),
    '--orb-surface-scale': (1 + visualLevel * 0.09).toFixed(3),
    '--orb-processing-low': (scale * 0.96).toFixed(3),
    '--orb-processing-high': (scale * 1.02).toFixed(3),
    '--orb-speaking-scale': (scale * (1.01 + visualLevel * 0.045)).toFixed(3),
    '--orb-speaking-y': `${(-5 - visualLevel * 10).toFixed(1)}px`,
    '--orb-listen-y-start': `${(visualLevel * -10).toFixed(1)}px`,
    '--orb-listen-y-end': `${(visualLevel * -22).toFixed(1)}px`,
    '--orb-float-y': `${(visualLevel * -18).toFixed(1)}px`,
    '--orb-glow': glow.toFixed(3),
    '--orb-ripple': ripple.toFixed(3),
    '--grid-opacity': (0.18 + glow * 0.2).toFixed(3),
    '--shadow-scale': (0.9 + visualLevel * 0.3).toFixed(3),
    '--ring-one': `${(44 + ripple * 18).toFixed(1)}%`,
    '--ring-two': `${(58 + ripple * 18).toFixed(1)}%`,
    '--ring-three': `${(72 + ripple * 16).toFixed(1)}%`,
    '--ring-opacity': (0.12 + ripple * 0.4).toFixed(3),
    '--ring-start-opacity': (0.28 + ripple * 0.25).toFixed(3),
    '--ripple-end-scale': (1.12 + ripple * 0.35).toFixed(3),
    '--particle-size': `${(4 + ripple * 7).toFixed(1)}px`,
    '--particle-radius': `${(148 + ripple * 68).toFixed(1)}px`,
    '--particle-opacity': (0.16 + ripple * 0.62).toFixed(3),
    '--core-shadow-size': `${(36 + glow * 42).toFixed(1)}px`,
    '--aurora-opacity': (0.62 + visualLevel * 0.28).toFixed(3),
    '--wave-opacity': (0.28 + visualLevel * 0.58).toFixed(3),
    '--bar-height': `${(10 + visualLevel * 44).toFixed(1)}px`,
    '--bar-low-scale': (0.35 + visualLevel * 0.55).toFixed(3),
    '--bar-mid-scale': (0.35 + visualLevel).toFixed(3),
    '--bar-high-scale': (0.8 + visualLevel * 1.25).toFixed(3),
  } as CSSProperties;

  useEffect(() => {
    if (previousStateRef.current === state) {
      return;
    }

    previousStateRef.current = state;
    setIsTransitioning(true);
    const transitionTimer = window.setTimeout(() => {
      setIsTransitioning(false);
    }, 340);

    return () => window.clearTimeout(transitionTimer);
  }, [state]);

  return (
    <section
      className={`voice-orb state-${state}${isTransitioning ? ' is-transitioning' : ''}`}
      style={orbStyle}
      aria-label={`Voice orb is ${stateLabels[state].toLowerCase()}`}
    >
      <div className="orb-scene" aria-hidden="true">
        <div className="ambient-grid" />
        <div className="orb-shadow" />

        <div className="orb-rings">
          <span />
          <span />
          <span />
        </div>

        <div className="particle-field">
          {particles.map((particle) => (
            <span
              key={particle}
              style={
                {
                  '--particle-angle': `${particle * 20}deg`,
                  '--particle-index': particle,
                  '--particle-delay': `${particle * -0.18}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <div className="orb-core">
          <div className="orb-aurora" />
          <div className="orb-surface" />
          <img className="orb-mark" src={tGraphicSrc} alt="" />
          <div className="orb-highlight" />
          <div className="orb-waveform">
            {waveformBars.map((bar) => (
              <span
                key={bar}
                style={
                  {
                    '--bar-index': bar,
                    '--bar-delay': `${bar * -0.07}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">
        {micActive ? `Mic level ${Math.round(normalizedLevel * 100)}%` : 'Mic paused'}
      </span>
    </section>
  );
}
