"use client";

import React from 'react';
import './Manifesto.css';

export default function ManifestoPage() {
  return (
    <div className="manifesto-container">
      <div className="manifesto-header">
        <div className="manifesto-title-section">
          <h1 className="manifesto-main-title">Dexter Manifesto</h1>
          <p className="manifesto-subtitle">Your Prediction Market Companion. Democratizing Future Events for the Next Generation</p>
        </div>
        <div className="manifesto-social-links">
          <a href="https://x.com/swipe_ai_" target="_blank" rel="noopener noreferrer" className="manifesto-social-link">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a href="https://discord.gg/nw9TzCwUhx" target="_blank" rel="noopener noreferrer" className="manifesto-social-link">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </a>
          <a href="https://t.me/SWIPEONBASE" target="_blank" rel="noopener noreferrer" className="manifesto-social-link">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </a>
        </div>
      </div>

      <div className="manifesto-content">
        <section className="manifesto-section">
          <h2 className="section-title">Dexter: Your Prediction Market Companion</h2>
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
          <h2 className="section-title">That's Why We Built Dexter</h2>
          <p className="section-text">
            Dexter replaces the complexity of traditional prediction market experiences with something better: a single, intuitive Tinder-style interface that acts as your companion and partner in navigating the future. Dexter is more than just a platform—it's your personal prediction companion, simplifying every step of the journey.
          </p>
          <p className="section-text">
            With Dexter, the complexities of prediction markets melt away. Want to bet on a future event? Need to stake on a specific outcome? Curious about market sentiment? Dexter lets you research and take action with a simple swipe, no matter where you are.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">Built for the New Generation</h2>
          <p className="section-text">
            The emerging generation are native to social media and intuitive interfaces. Soon our interaction with prediction markets will become second nature. From swiping on dating apps to predicting market outcomes, we expect seamless, instant solutions. Dexter meets this expectation, transforming prediction markets into an intuitive, social experience.
          </p>
          <p className="section-text">
            Everyone seeks to create more value for themselves—that's why we work and invest. Dexter empowers you to achieve this in a frictionless and intuitive way, breaking down barriers to participation while enhancing the opportunities at your fingertips.
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
            Dexter handles the rest. From smart contract interactions to proportional payouts, it ensures you're in control of your predictions without the need for technical expertise. You stay focused on opportunities while Dexter takes care of the complexities.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">A Private Terminal for Complete Control—Where We're Going</h2>
          <p className="section-text">
            While Dexter thrives in social spaces, it also offers a comprehensive dashboard—a space for traders to create and manage custom predictions. Imagine telling Dexter:
          </p>
          <div className="code-block">
            <p className="code-text">"Create prediction: Will AI replace 50% of jobs by 2030?"</p>
            <p className="code-text">"Set deadline: 6 months from now"</p>
            <p className="code-text">"Auto-claim rewards when resolved"</p>
          </div>
          <p className="section-text">
            Dexter monitors the market 24/7, so you don't have to. Whether you're optimizing short-term gains or executing long-term strategies, Dexter ensures your predictions happen exactly when you need them.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">The Twist: Dexter Launched on Base L2</h2>
          <p className="section-text">
            Dexter took innovation a step further by launching on Base L2, leveraging the most efficient and cost-effective blockchain infrastructure. This strategic yet purposeful move adds real value to the Dexter ecosystem, aligning incentives and driving growth. Dexter reinvests platform fees into ecosystem development, creating a flywheel effect that benefits users and strengthens the community.
          </p>
          <p className="section-text">
            We have strategic plans for Dexter. To stabilize and drive consistent growth in the platform, a portion of Dexter's 1% platform fees will be allocated to platform development, which will then be used to enhance user experience and expand functionality.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">The Dexter Vision</h2>
          <p className="section-text">
            Prediction markets were meant to democratize access to future information, but their complexity has created new barriers. Dexter is here to tear them down. By integrating into platforms where ideas are born—Warpcast, X, Discord, and Telegram—we make prediction markets intuitive, conversational, and accessible.
          </p>
          <p className="section-text">Our mission is clear:</p>
          <ol className="mission-list">
            <li><strong>Simplify Prediction Markets:</strong> Say goodbye to clunky interfaces, complex wallets, and fragmented systems.</li>
            <li><strong>Empower the Next Generation:</strong> Equip the next generation with tools built for their fast-paced, social-first lifestyles.</li>
            <li><strong>Foster Community:</strong> Through transparent fees and a user-first design, Dexter aligns its growth with its users' success.</li>
          </ol>
          <p className="section-text">
            Prediction markets are no longer confined to complex trading terminals or academic papers. Today, predictions come to life in social spaces. Dexter bridges the gap between ideas and action, turning conversations into seamless predictions.
          </p>
        </section>

        <section className="manifesto-section">
          <h2 className="section-title">The Future is Frictionless</h2>
          <p className="section-text">
            We are building the future of prediction markets for the people. Dexter makes predicting easy, strategies smart, and markets accessible—while empowering the next generation to thrive in decentralized ecosystems.
          </p>
          <p className="section-text manifesto-signature">
            <strong>Dexter: Your Prediction Market Companion. 🎯</strong>
          </p>
        </section>
      </div>

      <div className="manifesto-footer">
        <div className="footer-content">
          <p className="footer-text">Built on Base L2 • Powered by OnchainKit • Secured by Smart Contracts</p>
          <div className="footer-links">
            <a href="/" className="footer-link">Back to Dexter</a>
            <a href="/help" className="footer-link">Help & FAQ</a>
          </div>
        </div>
      </div>
    </div>
  );
}
