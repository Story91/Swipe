import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * The guard that stops a live market being deleted.
 *
 * Declining is a Redis delete, which is the right shape for a proposal: it has
 * no pool, no positions and nothing on chain. It is exactly the wrong shape for
 * a market. A registered market holds real money, and deleting its record would
 * leave that money on a contract with nothing in the app able to find it, no
 * card, no claim button, no way back except reading the chain by hand.
 *
 * The two states are not distinguishable from Redis alone. Nothing in this
 * codebase clears `needsApproval`, so a record can carry it long after the
 * market it names was registered. That is why the route asks the chain, and why
 * it refuses when the chain will not answer rather than assuming the safe
 * reading of silence.
 *
 * Source-scanned, following claimPath.test.ts and historySurvives.test.ts:
 * the property is the presence of a refusal and the absence of a fallthrough,
 * and no unit test of a function catches either coming back.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = readFileSync(path.join(HERE, 'route.ts'), 'utf8');
const body = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('declining a proposal', () => {
  it('asks the chain whether the market exists before deleting anything', () => {
    expect(body).toMatch(/functionName:\s*'getPrediction'/);
    // The read has to come first. A delete above it would already have happened
    // by the time the answer arrived.
    expect(body.indexOf("'getPrediction'")).toBeLessThan(body.indexOf('deletePrediction'));
  });

  it('refuses when the market is registered', () => {
    expect(body).toMatch(/if\s*\(Boolean\(onChain\[0\]\)\)/);
    expect(body).toMatch(/409/);
  });

  it('refuses when the chain cannot be reached, rather than assuming', () => {
    // Silence is not a no. A node that times out must not be read as "this
    // market does not exist", which is the reading that deletes it.
    //
    // The property is an ordering: the failure path returns before the delete
    // is reached. Matching on a window of characters after the catch instead
    // just measures how long the file is.
    expect(body.includes('catch (error)')).toBe(true);
    const unreachable = body.indexOf('503');
    expect(unreachable).toBeGreaterThan(-1);
    expect(unreachable).toBeLessThan(body.indexOf('deletePrediction'));
  });

  it('only ever touches something still marked as waiting for review', () => {
    expect(body).toMatch(/!record\.needsApproval\s*\|\|\s*record\.approved/);
  });

  it('only ever touches the current contract generation', () => {
    expect(body).toMatch(/ref\.generation !== CURRENT_GENERATION/);
  });

  it('is behind the admin signature check', () => {
    expect(body).toMatch(/requireAdmin\(request, 'decline'\)/);
    // And the check has to gate everything, not sit under the work.
    expect(body.indexOf('requireAdmin')).toBeLessThan(body.indexOf('deletePrediction'));
  });

  it('does not clear the pending flag and save, which would publish it', () => {
    // savePrediction files a record by its own fields: an unresolved record
    // with a future deadline and no pending flag lands in the ACTIVE set, which
    // would put a declined proposal into the live feed as a bettable market.
    expect(body).not.toMatch(/savePrediction/);
  });
});
