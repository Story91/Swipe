"use client";

import React, { useState } from 'react';
import './ClaimsDashboard.css';

interface ClaimData {
  userId: string;
  stakeAmount: number;
  yesAmount: number;
  noAmount: number;
}

interface ClaimsResult {
  predictionId: string;
  totalStakes: number;
  claimed: ClaimData[];
  unclaimed: ClaimData[];
  claimRate: number;
}

export function ClaimsDashboard() {
  const [predictionId, setPredictionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClaimsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkClaims = async (id: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const url = `/api/admin/check-claims?predictionId=${id}`;
      console.log('🔍 Fetching claims from:', url);
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('📊 API Response:', data);

      if (data.success) {
        console.log('✅ Setting result:', data.data);
        setResult(data.data);
      } else {
        console.log('❌ API Error:', data.error);
        setError(data.error || 'Failed to check claims');
      }
    } catch (err) {
      console.error('❌ Network Error:', err);
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const checkAllPredictions = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/check-all-claims');
      const data = await response.json();

      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'Failed to check all claims');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Error checking all claims:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatEth = (eth: number): string => {
    return eth.toFixed(6);
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    alert('Address copied to clipboard!');
  };

  return (
    <div className="claims-dashboard">
      <div className="claims-header">
        <h2>💰 Claims Management</h2>
        <p>Check unclaimed rewards for specific predictions or all predictions</p>
      </div>

      <div className="claims-controls">
        <div className="input-group">
          <label htmlFor="predictionId">Prediction ID:</label>
          <input
            id="predictionId"
            type="text"
            value={predictionId}
            onChange={(e) => setPredictionId(e.target.value)}
            placeholder="e.g., pred_8, pred_6"
            className="prediction-input"
          />
          <button
            onClick={() => {
              console.log('🔘 Button clicked, predictionId:', predictionId);
              checkClaims(predictionId);
            }}
            disabled={!predictionId.trim() || loading}
            className="check-btn"
          >
            {loading ? 'Checking...' : 'Check Specific'}
          </button>
        </div>

        <div className="divider">OR</div>

        <button
          onClick={checkAllPredictions}
          disabled={loading}
          className="check-all-btn"
        >
          {loading ? 'Checking All...' : 'Check All Predictions'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <h3>❌ Error</h3>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="claims-result">
          <div className="result-header">
            <h3>📊 Results for {result.predictionId}</h3>
            <div className="summary-stats">
              <div className="stat">
                <span className="stat-label">Total Stakes:</span>
                <span className="stat-value">{result.totalStakes}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Claimed:</span>
                <span className="stat-value claimed">{result.claimed.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Unclaimed:</span>
                <span className="stat-value unclaimed">{result.unclaimed.length}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Claim Rate:</span>
                <span className="stat-value">{result.claimRate.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {result.claimed.length > 0 && (
            <div className="claimed-section">
              <h4>✅ Claimed ({result.claimed.length})</h4>
              <div className="claims-list">
                {result.claimed.map((claim, index) => (
                  <div key={index} className="claim-item claimed">
                    <div className="claim-address" onClick={() => copyAddress(claim.userId)}>
                      {claim.userId}
                    </div>
                    <div className="claim-info">
                      <div className="claim-amount">
                        {formatEth(claim.stakeAmount)} ETH
                      </div>
                      <div className="claim-vote">
                        {claim.yesAmount > 0 ? 'YES' : 'NO'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.unclaimed.length > 0 && (
            <div className="unclaimed-section">
              <h4>⏳ Unclaimed ({result.unclaimed.length})</h4>
              <div className="claims-list">
                {result.unclaimed.map((claim, index) => (
                  <div key={index} className="claim-item unclaimed">
                    <div className="claim-address" onClick={() => copyAddress(claim.userId)}>
                      {claim.userId}
                    </div>
                    <div className="claim-info">
                      <div className="claim-amount">
                        {formatEth(claim.stakeAmount)} ETH
                      </div>
                      <div className="claim-vote">
                        {claim.yesAmount > 0 ? 'YES' : 'NO'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
