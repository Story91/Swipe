"use client";

import React, { useState } from 'react';
import { useAdminRequest } from '@/lib/auth/useAdminRequest';
import { useActiveChain } from '@/lib/chains/activeChain';

/**
 * Manual controls for the weekly routine, running the same code the crons
 * run. Preview is a dry run: it selects, prices and plans but signs nothing.
 * The live buttons send real transactions with the registrar key on the
 * server, so they sit behind the same signed-header check as every admin
 * write.
 */

type RoutineAction = 'create' | 'resolve';

interface RunState {
  action: RoutineAction;
  dryRun: boolean;
  body: unknown;
  error?: string;
}

const PATHS: Record<RoutineAction, string> = {
  create: '/api/cron/create-weekly-markets',
  resolve: '/api/cron/resolve-expired-markets',
};

export function RoutineCard() {
  const { chainKey, chain } = useActiveChain();
  const signAdminRequest = useAdminRequest();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<RunState | null>(null);

  async function run(action: RoutineAction, dryRun: boolean) {
    setBusy(true);
    try {
      const headers = await signAdminRequest('routine');
      const response = await fetch(PATHS[action], {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ chain: chainKey, dryRun }),
      });
      const body = await response.json();
      setLast({
        action,
        dryRun,
        body,
        error: response.ok ? undefined : (body?.error ?? `HTTP ${response.status}`),
      });
    } catch (error) {
      setLast({
        action,
        dryRun,
        body: null,
        error: error instanceof Error ? error.message : 'Request failed',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="adm-question">Weekly routine</h2>
      <p className="adm-toolbar-note">
        Runs against {chain.label}. Preview plans without signing anything, the
        live buttons register and resolve with the operational key on the
        server.
      </p>
      <div className="adm-toolbar">
        <button type="button" className="sheet-action" disabled={busy} onClick={() => run('create', true)}>
          Preview batch
        </button>
        <button type="button" className="sheet-action" disabled={busy} onClick={() => run('create', false)}>
          Create batch
        </button>
        <button type="button" className="sheet-action" disabled={busy} onClick={() => run('resolve', true)}>
          Preview resolutions
        </button>
        <button type="button" className="sheet-action" disabled={busy} onClick={() => run('resolve', false)}>
          Resolve now
        </button>
      </div>
      {last && (
        <div className={`adm-notice${last.error ? ' adm-notice--bad' : ''}`} role="status">
          <p>
            {last.action === 'create' ? 'Create' : 'Resolve'}
            {last.dryRun ? ' preview' : ' live run'}
            {last.error ? ` failed: ${last.error}` : ' finished.'}
          </p>
          {last.body != null && (
            <pre style={{ overflowX: 'auto', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(last.body, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
