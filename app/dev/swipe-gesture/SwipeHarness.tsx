'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSwipeGesture, type SwipeDir } from '@/lib/hooks/useSwipeGesture';
import './harness.css';

/**
 * Development harness for the swipe gesture.
 *
 * Exists so the ported physics can be judged against
 * docs/v3/prototypes/swipe-gesture.html side by side, on a real device, before
 * any of it goes near TinderCard.tsx and the money path.
 *
 * Deliberately has no market data, no wallet and no contract: if a bug shows up
 * here it is a gesture bug.
 */

type LogLine = { id: number; text: string };

let logId = 0;

const WIDTHS = [330, 308, 280, 260];

function Card({
  width,
  twoStage,
  onLog,
}: {
  width: number;
  twoStage: boolean;
  onLog: (text: string) => void;
}) {
  const g = useSwipeGesture({
    twoStage,
    onArm: dir => onLog(`arm ${dir}`),
    onCancel: () => onLog('cancel'),
    onCommit: dir => onLog(`COMMIT ${dir}`),
    onExit: dir => onLog(`exit ${dir} (recycle here)`),
    onThresholdCross: dir => onLog(dir ? `cross ${dir}` : 'cross none'),
  });

  return (
    <div className="hz-stage" style={{ width, height: width * 1.45 }}>
      <motion.div
        ref={g.wrapperRef}
        className="hz-wrapper"
        style={{ transform: g.transform }}
        {...g.handlers}
      >
        <div ref={g.cardRef} className="hz-card">
          <motion.div className="hz-tint hz-tint--yes" style={{ opacity: g.tintYes }} />
          <motion.div className="hz-tint hz-tint--no" style={{ opacity: g.tintNo }} />

          <div className="hz-card-body">
            <span className="hz-card-w">{width}px</span>
            {g.stage === 'armed' && g.armedDir && (
              <span className={`hz-armed hz-armed--${g.armedDir}`}>
                Armed · {g.armedDir === 'right' ? 'YES' : 'NO'}
              </span>
            )}
            {g.stage === 'neutral' && <span className="hz-hint">Drag me</span>}
            {g.stage === 'committed' && <span className="hz-hint">Committed</span>}
          </div>
        </div>
      </motion.div>

      <div className="hz-buttons">
        <button type="button" onClick={() => (twoStage ? g.arm('left') : g.commit())}>
          {twoStage ? 'Arm NO' : 'Swipe NO'}
        </button>
        <button type="button" onClick={() => g.restore()}>
          Restore
        </button>
        <button type="button" onClick={() => (twoStage ? g.arm('right') : g.commit())}>
          {twoStage ? 'Arm YES' : 'Swipe YES'}
        </button>
      </div>

      {twoStage && g.stage === 'armed' && (
        <div className="hz-buttons">
          <button type="button" onClick={() => g.cancel()}>
            Cancel
          </button>
          <button type="button" onClick={() => g.commit()}>
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

export function SwipeHarness() {
  const [twoStage, setTwoStage] = useState(true);
  const [log, setLog] = useState<LogLine[]>([]);

  const onLog = (text: string) =>
    setLog(prev => [{ id: logId++, text }, ...prev].slice(0, 40));

  return (
    <div className="hz">
      <header className="hz-head">
        <h1>Swipe gesture harness</h1>
        <p>
          Compare against{' '}
          <code>docs/v3/prototypes/swipe-gesture.html</code> side by side. No
          market data, no wallet, no contract: anything wrong here is the
          gesture.
        </p>
        <div className="hz-controls">
          <label>
            <input
              type="checkbox"
              checked={twoStage}
              onChange={e => setTwoStage(e.target.checked)}
            />
            Two-stage (arm, then commit)
          </label>
          <button type="button" onClick={() => setLog([])}>
            Clear log
          </button>
        </div>
        <p className="hz-note">
          Things worth checking by hand: catching a card mid-flight does not make
          it jump; a fast flick over a short distance still arms; pulling back to
          cancel stays 1:1 while pushing out to commit meets resistance; and an
          armed card is not swallowed by the container at 280px and below.
        </p>
      </header>

      <div className="hz-row">
        {WIDTHS.map(w => (
          <Card key={`${w}-${twoStage}`} width={w} twoStage={twoStage} onLog={onLog} />
        ))}
      </div>

      <section className="hz-log">
        <h2>Releases</h2>
        {log.length === 0 ? (
          <p className="hz-note">Nothing yet.</p>
        ) : (
          <ol>
            {log.map(l => (
              <li key={l.id}>{l.text}</li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
