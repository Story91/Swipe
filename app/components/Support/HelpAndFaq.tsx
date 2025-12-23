"use client";

import React, { useState, useCallback } from 'react';
import { useOpenUrl } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';
import './HelpAndFaq.css';

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category: string;
}

export function HelpAndFaq() {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const minikitOpenUrl = useOpenUrl();
  
  // Universal openUrl function - works on both MiniKit (Base app) and Farcaster SDK (Warpcast)
  const openUrl = useCallback((url: string) => {
    try {
      if (minikitOpenUrl) {
        console.log('📱 Using MiniKit openUrl...');
        minikitOpenUrl(url);
        return;
      }
    } catch (error) {
      console.log('MiniKit openUrl failed, trying Farcaster SDK...', error);
    }
    
    try {
      console.log('📱 Using Farcaster SDK openUrl...');
      sdk.actions.openUrl(url);
    } catch (error) {
      console.error('Both openUrl methods failed:', error);
    }
  }, [minikitOpenUrl]);

  const faqData: FAQItem[] = [
    {
      id: 1,
      question: "How do I create a prediction?",
      answer: "To create a prediction, click on 'Create Prediction' in the Actions menu. Fill in the question, description, category, and set a duration. You'll need to pay a small creation fee if you're not an approved creator.",
      category: "getting-started"
    },
    {
      id: 2,
      question: "What is a prediction market?",
      answer: "A prediction market is a platform where users can bet on the outcome of future events. Users place ETH on 'YES' or 'NO' for predictions, and winners share the losing pool proportionally to their stake.",
      category: "basics"
    },
    {
      id: 3,
      question: "How do I place a bet?",
      answer: "Browse predictions in Tinder Mode or Market Stats. Choose YES or NO and enter your stake amount in ETH. Confirm the transaction and your bet will be placed immediately.",
      category: "betting"
    },
    {
      id: 4,
      question: "How are payouts calculated?",
      answer: "Winners share the entire losing pool proportionally to their stake. For example, if you bet 1 ETH on YES and YES wins, you get your 1 ETH back plus a share of the NO pool based on your stake percentage.",
      category: "payouts"
    },
    {
      id: 5,
      question: "How do I claim my winnings?",
      answer: "After a prediction is resolved, winners can claim their payouts from their dashboard. Look for predictions with 'Claim Reward' buttons in your portfolio.",
      category: "payouts"
    },
    {
      id: 6,
      question: "How does the Tinder-style interface work?",
      answer: "Swipe right (YES) or left (NO) on predictions to place quick bets. It's designed for fast decision-making on trending predictions.",
      category: "interface"
    },
    {
      id: 7,
      question: "How do I connect my wallet?",
      answer: "Click the 'Connect Wallet' button in the top-left corner. Choose your preferred wallet (MetaMask, Coinbase Wallet, etc.) and approve the connection.",
      category: "getting-started"
    }
  ];


  const toggleExpanded = (id: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <div className="modern-help-faq">
      <div className="modern-help-header">
        <div className="help-title-section">
          <span className="help-main-title">Help & FAQ</span>
          <div className="header-actions">
            <button onClick={() => openUrl(window.location.origin + '/manifesto')} className="manifesto-button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              Manifesto
            </button>
            <div className="social-icons-container">
              <button onClick={() => openUrl('https://x.com/swipe_ai_')} className="social-icon-link">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </button>
              <button onClick={() => openUrl('https://discord.gg/nw9TzCwUhx')} className="social-icon-link">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </button>
              <button onClick={() => openUrl('https://t.me/SWIPEONBASE')} className="social-icon-link">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>



      {/* FAQ List */}
      <div className="modern-faq-section">
        <h3 className="faq-section-title">Frequently Asked Questions</h3>

        <div className="modern-faq-list">
          {faqData.map(faq => (
              <div key={faq.id} className="modern-faq-item">
                <button
                  className="modern-faq-question"
                  onClick={() => toggleExpanded(faq.id)}
                >
                  <span className="modern-question-text">{faq.question}</span>
                  <span className="modern-expand-icon">
                    {expandedItems.has(faq.id) ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    )}
                  </span>
                </button>

                {expandedItems.has(faq.id) && (
                  <div className="modern-faq-answer">
                    <p className="answer-text">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Contact Support */}
      <div className="modern-support-section">
        <div className="modern-support-card">
          <div className="modern-support-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div className="modern-support-content">
            <h3 className="support-title">Still need help?</h3>
            <p className="support-description">Can&apos;t find what you&apos;re looking for? Join our community for support and updates.</p>
            <div className="modern-support-links">
              <button onClick={() => openUrl('https://discord.gg/nw9TzCwUhx')} className="modern-support-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Discord Community
              </button>
              <button onClick={() => openUrl('https://discord.gg/nw9TzCwUhx')} className="modern-support-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11H5a2 2 0 0 0-2 2v3c0 1.1.9 2 2 2h4m0-7v7m0-7h10a2 2 0 0 1 2 2v3c0 1.1-.9 2-2 2H9m0-7V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                </svg>
                Feature Requests
              </button>
              <button onClick={() => openUrl('https://t.me/SWIPEONBASE')} className="modern-support-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                Report Bug
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
