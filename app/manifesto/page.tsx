"use client";

import React, { useCallback } from 'react';
import { useOpenUrl } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';
import './Manifesto.css';

export default function ManifestoPage() {
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

  return (
    <div className="manifesto-container">
      <div className="manifesto-header">
        <div className="manifesto-title-section">
          <h1 className="manifesto-main-title">SWIPE Manifesto</h1>
          <p className="manifesto-subtitle">Your Prediction Market Companion. Democratizing Future Events for the Next Generation</p>
        </div>
        <div className="manifesto-social-links">
          <button onClick={() => openUrl('https://x.com/swipe_ai_')} className="manifesto-social-link">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </button>
          <button onClick={() => openUrl('https://discord.gg/nw9TzCwUhx')} className="manifesto-social-link">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </button>
          <button onClick={() => openUrl('https://t.me/SWIPEONBASE')} className="manifesto-social-link">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="manifesto-content">
        <section className="manifesto-section">
          <h2 className="section-title">SWIPE: Your Prediction Market Companion</h2>
          <p className="section-text">
            Imagine a world where your insights about the future are truly valuable—where your predictions about tomorrow's events can generate real returns today. That is the promise of prediction markets and decentralized forecasting. With a basic understanding of market dynamics, users can rest assured that their predictions are backed by real economic incentives and fully under their control. No intermediaries. No gatekeepers.
          </p>
          <p className="section-text">
            This vision of predictive autonomy is revolutionary. It allows you to bet on any future event, anywhere in the world, without worrying about traditional market barriers, complex financial instruments, or unseen forces manipulating outcomes. This is the stark difference between decentralized prediction markets and traditional financial speculation.
          </p>
          <p className="section-text">
            Traditional financial markets, for all their sophistication, serve a purpose: they provide liquidity and price discovery for established assets. Whether you're trading stocks, commodities, or currencies, traditional markets thrive on their infrastructure and regulation. However, that infrastructure comes at a heavy, sometimes hidden, cost. Traditional markets are limited to what can be easily standardized and regulated—while charging fees for the privilege of participation. We aren't looking to replace traditional markets, however, we are looking to democratize access to prediction markets when it comes to any future event.
          </p>
          <p className="section-text">
            But in a world where you can predict anything, where do these traditional limitations fit? They don't. Instead, they are replaced by a fragmented maze of platforms, each requiring specialized knowledge and different interfaces. Managing your predictions across multiple platforms means grappling with different wallets, different tokens, and different rules—each requiring specialized knowledge. For many, this complexity is overwhelming, creating a barrier to true predictive empowerment.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">That's Why We Built SWIPE</h2>
          <p className="section-text">
            SWIPE replaces the complexity of traditional prediction market experiences with something better: a single, intuitive Tinder-style interface that acts as your companion and partner in navigating the future. SWIPE is more than just a platform—it's your personal prediction companion, simplifying every step of the journey.
          </p>
          <p className="section-text">
            With SWIPE, the complexities of prediction markets melt away. Want to bet on a future event? Need to stake on a specific outcome? Curious about market sentiment? SWIPE lets you research and take action with a simple swipe, no matter where you are.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">Built for the New Generation</h2>
          <p className="section-text">
            The emerging generation are native to social media and intuitive interfaces. Soon our interaction with prediction markets will become second nature. From swiping on dating apps to predicting market outcomes, we expect seamless, instant solutions. SWIPE meets this expectation, transforming prediction markets into an intuitive, social experience.
          </p>
          <p className="section-text">
            Everyone seeks to create more value for themselves—that's why we work and invest. SWIPE empowers you to achieve this in a frictionless and intuitive way, breaking down barriers to participation while enhancing the opportunities at your fingertips.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">Seamless, Borderless, Effortless—Where We're Starting</h2>
          <p className="section-text">
            Picture this: you're on social media (X or Warpcast) and see a prediction gaining traction. Instead of juggling multiple platforms, wallets, and complex interfaces, you simply swipe:
          </p>
          <div className="code-block">
            <p className="code-text">Swipe RIGHT for YES, LEFT for NO</p>
            <p className="code-text">Stake 0.1 ETH on "Bitcoin hits $100k by 2024"</p>
          </div>
          <p className="section-text">
            SWIPE handles the rest. From smart contract interactions to proportional payouts, it ensures you're in control of your predictions without the need for technical expertise. You stay focused on opportunities while SWIPE takes care of the complexities.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">A Private Terminal for Complete Control—Where We're Going</h2>
          <p className="section-text">
            While SWIPE thrives in social spaces, it also offers a comprehensive dashboard—a space for traders to create and manage custom predictions. Imagine telling SWIPE:
          </p>
          <div className="code-block">
            <p className="code-text">"Create prediction: Will AI replace 50% of jobs by 2030?"</p>
            <p className="code-text">"Set deadline: 6 months from now"</p>
            <p className="code-text">"Auto-claim rewards when resolved"</p>
          </div>
          <p className="section-text">
            SWIPE monitors the market 24/7, so you don't have to. Whether you're optimizing short-term gains or executing long-term strategies, SWIPE ensures your predictions happen exactly when you need them.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">The Twist: SWIPE Launched on Base L2</h2>
          <p className="section-text">
            SWIPE took innovation a step further by launching on Base L2, leveraging the most efficient and cost-effective blockchain infrastructure. This strategic yet purposeful move adds real value to the SWIPE ecosystem, aligning incentives and driving growth. SWIPE reinvests platform fees into ecosystem development, creating a flywheel effect that benefits users and strengthens the community.
          </p>
          <p className="section-text">
            We have strategic plans for SWIPE. To stabilize and drive consistent growth in the platform, a portion of SWIPE's 1% platform fees will be allocated to platform development, which will then be used to enhance user experience and expand functionality.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">The SWIPE Vision</h2>
          <p className="section-text">
            Prediction markets were meant to democratize access to future information, but their complexity has created new barriers. SWIPE is here to tear them down. By integrating into platforms where ideas are born—Warpcast, X, Discord, and Telegram—we make prediction markets intuitive, conversational, and accessible.
          </p>
          <p className="section-text">Our mission is clear:</p>
          <ol className="mission-list">
            <li><strong>Simplify Prediction Markets:</strong> Say goodbye to clunky interfaces, complex wallets, and fragmented systems.</li>
            <li><strong>Empower the Next Generation:</strong> Equip the next generation with tools built for their fast-paced, social-first lifestyles.</li>
            <li><strong>Foster Community:</strong> Through transparent fees and a user-first design, SWIPE aligns its growth with its users' success.</li>
          </ol>
          <p className="section-text">
            Prediction markets are no longer confined to complex trading terminals or academic papers. Today, predictions come to life in social spaces. SWIPE bridges the gap between ideas and action, turning conversations into seamless predictions.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">How SWIPE Works: Complete User Guide</h2>
          
          <h3 className="subsection-title">Getting Started with SWIPE</h3>
          <p className="section-text">
            SWIPE is a decentralized prediction market platform built on Base L2. Here's everything you need to know:
          </p>
          
          <div className="guide-steps">
            <div className="step">
              <h4>1. Connect Your Wallet</h4>
              <p>Click 'Connect Wallet' and choose MetaMask, Coinbase Wallet, or any compatible wallet. SWIPE works seamlessly with Base L2 for fast, low-cost transactions.</p>
            </div>
            
            <div className="step">
              <h4>2. Browse Predictions</h4>
              <p>Use the Tinder-style interface to swipe through active predictions. Swipe RIGHT (→) for YES, LEFT (←) for NO. Each card shows real-time market data, participant avatars, and detailed analysis.</p>
            </div>
            
            <div className="step">
              <h4>3. Place Your Bets</h4>
              <p>Choose your stake amount in ETH or $SWIPE tokens. ETH minimum: 0.00001 ETH (~$0.03), maximum: 100 ETH. $SWIPE minimum: 10,000 tokens, maximum: unlimited.</p>
            </div>
            
            <div className="step">
              <h4>4. Claim Rewards</h4>
              <p>After predictions are resolved, winners can claim their rewards from the Portfolio dashboard. Separate pools for ETH and $SWIPE tokens.</p>
            </div>
          </div>

          <h3 className="subsection-title">Prediction Categories & Examples</h3>
          <p className="section-text">SWIPE supports predictions across 10 categories with real-world examples:</p>
          
          <div className="category-examples">
            <div className="category-example">
              <h4>₿ Crypto</h4>
              <ul>
                <li>"Bitcoin will reach $100,000 by end of 2024"</li>
                <li>"Ethereum will implement EIP-4844 by March 2024"</li>
                <li>"Solana will have 1M daily active users by Q2 2024"</li>
              </ul>
            </div>
            
            <div className="category-example">
              <h4>⚽ Sports</h4>
              <ul>
                <li>"Lakers will win the 2024 NBA Championship"</li>
                <li>"Argentina will win the 2024 Copa America"</li>
                <li>"Chiefs will reach Super Bowl LVIII"</li>
              </ul>
            </div>
            
            <div className="category-example">
              <h4>🏛️ Politics</h4>
              <ul>
                <li>"Trump will win the 2024 US Presidential Election"</li>
                <li>"EU will implement AI regulation by 2024"</li>
                <li>"UK will rejoin EU by 2030"</li>
              </ul>
            </div>
            
            <div className="category-example">
              <h4>🎬 Entertainment</h4>
              <ul>
                <li>"Barbie will win Best Picture at 2024 Oscars"</li>
                <li>"Taylor Swift will perform at Super Bowl LVIII"</li>
                <li>"Netflix will release 50+ original movies in 2024"</li>
              </ul>
            </div>
            
            <div className="category-example">
              <h4>🤖 Technology</h4>
              <ul>
                <li>"ChatGPT will reach 1B users by end of 2024"</li>
                <li>"Tesla will achieve full self-driving by 2024"</li>
                <li>"Apple will release AR glasses in 2024"</li>
              </ul>
            </div>
            
            <div className="category-example">
              <h4>💰 Finance</h4>
              <ul>
                <li>"S&P 500 will reach 5,000 by end of 2024"</li>
                <li>"Fed will cut rates by 0.5% in 2024"</li>
                <li>"Gold will reach $2,500/oz by 2024"</li>
              </ul>
            </div>
          </div>

          <h3 className="subsection-title">Creating Predictions</h3>
          <p className="section-text">Anyone can create predictions on SWIPE:</p>
          
          <div className="creation-guide">
            <div className="creation-step">
              <h4>Step 1: Fill Out Details</h4>
              <p>• Question (max 200 characters)<br/>
              • Description and category<br/>
              • End date/time (1 hour to 1 year)<br/>
              • Optional: Live crypto chart (BTC, ETH, SOL, XRP, BNB)</p>
            </div>
            
            <div className="creation-step">
              <h4>Step 2: Pay Creation Fee</h4>
              <p>• ETH: 0.0001 ETH fee<br/>
              • $SWIPE: 200,000 SWIPE fee<br/>
              • Approved creators can create for free</p>
            </div>
            
            <div className="creation-step">
              <h4>Step 3: Wait for Approval</h4>
              <p>• Community approvers review your prediction<br/>
              • Quality, clarity, and feasibility are checked<br/>
              • Approved predictions go live immediately<br/>
              • Rejected predictions get full fee refund</p>
            </div>
          </div>

          <h3 className="subsection-title">Token Economics</h3>
          <p className="section-text">SWIPE uses a dual-token system:</p>
          
          <div className="token-info">
            <div className="token-details">
              <h4>ETH Token</h4>
              <ul>
                <li>Minimum stake: 0.00001 ETH (~$0.03)</li>
                <li>Maximum stake: 100 ETH (~$300,000)</li>
                <li>Creation fee: 0.0001 ETH</li>
                <li>Separate prize pool from $SWIPE</li>
              </ul>
            </div>
            
            <div className="token-details">
              <h4>$SWIPE Token</h4>
              <ul>
                <li>Minimum stake: 10,000 SWIPE tokens</li>
                <li>Maximum stake: Unlimited</li>
                <li>Creation fee: 200,000 SWIPE</li>
                <li>Native platform token</li>
                <li>Separate prize pool from ETH</li>
              </ul>
            </div>
          </div>

          <h3 className="subsection-title">Payout System</h3>
          <p className="section-text">How rewards are calculated:</p>
          
          <div className="payout-explanation">
            <div className="payout-step">
              <h4>1. Platform Fee</h4>
              <p>SWIPE takes 1% fee from the losing pool (not from winners). This ensures sustainable platform development.</p>
            </div>
            
            <div className="payout-step">
              <h4>2. Winner Distribution</h4>
              <p>Winners receive: Original stake + proportional share of remaining losers pool. Example: Bet 1 ETH on YES, YES wins → Get 1 ETH back + share of NO pool.</p>
            </div>
            
            <div className="payout-step">
              <h4>3. Separate Pools</h4>
              <p>ETH stakers compete for ETH rewards, $SWIPE stakers compete for $SWIPE rewards. No cross-token competition.</p>
            </div>
            
            <div className="payout-step">
              <h4>4. Manual Claiming</h4>
              <p>After resolution, winners must manually claim rewards from their Portfolio dashboard. No time limit for claiming.</p>
            </div>
          </div>

          <h3 className="subsection-title">Advanced Features</h3>
          
          <div className="features-list">
            <div className="feature">
              <h4>🔗 Farcaster Integration</h4>
              <p>Share your predictions on Farcaster after successful bets. Choose from Achievement, Challenge, or Prediction sharing types.</p>
            </div>
            
            <div className="feature">
              <h4>📊 Real-time Analytics</h4>
              <p>View live market data, participant counts, confidence levels, risk assessments, and YES/NO breakdowns for each prediction.</p>
            </div>
            
            <div className="feature">
              <h4>👥 Community Profiles</h4>
              <p>See participant avatars with Farcaster profiles. Click to view profiles or copy wallet addresses for wallet-only users.</p>
            </div>
            
            <div className="feature">
              <h4>⚡ Base L2 Benefits</h4>
              <p>Fast transactions, low gas fees, and seamless user experience powered by Coinbase's Base L2 infrastructure.</p>
            </div>
          </div>

          <h3 className="subsection-title">Frequently Asked Questions</h3>
          
          <div className="faq-section">
            <div className="faq-item">
              <h4>Q: How do I approve $SWIPE tokens?</h4>
              <p>A: When betting with $SWIPE, you'll need to approve the contract to spend your tokens. This is a one-time approval per betting session.</p>
            </div>
            
            <div className="faq-item">
              <h4>Q: What happens if a prediction is cancelled?</h4>
              <p>A: All stakes are refunded in full. Both ETH and $SWIPE stakes are automatically returned to users' wallets.</p>
            </div>
            
            <div className="faq-item">
              <h4>Q: How do I become an approver?</h4>
              <p>A: Approvers are selected by platform administrators. Contact us if you're interested in helping maintain platform quality.</p>
            </div>
            
            <div className="faq-item">
              <h4>Q: Can I bet on my own prediction?</h4>
              <p>A: No, you cannot bet on predictions you created. This prevents manipulation and ensures fair play.</p>
            </div>
            
            <div className="faq-item">
              <h4>Q: What are the platform fees?</h4>
              <p>A: SWIPE has transparent fees: 1% from losing pool, creation fees (0.0001 ETH or 200,000 SWIPE), and standard Base L2 gas fees.</p>
            </div>
          </div>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">The Future is Frictionless</h2>
          <p className="section-text">
            We are building the future of prediction markets for the people. SWIPE makes predicting easy, strategies smart, and markets accessible—while empowering the next generation to thrive in decentralized ecosystems.
          </p>
          <p className="section-text manifesto-signature">
            <strong>SWIPE: Your Prediction Market Companion. 🎯</strong>
          </p>
        </section>
      </div>

      <div className="manifesto-footer">
        <div className="footer-content">
          <p className="footer-text">Built on Base L2 • Powered by OnchainKit • Secured by Smart Contracts</p>
          <div className="footer-links">
            <button onClick={() => openUrl(window.location.origin + '/')} className="footer-link">Back to SWIPE</button>
            <button onClick={() => openUrl(window.location.origin + '/help')} className="footer-link">Help & FAQ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
