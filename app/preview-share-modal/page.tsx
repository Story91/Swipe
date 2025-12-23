"use client";

import { useState } from 'react';
import '../components/Main/TinderCard.css';

// Preview page for Share Modal - access at /preview-share-modal
export default function PreviewShareModal() {
  const [showModal, setShowModal] = useState(true);
  

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
      padding: '20px'
    }}>
      {/* Toggle button */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button
          onClick={() => setShowModal(!showModal)}
          style={{
            padding: '12px 24px',
            background: '#d4ff00',
            color: '#000',
            border: 'none',
            borderRadius: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {showModal ? 'Hide Modal' : 'Show Modal'}
        </button>
        <p style={{ color: '#888', marginTop: '10px', fontSize: '12px' }}>
          This is a preview page for the Share Modal. Access at: /preview-share-modal
        </p>
      </div>

      {/* Share Modal Preview */}
      {showModal && (
        <div className="share-prompt-overlay" style={{ position: 'relative', minHeight: '600px' }}>
          <div className="share-prompt-content-new">
            {/* Close button */}
            <button 
              onClick={() => setShowModal(false)}
              className="share-close-btn"
            >
              ✕
            </button>
            
            {/* Header with logos */}
            <div className="share-logos">
              <img src="/farc.png" alt="Farcaster" className="share-logo" />
              <span className="share-logo-divider">×</span>
              <img src="/Base_square_blue.png" alt="Base" className="share-logo" />
            </div>
            
            {/* Success icon */}
            <div className="share-success-icon">
              <div className="share-success-circle">
                <span>✓</span>
              </div>
            </div>
            
            {/* Title */}
            <h2 className="share-title">Congratulations!</h2>
            <p className="share-subtitle">Your bet has been accepted!</p>
            
            {/* Description */}
            <p className="share-description">Share your bet and challenge your friends!</p>
            
            {/* Share button */}
            <button 
              onClick={() => alert('Share clicked! (In real app, this opens Farcaster composer)')}
              className="share-main-btn"
            >
              <svg className="share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share
            </button>
            
            {/* Skip link */}
            <button 
              onClick={() => setShowModal(false)}
              className="share-skip-link"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

