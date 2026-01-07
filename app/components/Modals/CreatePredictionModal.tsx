"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWriteContract, useAccount, useReadContract, useWaitForTransactionReceipt, useChainId, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { base } from 'wagmi/chains';
import { CONTRACTS, SWIPE_TOKEN } from '../../../lib/contract';
import { calculateApprovalAmount } from '../../../lib/constants/approval';
import { uploadToImgBB } from '../../../lib/imgbb';
import { Dialog, DialogContent } from '../../../components/ui/dialog';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Separator } from '../../../components/ui/separator';
import { Badge } from '../../../components/ui/badge';
import GradientText from '../../../components/GradientText';
import { useComposeCast, useMiniKit } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';

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
  const { composeCast: minikitComposeCast } = useComposeCast();
  const { context } = useMiniKit();
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successTxHash, setSuccessTxHash] = useState<string>('');
  const [createdQuestion, setCreatedQuestion] = useState<string>('');
  
  // Universal share function - works on both MiniKit (Base app) and Farcaster SDK (Warpcast)
  const composeCast = useCallback(async (params: { text: string; embeds?: string[] }) => {
    try {
      if (minikitComposeCast) {
        console.log('📱 Using MiniKit composeCast...');
        const embedsParam = params.embeds?.slice(0, 2) as [] | [string] | [string, string] | undefined;
        await minikitComposeCast({ text: params.text, embeds: embedsParam });
        return;
      }
    } catch (error) {
      console.log('MiniKit composeCast failed, trying Farcaster SDK...', error);
    }
    
    try {
      console.log('📱 Using Farcaster SDK composeCast...');
      await sdk.actions.composeCast({
        text: params.text,
        embeds: params.embeds?.map(url => ({ url })) as any
      });
    } catch (error) {
      console.error('Both composeCast methods failed:', error);
      throw error;
    }
  }, [minikitComposeCast]);
  
  // Share created prediction
  const shareCreatedPrediction = async () => {
    const appUrl = 'https://theswipe.app';
    const shareText = `🎯 I just created a new prediction on SWIPE!\n\n"${createdQuestion}"\n\nWill it happen? Cast your vote! 👀\n\nJoin the prediction market on Base:`;
    
    try {
      await composeCast({
        text: shareText,
        embeds: [appUrl]
      });
      setShowSuccessModal(false);
    } catch (error) {
      console.error('Share failed:', error);
    }
  };
  
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
  
  // Image upload states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const approver4 = process.env.NEXT_PUBLIC_APPROVER_4?.toLowerCase();
  const isApprovedCreator = address && (
    approver1 === address.toLowerCase() || 
    approver2 === address.toLowerCase() ||
    approver3 === address.toLowerCase() ||
    approver4 === address.toLowerCase()
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

  // Track if transaction was already handled to prevent duplicate processing
  const [transactionHandled, setTransactionHandled] = useState(false);

  // Handle successful transaction
  useEffect(() => {
    if (isConfirmed && hash && !transactionHandled) {
      setTransactionHandled(true); // Prevent duplicate handling
      
      const handleSuccess = async () => {
        // Save data for success modal
        setSuccessTxHash(hash);
        setCreatedQuestion(formData.question);
        
        // Close create modal and show success modal
        onClose();
        setShowSuccessModal(true);
        
        // Cache user's Farcaster profile to Redis (reduces Neynar API calls)
        if (address && context?.user) {
          try {
            console.log('💾 Caching user Farcaster profile to Redis...');
            fetch('/api/farcaster/cache-profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                address: address,
                profile: context.user
              })
            }).catch(err => console.warn('Profile cache failed:', err));
          } catch (error) {
            console.warn('Failed to cache user profile:', error);
          }
        }
        
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
  }, [isConfirmed, hash, onSuccess, transactionHandled, onClose, formData.question]);

  useEffect(() => {
    if (!isOpen) {
      resetForm();
      setTransactionHandled(false); // Reset for next time modal opens
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
    // Reset image upload states
    setUploadedImageUrl('');
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate image is 1:1 aspect ratio
  const validateImageAspectRatio = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        // Allow some tolerance (0.95 - 1.05 for near-square images)
        const isSquare = aspectRatio >= 0.95 && aspectRatio <= 1.05;
        URL.revokeObjectURL(img.src);
        resolve(isSquare);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(false);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle image upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, imageUrl: 'Please select an image file' }));
      return;
    }

    // Check file size (max 32MB for ImgBB)
    if (file.size > 32 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, imageUrl: 'Image must be less than 32MB' }));
      return;
    }

    // Validate 1:1 aspect ratio
    const isSquare = await validateImageAspectRatio(file);
    if (!isSquare) {
      setErrors(prev => ({ ...prev, imageUrl: '⚠️ Image must be square (1:1 aspect ratio)' }));
      return;
    }

    // Create preview
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    // Upload to ImgBB
    setIsUploading(true);
    setErrors(prev => ({ ...prev, imageUrl: '' }));

    try {
      const response = await uploadToImgBB(file);
      setUploadedImageUrl(response.data.display_url);
      handleInputChange('imageUrl', response.data.display_url);
    } catch (error) {
      console.error('Upload failed:', error);
      setErrors(prev => ({ ...prev, imageUrl: 'Failed to upload image. Please try again.' }));
      setImagePreview('');
    } finally {
      setIsUploading(false);
    }
  };

  // Clear uploaded image
  const clearUploadedImage = () => {
    setUploadedImageUrl('');
    setImagePreview('');
    handleInputChange('imageUrl', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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


  // State for tracking if we're in approval phase
  const [isApproving, setIsApproving] = useState(false);

  // Helper function to execute the actual prediction creation
  const executeCreatePrediction = async () => {
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
        chainId: base.id
      });
    } else {
      const tokenAmount = canCreateFree ? BigInt(0) : (swipeFee as bigint || BigInt(0));

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
          tokenAmount
        ],
        chainId: base.id
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !canCreate) return;

    try {
      // For SWIPE payment, check if approval is needed first
      if (formData.paymentToken === 'SWIPE' && !canCreateFree && swipeFee) {
        const currentAllowance = swipeAllowance as bigint || BigInt(0);
        const requiredAmount = swipeFee as bigint;
        
        if (currentAllowance < requiredAmount) {
          // Need approval first - do approve then create (like TinderCard)
          setIsApproving(true);
          
          const approvalAmount = calculateApprovalAmount(requiredAmount);
          
          writeContract({
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
            chainId: base.id
          }, {
            onSuccess: async () => {
              console.log('✅ SWIPE approval successful, now creating prediction...');
              setIsApproving(false);
              
              // Wait a moment for approval to be mined, then create prediction
              setTimeout(async () => {
                try {
                  await executeCreatePrediction();
                } catch (error) {
                  console.error('Create prediction after approval failed:', error);
                  setErrors({ submit: 'Failed to create prediction after approval. Please try again.' });
                }
              }, 2000);
            },
            onError: (error) => {
              console.error('❌ SWIPE approval failed:', error);
              setIsApproving(false);
              setErrors({ submit: 'SWIPE approval failed. Please try again.' });
            }
          });
          
          return; // Don't proceed yet, wait for approval callback
        }
      }

      // ETH payment or SWIPE already approved - create directly
      await executeCreatePrediction();
    } catch (error) {
      console.error('Create prediction failed:', error);
      setErrors({ submit: 'Failed to create prediction. Please try again.' });
    }
  };

  return (
    <>
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
                  <div className="w-5 h-5 rounded-sm bg-gradient-to-br from-[#627eea] to-[#3c3c3d] flex items-center justify-center">
                    <svg className="w-3 h-3" viewBox="0 0 256 417" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M127.961 0L125.166 9.5V285.168L127.961 287.958L255.923 212.32L127.961 0Z" fill="white" fillOpacity="0.9"/>
                      <path d="M127.962 0L0 212.32L127.962 287.959V154.158V0Z" fill="white"/>
                      <path d="M127.961 312.187L126.386 314.107V412.306L127.961 416.905L255.999 236.587L127.961 312.187Z" fill="white" fillOpacity="0.9"/>
                      <path d="M127.962 416.905V312.187L0 236.587L127.962 416.905Z" fill="white"/>
                    </svg>
                  </div>
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

          {/* Image Upload */}
          {!formData.includeChart && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#d4ff00]">Image * <span className="text-zinc-500 font-normal">(1:1 square)</span></label>
              
              {/* Upload area or Preview */}
              {imagePreview || uploadedImageUrl ? (
                <div className="relative w-full aspect-square max-w-[200px] mx-auto">
                  <img 
                    src={imagePreview || uploadedImageUrl} 
                    alt="Preview" 
                    className="w-full h-full object-cover rounded-lg border-2 border-[#d4ff00]/50"
                  />
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/70 rounded-lg flex items-center justify-center">
                      <div className="text-center">
                        <span className="animate-spin text-2xl block mb-1">⏳</span>
                        <span className="text-[#d4ff00] text-xs">Uploading...</span>
                      </div>
                    </div>
                  )}
                  {uploadedImageUrl && !isUploading && (
                    <div className="absolute top-1 right-1 flex gap-1">
                      <span className="bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded-full">✓ Uploaded</span>
                      <button
                        type="button"
                        onClick={clearUploadedImage}
                        className="bg-red-500 hover:bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-square max-w-[200px] mx-auto border-2 border-dashed border-[#d4ff00]/30 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[#d4ff00]/60 hover:bg-[#d4ff00]/5 transition-all"
                >
                  <span className="text-3xl mb-2">📷</span>
                  <span className="text-[#d4ff00] text-xs font-medium">Click to upload</span>
                  <span className="text-zinc-500 text-[10px] mt-1">1:1 square only</span>
                </div>
              )}
              
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              {/* Or use URL */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-zinc-700"></div>
                <span className="text-zinc-500 text-[10px]">or paste URL</span>
                <div className="flex-1 h-px bg-zinc-700"></div>
              </div>
              
              <Input
                type="url"
                value={formData.imageUrl}
                onChange={(e) => {
                  handleInputChange('imageUrl', e.target.value);
                  // Clear uploaded image if user types URL manually
                  if (e.target.value !== uploadedImageUrl) {
                    setUploadedImageUrl('');
                    setImagePreview('');
                  }
                }}
                placeholder="https://example.com/image.jpg"
                className={`bg-black/60 border-[#d4ff00]/30 text-white focus:ring-[#d4ff00]/50 focus:border-[#d4ff00] text-xs ${errors.imageUrl ? 'border-red-500' : ''}`}
              />
              {errors.imageUrl && <p className="text-red-400 text-xs">{errors.imageUrl}</p>}
            </div>
          )}

          {/* Mini Card Preview */}
          {(formData.question.trim() || formData.imageUrl || formData.includeChart) && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#d4ff00]">📱 Card Preview</label>
              <div className="relative w-full max-w-[280px] mx-auto bg-white rounded-2xl overflow-hidden shadow-xl border border-zinc-200">
                {/* Image/Chart Section */}
                <div className="relative aspect-square bg-zinc-100">
                  {formData.includeChart && formData.selectedCrypto ? (
                    (() => {
                      const selectedCryptoData = CRYPTO_OPTIONS.find(c => c.symbol === formData.selectedCrypto);
                      if (selectedCryptoData) {
                        const chartUrl = `https://www.geckoterminal.com/${selectedCryptoData.chain}/pools/${selectedCryptoData.poolAddress}?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d`;
                        return (
                          <iframe
                            src={chartUrl}
                            title={`${formData.selectedCrypto} Chart`}
                            className="w-full h-full border-0"
                            allow="clipboard-write"
                            sandbox="allow-scripts allow-same-origin"
                          />
                        );
                      }
                      return (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                          <div className="text-center">
                            <span className="text-4xl block mb-2">📊</span>
                            <span className="text-white text-xs font-mono">Select crypto...</span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (imagePreview || uploadedImageUrl || formData.imageUrl) ? (
                    <img 
                      src={imagePreview || uploadedImageUrl || formData.imageUrl} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-200 to-zinc-300">
                      <span className="text-6xl opacity-30">🖼️</span>
                    </div>
                  )}
                  {/* Category Badge */}
                  {formData.category && (
                    <div className="absolute bottom-2 left-2">
                      <span className="bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                        {formData.category}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Content Section */}
                <div className="p-3 bg-white">
                  <h3 className="text-sm font-bold text-zinc-900 line-clamp-2 min-h-[40px]">
                    {formData.question.trim() || 'Your prediction question...'}
                  </h3>
                  
                  {/* Countdown placeholder */}
                  <div className="flex items-center justify-center gap-1.5 mt-2 py-1.5 px-3 bg-zinc-100 rounded-full mx-auto w-fit">
                    <span className="text-rose-500 text-xs">⏰</span>
                    <span className="text-zinc-700 text-[11px] font-semibold tracking-wide">
                      {formData.endDate && formData.endTime 
                        ? `${formData.endDate} • ${formData.endTime}` 
                        : 'Set deadline...'}
                    </span>
                  </div>
                </div>
                
                {/* Voting Bar - 50/50 */}
                <div className="h-6 flex">
                  <div className="flex-1 bg-gradient-to-r from-rose-500 to-rose-400 flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">NO 50%</span>
                  </div>
                  <div className="flex-1 bg-gradient-to-r from-emerald-400 to-emerald-500 flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">YES 50%</span>
                  </div>
                </div>
              </div>
              <p className="text-center text-zinc-500 text-[9px]">This is how your prediction will look</p>
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
              disabled={!canCreate || isPending || isConfirming || transactionHandled || isApproving}
              className={`flex-1 font-semibold ${
                formData.paymentToken === 'ETH'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                  : 'bg-gradient-to-r from-[#d4ff00] to-[#a8cc00] text-black hover:from-[#c4ef00] hover:to-[#98bc00]'
              }`}
            >
              {isApproving ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span> Approving...
                </span>
              ) : isPending || isConfirming ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span> Creating...
                </span>
              ) : formData.paymentToken === 'SWIPE' && !canCreateFree ? (
                `Approve & Create with SWIPE`
              ) : (
                `Create with ${formData.paymentToken}`
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {/* Success Modal - Similar to TinderCard share prompt */}
    {showSuccessModal && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 border border-[#d4ff00]/30 rounded-3xl p-7 max-w-sm w-full text-center relative animate-in fade-in zoom-in duration-300">
          {/* Close button */}
          <button 
            onClick={() => setShowSuccessModal(false)}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition-all"
          >
            ✕
          </button>
          
          {/* Header with logos */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <img src="/farc.png" alt="Farcaster" className="w-10 h-10 rounded-lg" />
            <span className="text-zinc-500 text-lg">×</span>
            <img src="/Base_square_blue.png" alt="Base" className="w-10 h-10 rounded-lg" />
          </div>
          
          {/* Success icon */}
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[#d4ff00] to-[#a8cc00] flex items-center justify-center shadow-lg shadow-[#d4ff00]/30">
              <span className="text-3xl text-black font-bold">✓</span>
            </div>
          </div>
          
          {/* Title */}
          <h2 className="text-xl font-bold text-white mb-1">Congratulations!</h2>
          <p className="text-[#d4ff00] font-semibold mb-3">Prediction created successfully!</p>
          
          {/* Question preview */}
          <p className="text-zinc-400 text-sm mb-4 line-clamp-2 px-2">
            "{createdQuestion}"
          </p>
          
          {/* Transaction link */}
          <a 
            href={`https://basescan.org/tx/${successTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 underline mb-5 block"
          >
            View on Basescan →
          </a>
          
          {/* Description */}
          <p className="text-zinc-500 text-sm mb-5">Share your prediction and challenge your friends!</p>
          
          {/* Share button */}
          <button 
            onClick={shareCreatedPrediction}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#d4ff00] to-[#a8cc00] text-black font-bold text-base flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#d4ff00]/40 hover:-translate-y-0.5 transition-all duration-300"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </button>
          
          {/* Skip link */}
          <button 
            onClick={() => setShowSuccessModal(false)}
            className="mt-4 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    )}
    </>
  );
}
