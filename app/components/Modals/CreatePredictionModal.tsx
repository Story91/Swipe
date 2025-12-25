"use client";

import React, { useState, useEffect } from 'react';
import { useWriteContract, useAccount, useReadContract, useWaitForTransactionReceipt, useChainId, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { base } from 'wagmi/chains';
import { CONTRACTS, SWIPE_TOKEN } from '../../../lib/contract';
import { calculateApprovalAmount } from '../../../lib/constants/approval';
import { Dialog, DialogContent } from '../../../components/ui/dialog';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Separator } from '../../../components/ui/separator';
import { Badge } from '../../../components/ui/badge';
import GradientText from '../../../components/GradientText';

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
  { symbol: 'BTC', name: 'Bitcoin', color: '#f7931a', poolAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', chain: 'eth' },
  { symbol: 'ETH', name: 'Ethereum', color: '#627eea', poolAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', chain: 'eth' },
  { symbol: 'SOL', name: 'Solana', color: '#9945ff', poolAddress: 'So11111111111111111111111111111111111111112', chain: 'solana' },
  { symbol: 'XRP', name: 'Ripple', color: '#23292f', poolAddress: '0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe', chain: 'bsc' },
  { symbol: 'BNB', name: 'Binance Coin', color: '#f3ba2f', poolAddress: '0xb8c77482e45f1f44de1745f52c74426c631bdd52', chain: 'eth' },
  { symbol: 'SWIPE', name: 'Swipe', color: '#d4ff00', poolAddress: '0xd0187d77af0ed6a44f0a631b406c78b30e160aa9', chain: 'base' }
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

  // Check if user is an approved creator
  const approver1 = process.env.NEXT_PUBLIC_APPROVER_1?.toLowerCase();
  const approver2 = process.env.NEXT_PUBLIC_APPROVER_2?.toLowerCase();
  const approver3 = process.env.NEXT_PUBLIC_APPROVER_3?.toLowerCase();
  const isApprovedCreator = address && (
    approver1 === address.toLowerCase() || 
    approver2 === address.toLowerCase() ||
    approver3 === address.toLowerCase()
  );

  const { data: contractOwner } = useReadContract({
    address: CONTRACTS.V2.address as `0x${string}`,
    abi: CONTRACTS.V2.abi,
    functionName: 'owner'
  });

  const { data: requiredApprovals } = useReadContract({
    address: CONTRACTS.V2.address as `0x${string}`,
    abi: CONTRACTS.V2.abi,
    functionName: 'requiredApprovals'
  });

  const { data: swipeAllowance } = useReadContract({
    address: SWIPE_TOKEN.address as `0x${string}`,
    abi: [{
      inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
      name: 'allowance',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    }],
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.V2.address as `0x${string}`] : undefined,
  });

  // User balances
  const { data: ethBalance } = useBalance({
    address: address,
    chainId: base.id
  });

  const { data: swipeBalance } = useReadContract({
    address: SWIPE_TOKEN.address as `0x${string}`,
    abi: [{
      inputs: [{ name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    }],
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  const formatBalance = (balance: bigint | undefined, isSwipe: boolean = false): string => {
    if (!balance) return '0';
    const formatted = formatEther(balance);
    const num = parseFloat(formatted);
    if (isSwipe) {
      if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
      return num.toFixed(0);
    }
    return num.toFixed(4);
  };

  const isOwner = address && contractOwner && address.toLowerCase() === (contractOwner as string).toLowerCase();
  const isEnvAdmin = address && process.env.NEXT_PUBLIC_ADMIN_1?.toLowerCase() === address.toLowerCase();
  const canCreateFree = Boolean(isOwner || isApprovedCreator || isEnvAdmin);
  const publicCreationEnabled = requiredApprovals !== undefined && Number(requiredApprovals) === 0;
  const canCreate = Boolean(publicCreationEnabled || canCreateFree);

  // Format fees for display
  const formatFee = (fee: bigint | undefined, isSwipe: boolean = false): string => {
    if (!fee) return isSwipe ? '5,000,000 SWIPE' : '0.001 ETH';
    const formatted = formatEther(fee);
    if (isSwipe) {
      const num = parseFloat(formatted);
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M SWIPE`;
      if (num >= 1000) return `${(num / 1000).toFixed(0)}K SWIPE`;
      return `${num.toFixed(0)} SWIPE`;
    }
    return `${formatted} ETH`;
  };

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
        
        try {
          console.log('⏳ Waiting for blockchain propagation before auto-sync...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          console.log('🔄 Auto-syncing new prediction to Redis...');
          const syncResponse = await fetch('/api/predictions/auto-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (syncResponse.ok) {
            console.log('✅ New prediction auto-synced to Redis');
          } else {
            await fetch('/api/sync');
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.warn('⚠️ Sync failed:', error);
        }
        
        onSuccess?.();
        resetForm();
      };
      
      handleSuccess();
    }
  }, [isConfirmed, hash, onSuccess]);

  useEffect(() => {
    if (!isOpen) {
      resetForm();
      if (resetWriteContract) resetWriteContract();
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

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
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
      const swipeFeeAmount = BigInt(swipeFee.toString());
      const approvalAmount = calculateApprovalAmount(swipeFeeAmount);
      
      await writeContract({
        address: SWIPE_TOKEN.address as `0x${string}`,
        abi: [{
          inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
          name: 'approve',
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function'
        }],
        functionName: 'approve',
        args: [CONTRACTS.V2.address as `0x${string}`, approvalAmount],
        chainId: base.id // Force Base network
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
      
      const selectedCryptoData = CRYPTO_OPTIONS.find(c => c.symbol === formData.selectedCrypto);
      let finalImageUrl = formData.imageUrl.trim();
      
      if (formData.includeChart && selectedCryptoData) {
        finalImageUrl = `https://www.geckoterminal.com/${selectedCryptoData.chain}/pools/${selectedCryptoData.poolAddress}?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff`;
      }

      if (formData.paymentToken === 'ETH') {
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
          value,
          chainId: base.id // Force Base network
        });
      } else {
        // SWIPE payment - requires token amount parameter
        const tokenAmount = canCreateFree ? BigInt(0) : (swipeFee as bigint || BigInt(0));
        
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
            SWIPE_TOKEN.address as `0x${string}`,
            tokenAmount // 7th parameter - _tokenAmount
          ],
          chainId: base.id // Force Base network
        });
      }
    } catch (error) {
      console.error('Create prediction failed:', error);
      setErrors({ submit: 'Failed to create prediction. Please try again.' });
    }
  };

  const needsSwipeApproval: boolean = formData.paymentToken === 'SWIPE' && 
    !canCreateFree && 
    swipeFee !== undefined && 
    swipeAllowance !== undefined &&
    (swipeAllowance as bigint) < (swipeFee as bigint);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-800 text-white p-4">
        
        {/* Compact Token Selector - Centered with Glow */}
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="relative">
            {/* Glowing border effect */}
            <div className={`absolute inset-0 rounded-xl blur-sm transition-all duration-300 ${
              formData.paymentToken === 'ETH' 
                ? 'bg-gradient-to-r from-blue-500/50 via-blue-400/30 to-blue-500/50' 
                : 'bg-gradient-to-r from-[#d4ff00]/50 via-[#a8cc00]/30 to-[#d4ff00]/50'
            }`} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            
            <div className="relative flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-700/50 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => handleInputChange('paymentToken', 'ETH')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                  formData.paymentToken === 'ETH'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/40'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
                }`}
              >
                <div className="relative">
                  <img src="/eth.png" alt="ETH" className="w-5 h-5 rounded-sm" />
                  <img 
                    src="/Base_square_blue.png" 
                    alt="Base" 
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-[2px] border border-zinc-900"
                  />
                </div>
                <GradientText 
                  colors={formData.paymentToken === 'ETH' 
                    ? ['#ffffff', '#e0e7ff', '#ffffff'] 
                    : ['#a1a1aa', '#71717a', '#a1a1aa']
                  }
                  animationSpeed={3}
                  showBorder={false}
                >
                  <span className="font-bold">Base ETH</span>
                </GradientText>
              </button>
              <button
                type="button"
                onClick={() => handleInputChange('paymentToken', 'SWIPE')}
                className={`group flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                  formData.paymentToken === 'SWIPE'
                    ? 'bg-gradient-to-r from-[#d4ff00] to-[#b8e000] text-black shadow-lg shadow-[#d4ff00]/40'
                    : 'bg-transparent hover:bg-black border border-transparent hover:border-[#d4ff00]/50'
                }`}
              >
                <img src="/logo.png" alt="SWIPE" className="w-4 h-4 rounded-full" />
                <span className={`font-bold transition-colors duration-300 ${
                  formData.paymentToken === 'SWIPE'
                    ? 'text-black'
                    : 'text-zinc-400 group-hover:text-[#d4ff00]'
                }`}>SWIPE</span>
              </button>
            </div>
          </div>
          
          {canCreateFree && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0.5">
              ✨ FREE FOR YOU
            </Badge>
          )}
        </div>

        {/* Compact Fee Display - Smaller */}
        {formData.paymentToken === 'ETH' ? (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg px-2.5 py-1.5 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-[10px]">⟠</span>
                </div>
                <p className="text-[10px] text-blue-400 font-medium">
                  {canCreateFree ? 'Free' : `Fee: ${formatFee(ethFee as bigint | undefined, false)}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-zinc-500">Bal:</span>
                <span className="text-[10px] font-mono text-blue-400">{formatBalance(ethBalance?.value, false)} ETH</span>
              </div>
            </div>
            {/* User status - small print */}
            <p className={`text-[8px] mt-1 ${
              isOwner ? 'text-amber-400' :
              isEnvAdmin ? 'text-purple-400' :
              isApprovedCreator ? 'text-emerald-400' :
              publicCreationEnabled ? 'text-zinc-500' :
              'text-red-400'
            }`}>
              {isOwner ? '👑 Owner - Free' :
               isEnvAdmin ? '🔧 Admin - Free' :
               isApprovedCreator ? '✅ Approved - Free' :
               publicCreationEnabled ? '👤 Public User - Fee required' :
               '🚫 Creation disabled'}
            </p>
          </div>
        ) : (
          <div className="bg-[#d4ff00]/5 border border-[#d4ff00]/20 rounded-lg px-2.5 py-1.5 mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[#d4ff00]/20 flex items-center justify-center">
                  <span className="text-[10px]">💎</span>
                </div>
                <p className="text-[10px] text-[#d4ff00] font-medium">
                  {canCreateFree ? 'Free' : `Fee: ${formatFee(swipeFee as bigint | undefined, true)}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-zinc-500">Bal:</span>
                <span className="text-[10px] font-mono text-[#d4ff00]">{formatBalance(swipeBalance as bigint | undefined, true)} SWIPE</span>
              </div>
            </div>
            {/* User status - small print */}
            <p className={`text-[8px] mt-1 ${
              isOwner ? 'text-amber-400' :
              isEnvAdmin ? 'text-purple-400' :
              isApprovedCreator ? 'text-emerald-400' :
              publicCreationEnabled ? 'text-zinc-500' :
              'text-red-400'
            }`}>
              {isOwner ? '👑 Owner - Free' :
               isEnvAdmin ? '🔧 Admin - Free' :
               isApprovedCreator ? '✅ Approved - Free' :
               publicCreationEnabled ? '👤 Public User - Fee required' :
               '🚫 Creation disabled'}
            </p>
          </div>
        )}

        {/* SWIPE Approval Notice */}
        {needsSwipeApproval && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5 mb-2">
            <span className="text-amber-400 text-[10px]">⚠️ Approval needed</span>
            <Button 
              size="sm" 
              onClick={handleApproveSwipe}
              disabled={isPending}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-[10px] h-6 px-2"
            >
              Approve
            </Button>
          </div>
        )}

        <Separator className="bg-zinc-800 mb-2" />

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Question */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#d4ff00]">Question *</label>
            <textarea
              value={formData.question}
              onChange={(e) => handleInputChange('question', e.target.value)}
              placeholder="Will Bitcoin reach $100,000 by end of 2024?"
              maxLength={200}
              rows={2}
              className={`w-full px-3 py-2 bg-black/60 border ${errors.question ? 'border-red-500' : 'border-[#d4ff00]/30'} rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#d4ff00]/50 focus:border-[#d4ff00] resize-none transition-all`}
            />
            {errors.question && <p className="text-red-400 text-xs">{errors.question}</p>}
            <p className="text-[#d4ff00]/50 text-xs text-right font-mono">{formData.question.length}/200</p>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#d4ff00]">Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Provide context and reasoning..."
              rows={3}
              className={`w-full px-3 py-2 bg-black/60 border ${errors.description ? 'border-red-500' : 'border-[#d4ff00]/30'} rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#d4ff00]/50 focus:border-[#d4ff00] resize-none transition-all`}
            />
            {errors.description && <p className="text-red-400 text-xs">{errors.description}</p>}
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#d4ff00]">Category *</label>
            <select
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              className={`w-full px-3 py-2 bg-black/60 border ${errors.category ? 'border-red-500' : 'border-[#d4ff00]/30'} rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#d4ff00]/50 focus:border-[#d4ff00] transition-all`}
            >
              <option value="">Select a category</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {errors.category && <p className="text-red-400 text-xs">{errors.category}</p>}
          </div>

          {/* Chart Selection */}
          <Card className="bg-gradient-to-br from-[#d4ff00]/5 to-black/40 border-[#d4ff00]/20">
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="includeChart"
                  checked={formData.includeChart}
                  onChange={(e) => {
                    handleInputChange('includeChart', e.target.checked);
                    if (e.target.checked) handleInputChange('imageUrl', '');
                  }}
                  className="w-4 h-4 rounded border-[#d4ff00]/50 bg-black text-[#d4ff00] focus:ring-[#d4ff00] accent-[#d4ff00]"
                />
                <label htmlFor="includeChart" className="text-sm text-white cursor-pointer font-medium">
                  📊 Include live crypto chart
                </label>
              </div>

              {formData.includeChart && (
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {CRYPTO_OPTIONS.map(crypto => (
                    <button
                      key={crypto.symbol}
                      type="button"
                      onClick={() => handleInputChange('selectedCrypto', crypto.symbol)}
                      className={`p-2 rounded-lg border-2 transition-all duration-200 ${
                        formData.selectedCrypto === crypto.symbol 
                          ? 'border-[#d4ff00] bg-[#d4ff00]/20 text-[#d4ff00] shadow-lg shadow-[#d4ff00]/20' 
                          : 'border-zinc-600 hover:border-[#d4ff00]/50 hover:bg-[#d4ff00]/5 text-zinc-300'
                      }`}
                    >
                      <span className="font-bold text-sm">{crypto.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
              {errors.selectedCrypto && <p className="text-red-400 text-xs">{errors.selectedCrypto}</p>}
            </CardContent>
          </Card>

          {/* Image URL */}
          {!formData.includeChart && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#d4ff00]">Image URL *</label>
              <Input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => handleInputChange('imageUrl', e.target.value)}
                placeholder="https://example.com/image.jpg"
                className={`bg-black/60 border-[#d4ff00]/30 text-white focus:ring-[#d4ff00]/50 focus:border-[#d4ff00] ${errors.imageUrl ? 'border-red-500' : ''}`}
              />
              {errors.imageUrl && <p className="text-red-400 text-xs">{errors.imageUrl}</p>}
            </div>
          )}

          {/* End Date/Time */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#d4ff00]">End Date & Time *</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => handleInputChange('endDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={`bg-black/60 border-[#d4ff00]/30 text-white focus:ring-[#d4ff00]/50 focus:border-[#d4ff00] ${errors.endDate ? 'border-red-500' : ''}`}
              />
              <Input
                type="time"
                value={formData.endTime}
                onChange={(e) => handleInputChange('endTime', e.target.value)}
                className={`bg-black/60 border-[#d4ff00]/30 text-white focus:ring-[#d4ff00]/50 focus:border-[#d4ff00] ${errors.endDate ? 'border-red-500' : ''}`}
              />
            </div>
            {errors.endDate && <p className="text-red-400 text-xs">{errors.endDate}</p>}
          </div>

          {/* Error Messages */}
          {!canCreate && (
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-3">
                <p className="text-red-400 text-sm font-medium">
                  ⚠️ Public creation is disabled. Only approved creators can create predictions.
                </p>
              </CardContent>
            </Card>
          )}

          {writeError && (
            <Card className="bg-red-500/10 border-red-500/30 overflow-hidden">
              <CardContent className="p-3">
                <p className="text-red-400 text-xs break-words whitespace-pre-wrap overflow-hidden" style={{ wordBreak: 'break-all', maxHeight: '80px', overflowY: 'auto' }}>
                  ❌ {writeError.message.length > 150 ? writeError.message.substring(0, 150) + '...' : writeError.message}
                </p>
              </CardContent>
            </Card>
          )}

          {errors.submit && (
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-3">
                <p className="text-red-400 text-sm">{errors.submit}</p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isPending || isConfirming}
              className="flex-1 bg-[#d4ff00] border-[#d4ff00] text-black font-semibold hover:bg-black hover:text-[#d4ff00] hover:border-[#d4ff00] transition-all duration-300"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={!canCreate || isPending || isConfirming}
              className={`flex-1 font-semibold ${
                formData.paymentToken === 'ETH'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                  : 'bg-gradient-to-r from-[#d4ff00] to-[#a8cc00] text-black hover:from-[#c4ef00] hover:to-[#98bc00]'
              }`}
            >
              {isPending || isConfirming ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span> Creating...
                </span>
              ) : (
                `Create with ${formData.paymentToken}`
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
