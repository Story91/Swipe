"use client";

import React, { useState, useEffect } from 'react';
import { useWriteContract, useAccount, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';
import './CreatePredictionModal.css';

interface CreatePredictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreatePredictionModal({ isOpen, onClose, onSuccess }: CreatePredictionModalProps) {
  const { address } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const [formData, setFormData] = useState({
    question: '',
    description: '',
    category: '',
    imageUrl: '',
    endDate: '',
    endTime: '',
    includeChart: false,
    selectedCrypto: ''
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Get contract settings
  const { data: creationFee } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'creationFee'
  });

  const { data: isApprovedCreator } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'approvedCreators',
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address // Nie wykonuj query gdy address jest undefined
    }
  });

  const { data: contractOwner } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'owner'
  });

  const { data: publicCreationEnabled } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'publicCreationEnabled'
  });

  const isOwner = address && contractOwner && address.toLowerCase() === contractOwner.toLowerCase();

  // Set default end date and time (24 hours from now)
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const endDate = tomorrow.toISOString().split('T')[0];
    const endTime = tomorrow.toTimeString().slice(0, 5);
    
    setFormData(prev => ({
      ...prev,
      endDate,
      endTime
    }));
  }, []);



  const categories = [
    'Crypto', 'Sports', 'Politics', 'Entertainment', 'Technology',
    'Finance', 'Weather', 'Science', 'Business', 'Other'
  ];

  const cryptoOptions = [
    { symbol: 'BTC', name: 'Bitcoin', icon: '₿', color: '#f7931a' },
    { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ', color: '#627eea' },
    { symbol: 'SOL', name: 'Solana', icon: '◎', color: '#9945ff' },
    { symbol: 'XRP', name: 'Ripple', icon: '✕', color: '#23292f' },
    { symbol: 'BNB', name: 'Binance Coin', icon: '🟡', color: '#f3ba2f' }
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.question.trim()) {
      newErrors.question = 'Question is required';
    } else if (formData.question.length > 200) {
      newErrors.question = 'Question must be 200 characters or less';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.category.trim()) {
      newErrors.category = 'Category is required';
    }

    if (!formData.includeChart && !formData.imageUrl.trim()) {
      newErrors.imageUrl = 'Image URL is required when not using chart';
    }

    // Validate end date and time
    if (!formData.endDate || !formData.endTime) {
      newErrors.endDate = 'End date and time are required';
    } else {
      const now = new Date();
      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
      
      if (endDateTime <= now) {
        newErrors.endDate = 'End date and time must be in the future';
      }
      
      // Check if duration is at least 1 hour and at most 1 year
      const durationInHours = (endDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (durationInHours < 1) {
        newErrors.endDate = 'Prediction must last at least 1 hour';
      } else if (durationInHours > 8760) {
        newErrors.endDate = 'Prediction cannot last more than 1 year';
      }
    }

    if (formData.includeChart && !formData.selectedCrypto) {
      newErrors.selectedCrypto = 'Please select a cryptocurrency for the chart';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      const value = isOwner || isApprovedCreator ? BigInt(0) : (creationFee || BigInt(0));



      // Calculate duration in hours from end date/time
      const now = new Date();
      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
      const durationInHours = Math.ceil((endDateTime.getTime() - now.getTime()) / (1000 * 60 * 60));

      // Execute transaction with callbacks
      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'createPrediction',
        args: [
          formData.question.trim(),
          formData.description.trim(),
          formData.category.trim(),
          formData.imageUrl.trim(),
          BigInt(durationInHours)
        ],
        value
      }, {
        onSuccess: async (txHash) => {
          // Show success alert with Basescan link
          alert(`🎉 Prediction created successfully!\n\nTransaction Hash: ${txHash}\n\nView on Basescan: https://basescan.org/tx/${txHash}`);
          
          // Sync new prediction to Redis after successful transaction
          try {
            const syncResponse = await fetch('/api/sync');
          } catch (syncError) {
            // Silent fail for sync
          }

          // Close modal and reset form
          onSuccess?.();
          onClose();
          setFormData({
            question: '',
            description: '',
            category: '',
            imageUrl: '',
            endDate: '',
            endTime: '',
            includeChart: false,
            selectedCrypto: ''
          });
        },
        onError: (error) => {
          setErrors({ submit: 'Failed to create prediction. Please try again.' });
        }
      });
    } catch (error) {
      setErrors({ submit: 'Failed to create prediction. Please try again.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modern-create-modal-overlay">
      <div className="modern-create-modal">
        <div className="modern-create-modal-header">
          <div className="modern-modal-title">
            <span className="create-title">Create Prediction</span>
            <span className="create-subtitle">Prediction Market</span>
          </div>
          <button className="modern-create-close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modern-create-modal-content">
          <form onSubmit={handleSubmit} className="modern-form">
            {/* Question */}
            <div className="modern-form-group">
              <label className="modern-form-label">
                Question *
              </label>
              <textarea
                value={formData.question}
                onChange={(e) => handleInputChange('question', e.target.value)}
                className={`modern-form-textarea ${
                  errors.question ? 'error' : ''
                }`}
                rows={3}
                placeholder="Will Bitcoin reach $100,000 by end of 2024?"
                maxLength={200}
              />
              {errors.question && (
                <p className="modern-form-error">{errors.question}</p>
              )}
              <p className="modern-form-counter">
                {formData.question.length}/200 characters
              </p>
            </div>

            {/* Description */}
            <div className="modern-form-group">
              <label className="modern-form-label">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className={`modern-form-textarea ${
                  errors.description ? 'error' : ''
                }`}
                rows={4}
                placeholder="Provide context, analysis, and reasoning for your prediction..."
              />
              {errors.description && (
                <p className="modern-form-error">{errors.description}</p>
              )}
            </div>

            {/* Category */}
            <div className="modern-form-group">
              <label className="modern-form-label">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className={`modern-form-select ${
                  errors.category ? 'error' : ''
                }`}
              >
                <option value="">Select a category</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              {errors.category && (
                <p className="modern-form-error">{errors.category}</p>
              )}
            </div>

            {/* Chart Selection */}
            <div className="modern-form-group">
              <label className="modern-form-label">
                Crypto Chart (Optional)
              </label>
              <div className="modern-chart-section">
                <div className="modern-checkbox-group">
                  <input
                    type="checkbox"
                    id="includeChart"
                    checked={formData.includeChart}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      includeChart: e.target.checked,
                      imageUrl: e.target.checked ? '' : prev.imageUrl // Clear image when chart is enabled
                    }))}
                    className="modern-checkbox"
                  />
                  <label htmlFor="includeChart" className="modern-checkbox-label">
                    Include live crypto chart in prediction
                  </label>
                </div>

                {formData.includeChart && (
                  <div className="modern-crypto-selection">
                    <label className="modern-crypto-label">
                      Select Cryptocurrency *
                    </label>
                    <div className="modern-crypto-grid">
                      {cryptoOptions.map(crypto => (
                        <button
                          key={crypto.symbol}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, selectedCrypto: crypto.symbol }))}
                          className={`modern-crypto-btn ${
                            formData.selectedCrypto === crypto.symbol ? 'selected' : ''
                          }`}
                          style={{ borderColor: formData.selectedCrypto === crypto.symbol ? crypto.color : undefined }}
                        >
                          <span className="crypto-icon">{crypto.icon}</span>
                          <span className="crypto-symbol">{crypto.symbol}</span>
                        </button>
                      ))}
                    </div>
                    {errors.selectedCrypto && (
                      <p className="modern-form-error">{errors.selectedCrypto}</p>
                    )}
                    {formData.selectedCrypto && (
                      <div className="modern-crypto-info">
                        <p className="crypto-info-text">
                          Selected: <strong>{cryptoOptions.find(c => c.symbol === formData.selectedCrypto)?.name}</strong>
                        </p>
                        <p className="crypto-info-subtext">
                          Live chart will be embedded in your prediction
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Image URL */}
            <div className="modern-form-group">
              <label className="modern-form-label">
                Image URL {formData.includeChart ? '(Disabled when chart is selected)' : '*'}
              </label>
              <input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => handleInputChange('imageUrl', e.target.value)}
                disabled={formData.includeChart}
                className={`modern-form-input ${
                  formData.includeChart
                    ? 'disabled'
                    : errors.imageUrl
                    ? 'error'
                    : ''
                }`}
                placeholder={formData.includeChart ? 'Chart will be used as image' : 'https://example.com/image.jpg'}
              />
              {errors.imageUrl && !formData.includeChart && (
                <p className="modern-form-error">{errors.imageUrl}</p>
              )}
              <p className="modern-form-help">
                {formData.includeChart
                  ? 'Chart image will be automatically generated and used'
                  : 'Provide a URL to an image that represents your prediction'
                }
              </p>
            </div>

            {/* End Date and Time */}
            <div className="modern-form-group">
              <label className="modern-form-label">
                Prediction End Date and Time *
              </label>
              <div className="modern-datetime-grid">
                <div className="modern-datetime-field">
                  <label className="modern-datetime-label">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleInputChange('endDate', e.target.value)}
                    className={`modern-form-input ${
                      errors.endDate ? 'error' : ''
                    }`}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="modern-datetime-field">
                  <label className="modern-datetime-label">End Time</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => handleInputChange('endTime', e.target.value)}
                    className={`modern-form-input ${
                      errors.endDate ? 'error' : ''
                    }`}
                    step="60"
                  />
                </div>
              </div>
              
              {errors.endDate && (
                <p className="modern-form-error">{errors.endDate}</p>
              )}
              
              {formData.endDate && formData.endTime && (
                <div className="modern-datetime-info">
                  <p className="datetime-info-text">
                    <strong>Prediction will end:</strong> {new Date(`${formData.endDate}T${formData.endTime}`).toLocaleString('pl-PL')}
                  </p>
                  <p className="datetime-duration-text">
                    Duration: {(() => {
                      const now = new Date();
                      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
                      const durationInHours = Math.ceil((endDateTime.getTime() - now.getTime()) / (1000 * 60 * 60));
                      const days = Math.floor(durationInHours / 24);
                      const hours = durationInHours % 24;
                      if (days > 0) {
                        return `${days} day${days > 1 ? 's' : ''} ${hours > 0 ? `and ${hours} hour${hours > 1 ? 's' : ''}` : ''}`;
                      }
                      return `${hours} hour${hours > 1 ? 's' : ''}`;
                    })()}
                  </p>
                </div>
              )}
              
              <p className="modern-form-help">
                Select the exact date and time when your prediction should end. Must be at least 1 hour from now.
              </p>
            </div>

            {/* Fee Information */}
            {address && !isOwner && !isApprovedCreator && creationFee && publicCreationEnabled && (
              <div className="modern-info-box fee-info">
                <h3 className="info-box-title">
                  Creation Fee Required
                </h3>
                <p className="info-box-text">
                  You need to pay {(Number(creationFee) / 1e18).toFixed(4)} ETH to create this prediction.
                  Approved creators don&apos;t need to pay this fee.
                </p>
              </div>
            )}

            {/* Public Creation Disabled Warning */}
            {address && !isOwner && !isApprovedCreator && publicCreationEnabled === false && (
              <div className="modern-info-box error-info">
                <h3 className="info-box-title">
                  ⚠️ Cannot Create Prediction
                </h3>
                <p className="info-box-text">
                  <strong>Public creation is currently disabled.</strong> Only approved creators can create predictions.
                  <br />
                  <span className="info-box-subtext">
                    Contact the contract owner to enable public creation or request approved creator status.
                  </span>
                </p>
              </div>
            )}



            {/* Submit Error */}
            {errors.submit && (
              <div className="modern-info-box error-info">
                <p className="info-box-text">{errors.submit}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="modern-form-actions">
              <button
                type="button"
                onClick={onClose}
                className="modern-cancel-btn"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || (!isOwner && !isApprovedCreator && !publicCreationEnabled)}
                className={`modern-submit-btn ${isPending ? 'loading' : ''}`}
              >
                {isPending ? (
                  <>
                    <div className="modern-spinner"></div>
                    Creating...
                  </>
                ) : (
                  'Create Prediction'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
