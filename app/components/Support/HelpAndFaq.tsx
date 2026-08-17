"use client";

import React, { useState, useCallback } from 'react';
import { useOpenUrl } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
      question: "What is a prediction market?",
      answer: "Swipe is a parimutuel prediction market: you back YES or NO on a question with USDC, and at the deadline the winning side splits what the losing side staked. There's no order book and no market maker. The platform holds no position of its own, so it can't win or lose on the outcome, only take a fee.",
      category: "basics"
    },
    {
      id: 2,
      question: "Which networks does Swipe run on?",
      answer: "Base today, collateralised in USDC. Robinhood Chain is next, in USDG, but V3 isn't deployed there yet. Each chain runs its own instance of the same audited contract, at its own address, and markets don't share liquidity across chains.",
      category: "basics"
    },
    {
      id: 3,
      question: "How do I place a bet?",
      answer: "Betting is temporarily paused while the app finishes moving onto the new V3 contract, which is live and verified on Base. We'd rather refuse a bet than take one on a contract we can't guarantee settlement for. Once it reopens: approve USDC once, pick a side and an amount (0.1 USDC minimum), and confirm.",
      category: "betting"
    },
    {
      id: 4,
      question: "Can I exit a bet before the deadline?",
      answer: "Yes, part of a position or all of it, for a 5% fee on what the exit is worth. One restriction: in a market's final quarter, you can't exit a side down to exactly zero if you're the only one backing it. That closes off converting a losing bet into a full refund for everyone once the outcome is usually clear.",
      category: "betting"
    },
    {
      id: 5,
      question: "How are payouts calculated?",
      answer: "Winners split what the losing side staked, after a 3% platform fee and a 0.5% creator fee, both taken only from the losing pool. Your own stake always comes back in full. How much of the split you get depends on your stake and when you placed it: bets in a market's first quarter count for ×1.50 when the losing pool is divided, ×1.25 in the second quarter, ×1.00 after. See the worked example above.",
      category: "payouts"
    },
    {
      id: 6,
      question: "How long does it take to resolve a prediction?",
      answer: "A resolver settles the market once its deadline passes; nothing can be resolved while betting is still open. If a market sits unresolved 30 days past its deadline, anyone can open refunds for it, so your stake is never stuck waiting on a single key.",
      category: "payouts"
    },
    {
      id: 7,
      question: "How do I claim my winnings?",
      answer: "Open the resolved market from your dashboard and claim. Payouts are pulled by you rather than sent automatically, and nothing expires. If a market becomes refundable instead, claim your stake back the same way.",
      category: "payouts"
    },
    {
      id: 8,
      question: "How do I create a prediction?",
      answer: "Markets are added by the Swipe team rather than through a self-serve form right now. That's part of what's still being rebuilt for V3, with no fixed date yet.",
      category: "getting-started"
    },
    {
      id: 9,
      question: "How does the Tinder-style interface work?",
      answer: "Swipe right for YES or left for NO to place a quick bet from the card stack. The swipe interface is being rebuilt for the new contract along with the rest of betting, so for now it's for browsing markets rather than betting on them.",
      category: "interface"
    },
    {
      id: 10,
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

      {/* How It Works Section */}
      <div className="modern-faq-section">
        <h3 className="faq-section-title contract-example-section-title">How the Contract Works - Example</h3>
        
        <Card className="contract-example-card">
          <CardHeader>
            <CardTitle className="contract-example-title">Example: "Will ETH close above $4,000 on 31 Dec?"</CardTitle>
            <CardDescription className="contract-example-description">
              The real V3 arithmetic, at the rates deployed on Base: fees come out of the losing pool only, and the winning side splits the rest by weighted stake.
            </CardDescription>
          </CardHeader>
          <CardContent className="contract-example-content">
            <div className="example-scenario">
              <h4 className="example-title">📊 Initial situation:</h4>
              <div className="example-pools">
                <div className="pool-yes">
                  <strong>YES Pool (400 USDC):</strong>
                  <ul>
                    <li>Alice: 100 USDC, placed in the first quarter (×1.50)</li>
                    <li>Ben: 300 USDC, placed after the second quarter (×1.00)</li>
                  </ul>
                </div>
                <div className="pool-no">
                  <strong>NO Pool (1000 USDC):</strong>
                  <p>This is the pool that gets split among the winners.</p>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="example-resolution">
              <h4 className="example-title">✅ Outcome: YES wins</h4>
              <div className="resolution-details">
                <div className="platform-fee">
                  <strong>Platform fee (3%):</strong>
                  <p>1000 USDC × 3% = 30 USDC</p>
                </div>
                <div className="platform-fee">
                  <strong>Creator fee (0.5%):</strong>
                  <p>1000 USDC × 0.5% = 5 USDC</p>
                </div>
                <div className="distributable-pool">
                  <strong>Split between the YES side:</strong>
                  <p>1000 - 30 - 5 = 965 USDC</p>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="example-payouts">
              <h4 className="example-title">💰 Payouts for winners:</h4>
              <div className="payouts-list">
                <div className="payout-item winner">
                  <div className="payout-header">
                    <strong>Alice</strong> (weighted 150 of 450, 100 × 1.50)
                  </div>
                  <div className="payout-details">
                    <div>Stake: 100 USDC</div>
                    <div>Share: (150/450) × 965 USDC = 321.67 USDC</div>
                    <div className="payout-total"><strong>Total payout: 421.67 USDC</strong></div>
                  </div>
                </div>
                <div className="payout-item winner">
                  <div className="payout-header">
                    <strong>Ben</strong> (weighted 300 of 450, 300 × 1.00)
                  </div>
                  <div className="payout-details">
                    <div>Stake: 300 USDC</div>
                    <div>Share: (300/450) × 965 USDC = 643.33 USDC</div>
                    <div className="payout-total"><strong>Total payout: 943.33 USDC</strong></div>
                  </div>
                </div>
                <div className="payout-item loser">
                  <div className="payout-header">
                    <strong>The NO side</strong>
                  </div>
                  <div className="payout-details">
                    <div>Loses the full 1000 USDC staked there.</div>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="example-summary">
              <h4 className="example-title">📝 Key information:</h4>
              <ul className="summary-list">
                <li>✅ A correct prediction never returns less than you staked</li>
                <li>⚠️ Betting earlier is worth more: it's zero-sum between winners, not free money. Here, weighting moved 80.42 USDC from Ben to Alice; the losing pool stayed 1000 USDC before and after</li>
                <li>⚠️ Platform takes 3% and the market's creator takes 0.5%, both from the losing pool only</li>
                <li>⚠️ If you bet on the losing side, you lose your entire stake</li>
                <li>💡 Always bet responsibly. You can lose your entire stake</li>
              </ul>
            </div>
          </CardContent>
        </Card>
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
