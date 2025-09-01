"use client";

import React, { useState, useEffect } from 'react';
import { useWriteContract, useAccount, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../lib/contract';

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
    durationInHours: 24,
    customDuration: false,
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

  const isOwner = address === contractOwner;

  // Debug logging - tylko gdy wartości się zmieniają
  useEffect(() => {
    // Log tylko gdy wszystkie wartości są dostępne (nie undefined)
    if (address && contractOwner !== undefined && isApprovedCreator !== undefined && creationFee !== undefined) {
      console.log('Debug info:', {
        address,
        contractOwner,
        isOwner,
        isApprovedCreator,
        creationFee: creationFee?.toString()
      });
    }
  }, [address, contractOwner, isOwner, isApprovedCreator, creationFee]);

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

  const durationOptions = [
    { value: 6, label: '6 Hours' },
    { value: 12, label: '12 Hours' },
    { value: 24, label: '1 Day' },
    { value: 72, label: '3 Days' },
    { value: 168, label: '1 Week' },
    { value: 720, label: '1 Month' }
  ];

  const handleInputChange = (field: string, value: string | number) => {
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

    if (formData.durationInHours < 1 || formData.durationInHours > 8760) {
      newErrors.durationInHours = 'Duration must be between 1 hour and 1 year';
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

      console.log('Transaction value:', value.toString(), 'isOwner:', isOwner, 'isApprovedCreator:', isApprovedCreator);

      await writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'createPrediction',
        args: [
          formData.question.trim(),
          formData.description.trim(),
          formData.category.trim(),
          formData.imageUrl.trim(),
          BigInt(formData.durationInHours)
        ],
        value
      });

      onSuccess?.();
      onClose();
      // Reset form
      setFormData({
        question: '',
        description: '',
        category: '',
        imageUrl: '',
        durationInHours: 24,
        customDuration: false,
        includeChart: false,
        selectedCrypto: ''
      });
    } catch (error) {
      console.error('Failed to create prediction:', error);
      setErrors({ submit: 'Failed to create prediction. Please try again.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Create New Prediction</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Question */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Question *
              </label>
              <textarea
                value={formData.question}
                onChange={(e) => handleInputChange('question', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.question ? 'border-red-500' : 'border-gray-300'
                }`}
                rows={3}
                placeholder="Will Bitcoin reach $100,000 by end of 2024?"
                maxLength={200}
              />
              {errors.question && (
                <p className="mt-1 text-sm text-red-600">{errors.question}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                {formData.question.length}/200 characters
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
                rows={4}
                placeholder="Provide context, analysis, and reasoning for your prediction..."
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.category ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select a category</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-sm text-red-600">{errors.category}</p>
              )}
            </div>

            {/* Chart Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Crypto Chart (Optional)
              </label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="includeChart"
                    checked={formData.includeChart}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      includeChart: e.target.checked,
                      imageUrl: e.target.checked ? '' : prev.imageUrl // Clear image when chart is enabled
                    }))}
                    className="rounded"
                  />
                  <label htmlFor="includeChart" className="text-sm text-gray-700">
                    Include live crypto chart in prediction
                  </label>
                </div>

                {formData.includeChart && (
                  <div className="ml-6">
                    <label className="block text-sm text-gray-600 mb-2">
                      Select Cryptocurrency *
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {cryptoOptions.map(crypto => (
                        <button
                          key={crypto.symbol}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, selectedCrypto: crypto.symbol }))}
                          className={`flex items-center space-x-2 px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                            formData.selectedCrypto === crypto.symbol
                              ? 'bg-blue-100 border-blue-500 text-blue-700'
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                          style={{ borderColor: formData.selectedCrypto === crypto.symbol ? crypto.color : undefined }}
                        >
                          <span>{crypto.icon}</span>
                          <span>{crypto.symbol}</span>
                        </button>
                      ))}
                    </div>
                    {errors.selectedCrypto && (
                      <p className="mt-1 text-sm text-red-600">{errors.selectedCrypto}</p>
                    )}
                    {formData.selectedCrypto && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-md">
                        <p className="text-sm text-gray-600">
                          Selected: <strong>{cryptoOptions.find(c => c.symbol === formData.selectedCrypto)?.name}</strong>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Live chart will be embedded in your prediction
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image URL {formData.includeChart ? '(Disabled when chart is selected)' : '*'}
              </label>
              <input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => handleInputChange('imageUrl', e.target.value)}
                disabled={formData.includeChart}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  formData.includeChart
                    ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
                    : errors.imageUrl
                    ? 'border-red-500'
                    : 'border-gray-300'
                }`}
                placeholder={formData.includeChart ? 'Chart will be used as image' : 'https://example.com/image.jpg'}
              />
              {errors.imageUrl && !formData.includeChart && (
                <p className="mt-1 text-sm text-red-600">{errors.imageUrl}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                {formData.includeChart
                  ? 'Chart image will be automatically generated and used'
                  : 'Provide a URL to an image that represents your prediction'
                }
              </p>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prediction Duration *
              </label>
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {durationOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleInputChange('durationInHours', option.value)}
                      className={`px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                        formData.durationInHours === option.value
                          ? 'bg-blue-100 border-blue-500 text-blue-700'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="customDuration"
                    checked={formData.customDuration}
                    onChange={(e) => setFormData(prev => ({ ...prev, customDuration: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="customDuration" className="text-sm text-gray-700">
                    Custom duration
                  </label>
                </div>

                {formData.customDuration && (
                  <div>
                    <input
                      type="number"
                      value={formData.durationInHours}
                      onChange={(e) => handleInputChange('durationInHours', parseInt(e.target.value) || 0)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.durationInHours ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Hours"
                      min="1"
                      max="8760"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Enter duration in hours (1-8760, max 1 year)
                    </p>
                  </div>
                )}
              </div>
              {errors.durationInHours && (
                <p className="mt-1 text-sm text-red-600">{errors.durationInHours}</p>
              )}
            </div>



            {/* Fee Information */}
            {address && !isOwner && !isApprovedCreator && creationFee && publicCreationEnabled && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Creation Fee Required
                    </h3>
                    <p className="mt-1 text-sm text-yellow-700">
                      You need to pay {(Number(creationFee) / 1e18).toFixed(4)} ETH to create this prediction.
                      Approved creators don't need to pay this fee.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Public Creation Disabled Warning */}
            {address && !isOwner && !isApprovedCreator && !publicCreationEnabled && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      ⚠️ Cannot Create Prediction
                    </h3>
                    <p className="mt-1 text-sm text-red-700">
                      <strong>Public creation is currently disabled.</strong> Only approved creators can create predictions.
                      <br />
                      <span className="text-xs text-red-600 mt-1 block">
                        Contact the contract owner to enable public creation or request approved creator status.
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Error */}
            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-600">{errors.submit}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || (!isOwner && !isApprovedCreator && !publicCreationEnabled)}
                className={`px-6 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  isPending || (!isOwner && !isApprovedCreator && !publicCreationEnabled)
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isPending ? 'Creating...' : 'Create Prediction'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
