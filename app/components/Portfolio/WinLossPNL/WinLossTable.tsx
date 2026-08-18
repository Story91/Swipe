"use client";

import React from 'react';
import type { PnlPrediction } from './pnlTotals';
import { recordOn, outcomeOf, PNL_TOKENS } from './pnlTotals';
import './WinLossPNL.css';

interface WinLossTableProps {
  allUserPredictions: PnlPrediction[];
}

/**
 * The settled markets, split into the ones that came in and the ones that did
 * not.
 *
 * Nothing renders this today, and it stayed on the two archived tokens while
 * every current bet moved to the chain's stablecoin. It reads the collateral
 * leg through the same helpers as the P&L card rather than keeping a second
 * opinion about which markets a user won.
 */
export function WinLossTable({ allUserPredictions }: WinLossTableProps) {
  // A market can be settled on the collateral contract and still open on the
  // archived one, so the filter is per token rather than one status field for
  // the whole row.
  const wins = allUserPredictions.filter((p) => recordOn(p).won);
  const losses = allUserPredictions.filter((p) => recordOn(p).lost);

  const formatQuestion = (question: string) => {
    if (question.length > 60) {
      return question.substring(0, 60) + '...';
    }
    return question;
  };

  /** The side that won, taken from whichever contract has called it. */
  const settledSide = (prediction: PnlPrediction) => {
    for (const token of PNL_TOKENS) {
      const outcome = outcomeOf(prediction, token);
      if (outcome !== undefined) return outcome ? 'YES' : 'NO';
    }
    return '';
  };

  return (
    <div className="win-loss-container">
      <h3 className="win-loss-title">Wins and losses</h3>

      <div className="win-loss-tables-wrapper">
        {/* Wins Table */}
        <div className="win-loss-table-wrapper win-table-wrapper">
          <div className="win-loss-table-header win-header">
            <span className="win-loss-icon">✅</span>
            <span className="win-loss-count neon-green">{wins.length} WINS</span>
          </div>
          <div className="win-loss-table-scroll">
            {wins.length > 0 ? (
              <table className="win-loss-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {wins.map((prediction) => (
                    <tr key={prediction.id} className="win-row">
                      <td className="win-loss-question">{formatQuestion(prediction.question)}</td>
                      <td className="win-loss-outcome">
                        <span className="neon-green-text">{settledSide(prediction)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="win-loss-empty">No wins yet</div>
            )}
          </div>
        </div>

        {/* Losses Table */}
        <div className="win-loss-table-wrapper loss-table-wrapper">
          <div className="win-loss-table-header loss-header">
            <span className="win-loss-icon">❌</span>
            <span className="win-loss-count neon-red">{losses.length} LOSSES</span>
          </div>
          <div className="win-loss-table-scroll">
            {losses.length > 0 ? (
              <table className="win-loss-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {losses.map((prediction) => (
                    <tr key={prediction.id} className="loss-row">
                      <td className="win-loss-question">{formatQuestion(prediction.question)}</td>
                      <td className="win-loss-outcome">
                        <span className="neon-red-text">{settledSide(prediction)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="win-loss-empty">No losses yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
