"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Preset = { name: string; edo: number; notes?: number };

const PRESETS: Preset[] = [
  { name: "12-EDO (standard)", edo: 12 },
  { name: "19-EDO", edo: 19 },
  { name: "31-EDO", edo: 31 },
  { name: "53-EDO", edo: 53 },
];

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function freqForStep(baseHz: number, step: number, edo: number) {
  // f(step) = base * 2^(step/edo)
  return baseHz * Math.pow(2, step / edo);
}

export default function Home() {
  // Tuning params
  const [baseHz, setBaseHz] = useState<number>(440);
  const [edo, setEdo] = useState<number>(12);
  const [noteCount, setNoteCount] = useState<number>(12);
  const [presetName, setPresetName] = useState<string>(PRESETS[0].name);

  // Audio state
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopFlagRef = useRef<boolean>(false);
  const playingRef = useRef<boolean>(false);

  // Keep noteCount within range when edo changes
  useEffect(() => {
    setNoteCount((n) => clampInt(n, 1, edo));
  }, [edo]);

  // Update preset selection if user manually changes edo away from preset
  useEffect(() => {
    const match = PRESETS.find((p) => p.edo === edo);
    setPresetName(match ? match.name : "Custom");
  }, [edo]);

  const freqs = useMemo(() => {
    const count = clampInt(noteCount, 1, edo);
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push(freqForStep(baseHz, i, edo));
    }
    return list;
  }, [baseHz, edo, noteCount]);

  function ensureAudioContext(): AudioContext {
    if (audioCtxRef.current) return audioCtxRef.current;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    return ctx;
  }

  async function stop() {
    stopFlagRef.current = true;
    playingRef.current = false;

    // Optional: suspend to silence immediately
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "running") {
      try {
        await ctx.suspend();
      } catch {
        // ignore
      }
    }
  }

  async function playScale() {
    if (playingRef.current) return;

    stopFlagRef.current = false;
    playingRef.current = true;

    const ctx = ensureAudioContext();

    // If previously suspended, resume
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Simple scheduling loop (sequential awaits)
    const noteMs = 240; // duration per note
    const gapMs = 30;   // tiny gap
    const attackMs = 8; // fade-in to avoid click
    const releaseMs = 25; // fade-out

    for (const f of freqs) {
      if (stopFlagRef.current) break;

      const now = ctx.currentTime;

      // Oscillator
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now);

      // Gain envelope
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);

      const attack = attackMs / 1000;
      const duration = noteMs / 1000;
      const release = releaseMs / 1000;

      gain.gain.exponentialRampToValueAtTime(0.2, now + attack);
      // Hold near the end, then ramp down
      gain.gain.setValueAtTime(0.2, now + Math.max(attack, duration - release));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.01);

      // Wait until note finishes + gap
      await new Promise((r) => setTimeout(r, noteMs + gapMs));

      // Cleanup
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    }

    playingRef.current = false;

    // If we stopped, keep it suspended (silent) until next Play
    if (stopFlagRef.current) {
      const ctx2 = audioCtxRef.current;
      if (ctx2 && ctx2.state === "running") {
        try {
          await ctx2.suspend();
        } catch {
          // ignore
        }
      }
    }
  }

  const header = `Microbe Music — Microtonal Scale Lab`;
  const sub = `Equal divisions of the octave (EDO). Frequency: f(n) = base × 2^(n/EDO).`;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>{header}</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>{sub}</p>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18 }}>
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>Tuning</h2>

          <label style={{ display: "block", marginBottom: 10 }}>
            Preset
            <select
              value={presetName}
              onChange={(e) => {
                const name = e.target.value;
                setPresetName(name);
                const p = PRESETS.find((x) => x.name === name);
                if (p) setEdo(p.edo);
              }}
              style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
            >
              {PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Base frequency (Hz) — A4
            <input
              type="number"
              min={50}
              max={2000}
              step={1}
              value={baseHz}
              onChange={(e) => setBaseHz(Number(e.target.value))}
              style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Divisions per octave (EDO)
            <input
              type="number"
              min={5}
              max={53}
              step={1}
              value={edo}
              onChange={(e) => setEdo(clampInt(Number(e.target.value), 5, 53))}
              style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Notes to play/display (1–{edo})
            <input
              type="number"
              min={1}
              max={edo}
              step={1}
              value={noteCount}
              onChange={(e) => setNoteCount(clampInt(Number(e.target.value), 1, edo))}
              style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              onClick={playScale}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.18)",
                cursor: "pointer",
              }}
            >
              Play scale
            </button>
            <button
              onClick={stop}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.18)",
                cursor: "pointer",
              }}
            >
              Stop
            </button>
          </div>

          <p style={{ marginTop: 14, fontSize: 13, opacity: 0.75 }}>
            Tip: audio only starts after a user gesture. If you hear clicks, we can lengthen the attack/release.
          </p>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>Scale</h2>
          <p style={{ marginTop: 0, opacity: 0.8 }}>
            {noteCount} notes from {baseHz.toFixed(2)} Hz in {edo}-EDO
          </p>

          <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "white" }}>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(0,0,0,0.1)" }}>Step</th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(0,0,0,0.1)" }}>Frequency (Hz)</th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(0,0,0,0.1)" }}>Cents</th>
                </tr>
              </thead>
              <tbody>
                {freqs.map((f, i) => {
                  const cents = (1200 * i) / edo;
                  return (
                    <tr key={i}>
                      <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{i}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{f.toFixed(3)}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{cents.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
            Next step: add non-EDO scales (just intonation ratios, custom cent lists) and a keyboard to audition intervals.
          </p>
        </div>
      </section>
    </main>
  );
}

