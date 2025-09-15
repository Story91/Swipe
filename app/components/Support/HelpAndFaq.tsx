"use client";

import React, { useState } from 'react';
import './HelpAndFaq.css';

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category: string;
}

export function HelpAndFaq() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

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
      question: "What happens after a prediction deadline?",
      answer: "After the deadline, the prediction enters resolution phase. Admins or approvers will resolve it as YES or NO based on real-world outcomes. Winners can then claim their payouts.",
      category: "resolution"
    },
    {
      id: 5,
      question: "How are payouts calculated?",
      answer: "Winners share the entire losing pool proportionally to their stake. For example, if you bet 1 ETH on YES and YES wins, you get your 1 ETH back plus a share of the NO pool based on your stake percentage.",
      category: "payouts"
    },
    {
      id: 6,
      question: "What are platform fees?",
      answer: "A small percentage (default 1%) is taken from each resolved prediction's total pool as platform fee. This helps maintain the platform and reward the community.",
      category: "fees"
    },
    {
      id: 7,
      question: "How do I become an approved creator?",
      answer: "Approved creators can create predictions without paying the creation fee. Contact an admin to request approval. Consistent quality predictions increase your chances.",
      category: "creator"
    },
    {
      id: 8,
      question: "What is the approval system?",
      answer: "New predictions must be approved before they become active. Approvers review predictions for quality, clarity, and compliance. This ensures a good user experience.",
      category: "approval"
    },
    {
      id: 9,
      question: "Can I cancel my bet?",
      answer: "Once placed, bets cannot be cancelled. Make sure you're confident in your prediction before staking. The platform is designed for commitment to predictions.",
      category: "betting"
    },
    {
      id: 10,
      question: "How do I claim my winnings?",
      answer: "After a prediction is resolved, winners can claim their payouts from their dashboard. Look for predictions with 'Claim Reward' buttons in your portfolio.",
      category: "payouts"
    },
    {
      id: 11,
      question: "What are the minimum and maximum stakes?",
      answer: "Default minimum stake is 0.001 ETH and maximum is 100 ETH per prediction. These limits can be adjusted by platform administrators.",
      category: "limits"
    },
    {
      id: 12,
      question: "How does the Tinder-style interface work?",
      answer: "Swipe right (YES) or left (NO) on predictions to place quick bets. It's designed for fast decision-making on trending predictions.",
      category: "interface"
    },
    {
      id: 13,
      question: "What happens if a prediction needs resolution?",
      answer: "Some predictions may require manual resolution due to unclear outcomes. Admins will review and resolve these cases fairly based on available evidence.",
      category: "resolution"
    },
    {
      id: 14,
      question: "Can I create predictions on any topic?",
      answer: "You can create predictions on most topics, but they must be: 1) Verifiable with real-world outcomes, 2) Not promoting illegal activities, 3) Clear and unambiguous.",
      category: "creator"
    },
    {
      id: 15,
      question: "How do I connect my wallet?",
      answer: "Click the 'Connect Wallet' button in the top-left corner. Choose your preferred wallet (MetaMask, Coinbase Wallet, etc.) and approve the connection.",
      category: "getting-started"
    }
  ];

  const categories = [
    { id: 'all', label: 'All Questions', icon: '📚' },
    { id: 'getting-started', label: 'Getting Started', icon: '🚀' },
    { id: 'basics', label: 'Platform Basics', icon: '💡' },
    { id: 'betting', label: 'Betting', icon: '🎯' },
    { id: 'creator', label: 'Creating Predictions', icon: '✨' },
    { id: 'resolution', label: 'Resolution & Payouts', icon: '✅' },
    { id: 'fees', label: 'Fees & Limits', icon: '💰' },
    { id: 'approval', label: 'Approval System', icon: '🔍' },
    { id: 'interface', label: 'Interface', icon: '🖥️' }
  ];

  const filteredFAQs = faqData.filter(faq => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
    const matchesSearch = searchTerm === '' ||
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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
          <div className="social-icons-container">
            <a href="https://x.com/swipe_ai_" target="_blank" rel="noopener noreferrer" className="social-icon-link">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a href="https://discord.gg/nw9TzCwUhx" target="_blank" rel="noopener noreferrer" className="social-icon-link">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>
            <a href="https://t.me/SWIPEONBASE" target="_blank" rel="noopener noreferrer" className="social-icon-link">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </a>
          </div>
        </div>
        <p className="help-description">Find answers to common questions about Dexter</p>
      </div>

      {/* Search Bar */}
      <div className="modern-search-section">
        <div className="modern-search-container">
          <input
            type="text"
            placeholder="Search for help..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="modern-search-input"
          />
          <div className="modern-search-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </div>
        </div>
      </div>

      {/* Category Filters */}
      <div className="modern-categories-section">
        <h3 className="categories-title">Choose a category</h3>
        <div className="modern-category-buttons">
          {categories.map(category => (
            <button
              key={category.id}
              className={`modern-category-button ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(category.id)}
            >
              <span className="modern-category-icon">{category.icon}</span>
              <span className="modern-category-label">{category.label}</span>
              {category.id !== 'all' && (
                <span className="modern-category-count">
                  {faqData.filter(faq => faq.category === category.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ List */}
      <div className="modern-faq-section">
        <h3 className="faq-section-title">
          {activeCategory === 'all' ? 'All Questions' :
           categories.find(cat => cat.id === activeCategory)?.label}
          {searchTerm && ` - Search results for "${searchTerm}"`}
        </h3>

        {filteredFAQs.length === 0 ? (
          <div className="modern-no-results">
            <div className="modern-no-results-icon">🤔</div>
            <h4 className="no-results-title">No questions found</h4>
            <p className="no-results-text">Try adjusting your search or category filter.</p>
          </div>
        ) : (
          <div className="modern-faq-list">
            {filteredFAQs.map(faq => (
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
        )}
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
            <p className="support-description">Can&apos;t find what you&apos;re looking for? Our community and support team are here to help.</p>
            <div className="modern-support-links">
              <a href="#" className="modern-support-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                Contact Support
              </a>
              <a href="#" className="modern-support-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11H5a2 2 0 0 0-2 2v3c0 1.1.9 2 2 2h4m0-7v7m0-7h10a2 2 0 0 1 2 2v3c0 1.1-.9 2-2 2H9m0-7V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
                </svg>
                Feature Requests
              </a>
              <a href="#" className="modern-support-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
                Report Bug
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="modern-quick-links">
        <h3 className="quick-links-title">Quick Links</h3>
        <div className="modern-links-grid">
          <a href="#" className="modern-quick-link">
            <span className="modern-link-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
            </span>
            <span className="modern-link-text">User Guide</span>
          </a>
          <a href="#" className="modern-quick-link">
            <span className="modern-link-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            </span>
            <span className="modern-link-text">Video Tutorials</span>
          </a>
          <a href="#" className="modern-quick-link">
            <span className="modern-link-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4"></path>
                <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"></path>
                <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"></path>
                <path d="M12 3c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3"></path>
                <path d="M12 21c0-1 1-3 3-3s3 2 3 3-1 3-3 3-3-2-3-3"></path>
              </svg>
            </span>
            <span className="modern-link-text">Tips & Tricks</span>
          </a>
          <a href="#" className="modern-quick-link">
            <span className="modern-link-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <circle cx="12" cy="16" r="1"></circle>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </span>
            <span className="modern-link-text">Security Guide</span>
          </a>
        </div>
      </div>
    </div>
  );
}
