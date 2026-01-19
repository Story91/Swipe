"use client";

import React from 'react';
import './WinLossPNL.css';

interface PredictionWithStakes {
  id: string;
  question: string;
  resolved: boolean;
  outcome?: boolean;
  userStakes?: {
    ETH?: {
      isWinner: boolean;
      potentialProfit: number;
    };
    SWIPE?: {
      isWinner: boolean;
      potentialProfit: number;
    };
  };
  status: 'active' | 'resolved' | 'expired' | 'cancelled';
}

interface WinLossTableProps {
  allUserPredictions: PredictionWithStakes[];
}

export function WinLossTable({ allUserPredictions }: WinLossTableProps) {
  // Filter only resolved predictions
  const resolvedPredictions = allUserPredictions.filter(p => p.status === 'resolved');

  // Separate wins and losses
  const wins = resolvedPredictions.filter(p => {
    const ethStake = p.userStakes?.ETH;
    const swipeStake = p.userStakes?.SWIPE;
    return (ethStake?.isWinner) || (swipeStake?.isWinner);
  });

  const losses = resolvedPredictions.filter(p => {
    const ethStake = p.userStakes?.ETH;
    const swipeStake = p.userStakes?.SWIPE;
    const ethLost = ethStake && !ethStake.isWinner && (ethStake.potentialProfit || 0) < 0;
    const swipeLost = swipeStake && !swipeStake.isWinner && (swipeStake.potentialProfit || 0) < 0;
    return (ethLost || swipeLost) && p.status === 'resolved';
  });

  const formatQuestion = (question: string) => {
    if (question.length > 60) {
      return question.substring(0, 60) + '...';
    }
    return question;
  };

  return (
    <div className="win-loss-container">
      <h3 className="win-loss-title">Wins & Losses</h3>
      
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
                        <span className="neon-green-text">{prediction.outcome ? 'YES' : 'NO'}</span>
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
                        <span className="neon-red-text">{prediction.outcome ? 'YES' : 'NO'}</span>
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
