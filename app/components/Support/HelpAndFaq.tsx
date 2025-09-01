"use client";

import React, { useState } from 'react';

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
    <div className="help-faq">
      <div className="help-header">
        <h1>❓ Help & FAQ</h1>
        <p>Find answers to common questions about Dexter</p>
      </div>

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search for help..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <div className="search-icon">🔍</div>
        </div>
      </div>

      {/* Category Filters */}
      <div className="categories-section">
        <h3>Choose a category:</h3>
        <div className="category-buttons">
          {categories.map(category => (
            <button
              key={category.id}
              className={`category-button ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(category.id)}
            >
              <span className="category-icon">{category.icon}</span>
              <span className="category-label">{category.label}</span>
              {category.id !== 'all' && (
                <span className="category-count">
                  ({faqData.filter(faq => faq.category === category.id).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ List */}
      <div className="faq-section">
        <h3>
          {activeCategory === 'all' ? 'All Questions' :
           categories.find(cat => cat.id === activeCategory)?.label}
          {searchTerm && ` - Search results for "${searchTerm}"`}
        </h3>

        {filteredFAQs.length === 0 ? (
          <div className="no-results">
            <div className="no-results-icon">🤔</div>
            <h4>No questions found</h4>
            <p>Try adjusting your search or category filter.</p>
          </div>
        ) : (
          <div className="faq-list">
            {filteredFAQs.map(faq => (
              <div key={faq.id} className="faq-item">
                <button
                  className="faq-question"
                  onClick={() => toggleExpanded(faq.id)}
                >
                  <span className="question-text">{faq.question}</span>
                  <span className="expand-icon">
                    {expandedItems.has(faq.id) ? '−' : '+'}
                  </span>
                </button>

                {expandedItems.has(faq.id) && (
                  <div className="faq-answer">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact Support */}
      <div className="support-section">
        <div className="support-card">
          <div className="support-icon">💬</div>
          <div className="support-content">
            <h3>Still need help?</h3>
            <p>Can't find what you're looking for? Our community and support team are here to help.</p>
            <div className="support-links">
              <a href="#" className="support-link">
                📧 Contact Support
              </a>
              <a href="#" className="support-link">
                💡 Feature Requests
              </a>
              <a href="#" className="support-link">
                🐛 Report Bug
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="quick-links">
        <h3>Quick Links</h3>
        <div className="links-grid">
          <a href="#" className="quick-link">
            <span className="link-icon">📖</span>
            <span className="link-text">User Guide</span>
          </a>
          <a href="#" className="quick-link">
            <span className="link-icon">🎥</span>
            <span className="link-text">Video Tutorials</span>
          </a>
          <a href="#" className="quick-link">
            <span className="link-icon">💡</span>
            <span className="link-text">Tips & Tricks</span>
          </a>
          <a href="#" className="quick-link">
            <span className="link-icon">🔒</span>
            <span className="link-text">Security Guide</span>
          </a>
        </div>
      </div>
    </div>
  );
}
