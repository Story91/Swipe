"use client";

import React, { useState, useEffect } from 'react';
import { useWriteContract, useAccount, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS, SWIPE_TOKEN } from '../../../lib/contract';
import { calculateApprovalAmount } from '../../../lib/constants/approval';
import './CreatePredictionModal.css';

interface CreatePredictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormData {
  question: string;
  description: string;
  category: string;
  imageUrl: string;
  endDate: string;
  endTime: string;
  paymentToken: 'ETH' | 'SWIPE';
  includeChart: boolean;
  selectedCrypto: string;
}

const CATEGORIES = [
  'Crypto', 'Sports', 'Politics', 'Entertainment', 'Technology',
  'Finance', 'Weather', 'Science', 'Business', 'Other'
];

const CRYPTO_OPTIONS = [
  { 
    symbol: 'BTC', 
    name: 'Bitcoin', 
    icon: '₿', 
    color: '#f7931a',
    poolAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    chain: 'eth'
  },
  { 
    symbol: 'ETH', 
    name: 'Ethereum', 
    icon: 'Ξ', 
    color: '#627eea',
    poolAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    chain: 'eth'
  },
  { 
    symbol: 'SOL', 
    name: 'Solana', 
    icon: '◎', 
    color: '#9945ff',
    poolAddress: 'So11111111111111111111111111111111111111112',
    chain: 'solana'
  },
  { 
    symbol: 'XRP', 
    name: 'Ripple', 
    icon: '✕', 
    color: '#23292f',
    poolAddress: '0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe',
    chain: 'bsc'
  },
  { 
    symbol: 'BNB', 
    name: 'Binance Coin', 
    icon: '🟡', 
    color: '#f3ba2f',
    poolAddress: '0xb8c77482e45f1f44de1745f52c74426c631bdd52',
    chain: 'eth'
  },
  { 
    symbol: 'SWIPE', 
    name: 'Swipe', 
    icon: '💎', 
    color: '#6366f1',
    poolAddress: '0xd0187d77af0ed6a44f0a631b406c78b30e160aa9',
    chain: 'base'
  }
];

export function CreatePredictionModal({ isOpen, onClose, onSuccess }: CreatePredictionModalProps) {
  const { address } = useAccount();
  const { writeContract, data: hash, error: writeError, isPending, reset: resetWriteContract } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const [formData, setFormData] = useState<FormData>({
    question: '',
    description: '',
    category: '',
    imageUrl: '',
    endDate: '',
    endTime: '',
    paymentToken: 'ETH',
    includeChart: false,
    selectedCrypto: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData | 'submit', string>>>({});

  // Contract reads
  const { data: ethFee } = useReadContract({
    address: CONTRACTS.V2.address as `0x${string}`,
    abi: CONTRACTS.V2.abi,
    functionName: 'creationFees',
    args: ['0x0000000000000000000000000000000000000000' as `0x${string}`]
  });

  const { data: swipeFee } = useReadContract({
    address: CONTRACTS.V2.address as `0x${string}`,
    abi: CONTRACTS.V2.abi,
    functionName: 'creationFees',
    args: [SWIPE_TOKEN.address as `0x${string}`]
  });

  // Check if user is an approved creator via environment variables
  const approver1 = process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase();
  const approver2 = process.env.NEXT_PUBLIC_APPROVER_2?.toLowerCase();
  const isApprovedCreator = address && (
    approver1 === address.toLowerCase() || 
    approver2 === address.toLowerCase()
  );

  const { data: contractOwner } = useReadContract({
    address: CONTRACTS.V2.address as `0x${string}`,
    abi: CONTRACTS.V2.abi,
    functionName: 'owner'
  });

  const { data: publicCreationEnabled } = useReadContract({
    address: CONTRACTS.V2.address as `0x${string}`,
    abi: CONTRACTS.V2.abi,
    functionName: 'publicCreationEnabled'
  });

  const { data: swipeAllowance } = useReadContract({
    address: SWIPE_TOKEN.address as `0x${string}`,
    abi: [
      {
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' }
        ],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function'
      }
    ],
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.V2.address as `0x${string}`] : undefined,
  });

  const isOwner = address && contractOwner && address.toLowerCase() === (contractOwner as string).toLowerCase();
  const isEnvAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const canCreateFree = Boolean(isOwner || isApprovedCreator || isEnvAdmin);
  const canCreate = Boolean(publicCreationEnabled || canCreateFree);


  // Set default end date/time on mount
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    setFormData(prev => ({
      ...prev,
      endDate: tomorrow.toISOString().split('T')[0],
      endTime: tomorrow.toTimeString().slice(0, 5)
    }));
  }, []);

  // Handle successful transaction
  useEffect(() => {
    if (isConfirmed && hash) {
      const handleSuccess = async () => {
        alert(`🎉 Prediction created successfully!\n\nTransaction: ${hash}\nView on Basescan: https://basescan.org/tx/${hash}`);
        
        // Auto-sync the new prediction to Redis (with delay for blockchain propagation)
        try {
          console.log('⏳ Waiting for blockchain propagation before auto-sync...');
          // Wait for blockchain propagation and transaction finalization
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          console.log('🔄 Auto-syncing new prediction to Redis...');
          const syncResponse = await fetch('/api/predictions/auto-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (syncResponse.ok) {
            console.log('✅ New prediction auto-synced to Redis');
          } else {
            console.warn('⚠️ Auto-sync failed, falling back to full sync...');
            // Fallback to full sync if auto-sync fails
            await fetch('/api/sync');
            console.log('✅ Prediction synced to Redis via fallback');
          }
          
          // Wait a moment for data to propagate
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.warn('⚠️ Sync failed, but continuing with refresh:', error);
        }
        
        // Call onSuccess callback - it will handle modal closing and navigation
        onSuccess?.();
        resetForm();
      };
      
      handleSuccess();
    }
  }, [isConfirmed, hash, onSuccess, onClose]);

  // Reset wagmi state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Reset form and errors when modal closes
      resetForm();
      // Reset wagmi state to clear any pending transactions
      if (resetWriteContract) {
        resetWriteContract();
      }
    }
  }, [isOpen, resetWriteContract]);

  const resetForm = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    setFormData({
      question: '',
      description: '',
      category: '',
      imageUrl: '',
      endDate: tomorrow.toISOString().split('T')[0],
      endTime: tomorrow.toTimeString().slice(0, 5),
      paymentToken: 'ETH',
      includeChart: false,
      selectedCrypto: ''
    });
    setErrors({});
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!formData.question.trim()) {
      newErrors.question = 'Question is required';
    } else if (formData.question.length > 200) {
      newErrors.question = 'Question must be 200 characters or less';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.category) {
      newErrors.category = 'Please select a category';
    }

    if (!formData.includeChart && !formData.imageUrl.trim()) {
      newErrors.imageUrl = 'Image URL is required when not using chart';
    }
    
    if (formData.includeChart && !formData.selectedCrypto) {
      newErrors.selectedCrypto = 'Please select a cryptocurrency for the chart';
    }

    // Validate end date/time
    const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
    const now = new Date();
    const hoursDiff = (endDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 1) {
      newErrors.endDate = 'End time must be at least 1 hour from now';
    } else if (hoursDiff > 8760) {
      newErrors.endDate = 'End time cannot be more than 1 year from now';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleApproveSwipe = async () => {
    if (!address || !swipeFee) return;

    try {
      // Add 10% slippage buffer to approval amount to handle price fluctuations
      const swipeFeeAmount = BigInt(swipeFee.toString());
      const approvalAmount = calculateApprovalAmount(swipeFeeAmount);
      
      console.log('💰 SWIPE Fee Approval Details:');
      console.log('  Fee amount:', swipeFeeAmount.toString(), 'wei');
      console.log('  Approval amount (with 10% buffer):', approvalAmount.toString(), 'wei');
      
      await writeContract({
        address: SWIPE_TOKEN.address as `0x${string}`,
        abi: [
          {
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            name: 'approve',
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function'
          }
        ],
        functionName: 'approve',
        args: [CONTRACTS.V2.address as `0x${string}`, approvalAmount],
      });
    } catch (error) {
      console.error('Approval failed:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !canCreate) return;

    try {
      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
      const durationHours = Math.ceil((endDateTime.getTime() - Date.now()) / (1000 * 60 * 60));
      
      // Generate image URL - use chart URL if chart is selected
      const selectedCryptoData = CRYPTO_OPTIONS.find(c => c.symbol === formData.selectedCrypto);
      let finalImageUrl = formData.imageUrl.trim();
      
      if (formData.includeChart && selectedCryptoData) {
        // Store the full GeckoTerminal URL
        finalImageUrl = `https://www.geckoterminal.com/${selectedCryptoData.chain}/pools/${selectedCryptoData.poolAddress}?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff`;
      }

      if (formData.paymentToken === 'ETH') {
        // ETH payment
        const value = canCreateFree ? BigInt(0) : (ethFee as bigint || BigInt(0));
        
        await writeContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'createPrediction',
          args: [
            formData.question.trim(),
            formData.description.trim(),
            formData.category,
            finalImageUrl,
            BigInt(durationHours)
          ],
          value
        });
      } else {
        // SWIPE payment
        if (!canCreateFree && swipeFee) {
          const currentAllowance = swipeAllowance as bigint || BigInt(0);
          if (currentAllowance < (swipeFee as bigint)) {
            alert('Please approve SWIPE tokens first');
            await handleApproveSwipe();
            return;
          }
        }

        await writeContract({
          address: CONTRACTS.V2.address as `0x${string}`,
          abi: CONTRACTS.V2.abi,
          functionName: 'createPredictionWithToken',
          args: [
            formData.question.trim(),
            formData.description.trim(),
            formData.category,
            finalImageUrl,
            BigInt(durationHours),
            SWIPE_TOKEN.address as `0x${string}`
          ]
        });
      }
    } catch (error) {
      console.error('Create prediction failed:', error);
      setErrors({ submit: 'Failed to create prediction. Please try again.' });
    }
  };

  if (!isOpen) return null;

  const needsSwipeApproval: boolean = formData.paymentToken === 'SWIPE' && 
    !canCreateFree && 
    swipeFee !== undefined && 
    swipeAllowance !== undefined &&
    (swipeAllowance as bigint) < (swipeFee as bigint);

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2>Create Prediction</h2>
          <button className="close-btn" onClick={onClose} disabled={isPending || isConfirming}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Question */}
          <div className="form-group">
            <label>Question *</label>
            <textarea
              value={formData.question}
              onChange={(e) => handleInputChange('question', e.target.value)}
              placeholder="Will Bitcoin reach $100,000 by end of 2024?"
              maxLength={200}
              rows={3}
              className={errors.question ? 'error' : ''}
            />
            {errors.question && <span className="error-message">{errors.question}</span>}
            <span className="char-count">{formData.question.length}/200</span>
          </div>

          {/* Description */}
          <div className="form-group">
            <label>Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Provide context and reasoning for your prediction..."
              rows={4}
              className={errors.description ? 'error' : ''}
            />
            {errors.description && <span className="error-message">{errors.description}</span>}
          </div>

          {/* Category */}
          <div className="form-group">
            <label>Category *</label>
            <select
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              className={errors.category ? 'error' : ''}
            >
              <option value="">Select a category</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {errors.category && <span className="error-message">{errors.category}</span>}
          </div>

          {/* Chart Selection */}
          <div className="form-group">
            <label>Crypto Chart (Optional)</label>
            <div className="chart-section">
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  id="includeChart"
                  checked={formData.includeChart}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    includeChart: e.target.checked,
                    imageUrl: e.target.checked ? '' : prev.imageUrl
                  }))}
                  className="checkbox"
                />
                <label htmlFor="includeChart" className="checkbox-label">
                  Include live crypto chart in prediction
                </label>
              </div>

              {formData.includeChart && (
                <div className="crypto-selection">
                  <div className="crypto-header">
                    <span className="crypto-header-text">Select Cryptocurrency</span>
                  </div>
                  <div className="crypto-grid">
                    {CRYPTO_OPTIONS.map(crypto => (
                      <button
                        key={crypto.symbol}
                        type="button"
                        onClick={() => handleInputChange('selectedCrypto', crypto.symbol)}
                        className={`crypto-btn ${formData.selectedCrypto === crypto.symbol ? 'selected' : ''}`}
                        style={{ borderColor: formData.selectedCrypto === crypto.symbol ? crypto.color : undefined }}
                      >
                        <span className="crypto-symbol">{crypto.symbol}</span>
                      </button>
                    ))}
                  </div>
                  {errors.selectedCrypto && (
                    <span className="error-message">{errors.selectedCrypto}</span>
                  )}
                  {formData.selectedCrypto && (
                    <div className="crypto-info">
                      <p className="crypto-info-text">
                        Selected: <strong>{CRYPTO_OPTIONS.find(c => c.symbol === formData.selectedCrypto)?.name}</strong>
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
          <div className="form-group">
            <label>Image URL {formData.includeChart ? '(Disabled when chart is selected)' : '*'}</label>
            <input
              type="url"
              value={formData.imageUrl}
              onChange={(e) => handleInputChange('imageUrl', e.target.value)}
              disabled={formData.includeChart}
              placeholder={formData.includeChart ? 'Chart will be used as image' : 'https://example.com/image.jpg'}
              className={`${errors.imageUrl ? 'error' : ''} ${formData.includeChart ? 'disabled' : ''}`}
            />
            {errors.imageUrl && !formData.includeChart && <span className="error-message">{errors.imageUrl}</span>}
            <p className="help-text">
              {formData.includeChart
                ? 'Chart image will be automatically generated and used'
                : 'Provide a URL to an image that represents your prediction'
              }
            </p>
          </div>

          {/* End Date/Time */}
          <div className="form-group">
            <label>End Date & Time *</label>
            <div className="datetime-inputs">
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => handleInputChange('endDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={errors.endDate ? 'error' : ''}
              />
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => handleInputChange('endTime', e.target.value)}
                className={errors.endDate ? 'error' : ''}
              />
            </div>
            {errors.endDate && <span className="error-message">{errors.endDate}</span>}
          </div>

          {/* User Status Info */}
          {address && (
            <div className="form-group">
              <div className="user-status-box">
                <h4>Your Status</h4>
                {isOwner ? (
                  <p className="status-info owner">👑 Contract Owner - Free creation</p>
                ) : isEnvAdmin ? (
                  <p className="status-info admin">🔧 Admin - Free creation</p>
                ) : isApprovedCreator ? (
                  <p className="status-info approved">✅ Approved Creator - Free creation</p>
                ) : publicCreationEnabled ? (
                  <p className="status-info public">👤 Public User - Creation fee required</p>
                ) : (
                  <p className="status-info restricted">🚫 Public creation is disabled</p>
                )}
              </div>
            </div>
          )}

          {/* Payment Token Selection */}
          <div className="form-group">
            <label>Payment Token * {canCreateFree && <span className="free-badge">FREE FOR YOU</span>}</label>
            <div className="token-selection">
              <button
                type="button"
                className={`token-btn ${formData.paymentToken === 'ETH' ? 'active' : ''}`}
                onClick={() => handleInputChange('paymentToken', 'ETH')}
              >
                <div className="token-logo-container">
                  <img src="/eth.png" alt="ETH" className="token-logo" />
                </div>
                <span className="token-name">ETH</span>
                <span className="token-fee">
                  {canCreateFree ? 'Free' : ethFee ? `${formatEther(ethFee as bigint)} ETH` : '0.0001 ETH'}
                </span>
              </button>
              <button
                type="button"
                className={`token-btn ${formData.paymentToken === 'SWIPE' ? 'active' : ''}`}
                onClick={() => handleInputChange('paymentToken', 'SWIPE')}
              >
                <div className="token-logo-container">
                  <img src="/logo.png" alt="SWIPE" className="token-logo swipe-logo" />
                </div>
                <span className="token-name">$SWIPE</span>
                <span className="token-fee">
                  {canCreateFree ? 'Free' : swipeFee ? `${formatEther(swipeFee as bigint)} SWIPE` : '20,000 SWIPE'}
                </span>
              </button>
            </div>

            {needsSwipeApproval ? (
              <div className="approval-notice">
                <span>⚠️ SWIPE approval needed</span>
                <button
                  type="button"
                  onClick={handleApproveSwipe}
                  className="approve-btn"
                  disabled={isPending}
                >
                  Approve SWIPE
                </button>
              </div>
            ) : null}
          </div>

          {/* Status Messages */}
          {!canCreate && (
            <div className="warning-box">
              <strong>⚠️ Cannot Create Prediction</strong>
              <p>Public creation is disabled. Only approved creators can create predictions.</p>
            </div>
          )}

          {writeError && (
            <div className="error-box">
              <strong>Error:</strong> {writeError.message}
            </div>
          )}

          {errors.submit && (
            <div className="error-box">{errors.submit}</div>
          )}

          {/* Submit Button */}
          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={isPending || isConfirming}>
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!canCreate || isPending || isConfirming}
              className="submit-btn"
            >
              {isPending || isConfirming ? 'Creating...' : 'Create Prediction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
