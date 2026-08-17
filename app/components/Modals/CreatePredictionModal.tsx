"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useActiveChain } from '@/lib/chains/activeChain';
import { useMarketWrite } from '@/lib/chains/useMarketWrite';
import { PROPOSAL_HEADERS, buildProposalMessage } from '@/lib/auth/proposalMessage';
import { uploadToImgBB } from '../../../lib/imgbb';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog';
import { useComposeCast } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';
import './CreatePredictionModal.css';

/**
 * Propose a market.
 *
 * Nothing in this component touches a contract. V2 minted from here: a public
 * createPrediction, a fee paid in ETH or $SWIPE, a token approval before the
 * $SWIPE path, and the contract's own counter for the id. V4 has no public
 * creation, no creation fee, and registerPrediction is onlyRegistrar, so the
 * form writes a signed proposal and a resolver registers it later.
 *
 * Everything that survived from the paying version was display. Four reads hit
 * CONTRACTS.V2, the archived Base contract whose owner key is lost, and two of
 * the functions they called (creationFees, requiredApprovals) do not exist in
 * V4's ABI at all. They fed a token toggle, a fee strip, a balance and a button
 * label, and gated nothing: canCreate was already just "is a wallet connected".
 * A useWaitForTransactionReceipt sat waiting on a hash that could never be
 * produced, so the effect that opened the success modal could never fire.
 *
 * What replaced the fee is the rate limit in the propose route: five per address
 * per day, and a cap on how many proposals may sit unregistered at once. A
 * proposal is inert until registration, so the exposure is Redis writes rather
 * than money.
 *
 * The signature proves only that the creator address belongs to whoever sent
 * the request, which matters because that address earns the creator fee on
 * every losing pool in the market. It is not an admin check. The question and
 * deadline are inside the signed string, so a captured header cannot be
 * replayed with a different question, and it is signed immediately before the
 * fetch: the server allows five minutes and refuses a timestamp more than
 * thirty seconds ahead, so nothing slow may sit between the two.
 */

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
  // The selected chain, not the build-time default. It goes in the body: the
  // route's chainFromRequestOrBody falls back to Base when it is absent, so a
  // proposal made with Robinhood selected used to land in Base's keyspace and
  // could never be registered against the contract the user was looking at.
  const { chainKey } = useActiveChain();
  // Resolves the V3 market this proposal will eventually be registered against.
  // Nothing here writes to it; the resolver does that from the admin surface.
  // Kept because a chain with no market can never have this proposal
  // registered, and the form should say so rather than accept it.
  const marketWrite = useMarketWrite();
  const { signMessageAsync } = useSignMessage();
  const { composeCast: minikitComposeCast } = useComposeCast();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
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
    const shareText = `I just proposed a new market on SWIPE.\n\n"${createdQuestion}"\n\nIt takes bets as soon as it is registered. Come and pick a side:`;

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

  const [formData, setFormData] = useState<FormData>({
    question: '',
    description: '',
    category: '',
    imageUrl: '',
    endDate: '',
    endTime: '',
    includeChart: false,
    selectedCrypto: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData | 'submit', string>>>({});

  // Image upload states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Anyone with a connected wallet may propose a market. That is the product.
   *
   * The old gate read `requiredApprovals` off the archived V2 contract and let
   * the public through only when it happened to be zero, which is a condition
   * about a contract nobody writes to any more. V3 has no creation fee and no
   * on-chain creation at all, so nothing here is decided on chain: a proposal
   * is inert until a resolver registers it, and what bounds the volume is the
   * per-address rate limit in the propose endpoint.
   */
  const canCreate = Boolean(address);

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

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

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
      setErrors(prev => ({ ...prev, imageUrl: 'Image must be square, 1:1.' }));
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

  /**
   * Submits a proposal rather than minting a market.
   *
   * The image is already uploaded by the time this runs, because the file input
   * uploads on selection. That ordering is load-bearing: the signature carries a
   * timestamp with a five minute life, so a slow step between signing and the
   * fetch is a signature that expires in flight.
   */
  const executeCreatePrediction = async () => {
    const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);
    const deadline = Math.floor(endDateTime.getTime() / 1000);

    const selectedCryptoData = CRYPTO_OPTIONS.find(c => c.symbol === formData.selectedCrypto);
    let finalImageUrl = formData.imageUrl.trim();

    if (formData.includeChart && selectedCryptoData) {
      finalImageUrl = `https://www.geckoterminal.com/${selectedCryptoData.chain}/pools/${selectedCryptoData.poolAddress}?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d&bg_color=ffffff`;
    }

    // The id is allocated server-side with an atomic counter. Deriving it here,
    // or from the highest existing record, gives two proposals in the same
    // second the same number and points two markets at one on-chain id.
    // The question and deadline are inside the signed string, so a captured
    // header cannot be replayed with a different question against this address.
    const timestamp = Date.now();
    const signature = await signMessageAsync({
      message: buildProposalMessage({
        question: formData.question.trim(),
        deadline,
        timestamp,
      }),
    });

    const response = await fetch('/api/predictions/propose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [PROPOSAL_HEADERS.address]: address ?? '',
        [PROPOSAL_HEADERS.signature]: signature,
        [PROPOSAL_HEADERS.timestamp]: String(timestamp),
      },
      body: JSON.stringify({
        question: formData.question.trim(),
        description: formData.description.trim(),
        category: formData.category,
        imageUrl: finalImageUrl,
        includeChart: formData.includeChart,
        selectedCrypto: formData.selectedCrypto,
        deadline,
        creator: address,
        // The chain the user is looking at. Absent, the route defaults to Base.
        chain: chainKey,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.success) {
      throw new Error(result?.error || `Proposal failed (${response.status})`);
    }

    // Closed first, then the confirmation opened, so only one dialog is ever
    // mounted. Two overlapping Radix dialogs leave the body's pointer-events
    // locked when the second one closes.
    setCreatedQuestion(formData.question.trim());
    onClose();
    setShowSuccessModal(true);
    onSuccess?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // No contract write happens here any more, so there is no address to guard.
    // A proposal is inert until a resolver registers it, and registration is
    // guarded on the admin surface where it belongs. A chain with no market can
    // never register this one, so the form refuses it and says so in place.
    if (!marketWrite.ready) return;

    if (!validateForm() || !canCreate) return;

    setIsSubmitting(true);
    try {
      await executeCreatePrediction();
    } catch (error) {
      console.error('Proposal failed:', error);
      setErrors({
        submit: error instanceof Error ? error.message : 'Failed to propose the market.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCryptoData = CRYPTO_OPTIONS.find(c => c.symbol === formData.selectedCrypto);
  const previewImage = imagePreview || uploadedImageUrl || formData.imageUrl;
  const showPreview = Boolean(formData.question.trim() || formData.imageUrl || formData.includeChart);

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="propose">
        <DialogTitle className="propose__title">Propose a market</DialogTitle>
        <DialogDescription className="propose__intro">
          Proposing is free. You sign a message, so there is no transaction and no gas to
          pay. The market takes no bets until a resolver registers it on chain, which is a
          separate step and not automatic. Five proposals a day per wallet.
        </DialogDescription>

        {!canCreate && (
          <p className="propose__status">
            Connect a wallet first. The address you sign with is credited as the creator
            and earns the creator fee on every losing pool in the market.
          </p>
        )}

        {/* Was an alert() on submit, which told nobody anything until they had
            filled the whole form in. */}
        {!marketWrite.ready && (
          <p className="propose__status">
            This network has no Swipe market, so nothing could register a proposal made
            here. Switch networks and the form will send.
          </p>
        )}

        <form onSubmit={handleSubmit} className="propose__form">
          {/* Question */}
          <div className="propose__field">
            <label className="propose__label" htmlFor="propose-question">Question</label>
            <textarea
              id="propose-question"
              value={formData.question}
              onChange={(e) => handleInputChange('question', e.target.value)}
              placeholder="Will Bitcoin reach $100,000 by end of 2026?"
              maxLength={200}
              rows={2}
              className={`propose__input propose__input--area${errors.question ? ' propose__input--bad' : ''}`}
            />
            <p className="propose__count">{formData.question.length}/200</p>
            {errors.question && <p className="propose__error">{errors.question}</p>}
          </div>

          {/* Description */}
          <div className="propose__field">
            <label className="propose__label" htmlFor="propose-description">Description</label>
            <textarea
              id="propose-description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Say how this settles, and where the answer comes from."
              rows={3}
              className={`propose__input propose__input--area${errors.description ? ' propose__input--bad' : ''}`}
            />
            {errors.description && <p className="propose__error">{errors.description}</p>}
          </div>

          {/* Category */}
          <div className="propose__field">
            <label className="propose__label" htmlFor="propose-category">Category</label>
            <select
              id="propose-category"
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              className={`propose__input${errors.category ? ' propose__input--bad' : ''}`}
            >
              <option value="">Pick one</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {errors.category && <p className="propose__error">{errors.category}</p>}
          </div>

          {/* Chart or image */}
          <div className="propose__panel">
            <div className="propose__check">
              <input
                type="checkbox"
                id="includeChart"
                checked={formData.includeChart}
                onChange={(e) => {
                  handleInputChange('includeChart', e.target.checked);
                  if (e.target.checked) handleInputChange('imageUrl', '');
                }}
                className="propose__check-box"
              />
              <label htmlFor="includeChart" className="propose__check-label">
                Use a live price chart instead of an image
              </label>
            </div>

            {formData.includeChart && (
              <div className="propose__cryptos">
                {CRYPTO_OPTIONS.map(crypto => (
                  <button
                    key={crypto.symbol}
                    type="button"
                    onClick={() => handleInputChange('selectedCrypto', crypto.symbol)}
                    className={`propose__crypto${formData.selectedCrypto === crypto.symbol ? ' propose__crypto--on' : ''}`}
                  >
                    {crypto.symbol}
                  </button>
                ))}
              </div>
            )}
            {errors.selectedCrypto && <p className="propose__error">{errors.selectedCrypto}</p>}
          </div>

          {/* Image Upload */}
          {!formData.includeChart && (
            <div className="propose__field">
              <label className="propose__label">
                Image <span className="propose__label-hint">square, 1:1, up to 32MB</span>
              </label>

              {imagePreview || uploadedImageUrl ? (
                <div className="propose__thumb">
                  <img
                    src={imagePreview || uploadedImageUrl}
                    alt="What the card will show"
                    className="propose__thumb-img"
                  />
                  {isUploading && <span className="propose__thumb-busy">Uploading</span>}
                  {uploadedImageUrl && !isUploading && (
                    <button
                      type="button"
                      onClick={clearUploadedImage}
                      className="propose__thumb-clear"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="propose__drop"
                >
                  <span className="propose__drop-main">Choose a picture</span>
                  <span className="propose__drop-sub">It has to be square, or the card crops it badly</span>
                </button>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="propose__file"
              />

              <p className="propose__or">or paste a link</p>

              <input
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
                className={`propose__input${errors.imageUrl ? ' propose__input--bad' : ''}`}
              />
              {errors.imageUrl && <p className="propose__error">{errors.imageUrl}</p>}
            </div>
          )}

          {/* Deadline */}
          <div className="propose__field">
            <label className="propose__label" htmlFor="propose-date">Closes</label>
            <div className="propose__dates">
              <input
                id="propose-date"
                type="date"
                value={formData.endDate}
                onChange={(e) => handleInputChange('endDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={`propose__input${errors.endDate ? ' propose__input--bad' : ''}`}
              />
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => handleInputChange('endTime', e.target.value)}
                className={`propose__input${errors.endDate ? ' propose__input--bad' : ''}`}
              />
            </div>
            <p className="propose__hint">At least an hour from now, at most a year.</p>
            {errors.endDate && <p className="propose__error">{errors.endDate}</p>}
          </div>

          {/* Card preview */}
          {showPreview && (
            <div className="propose__preview">
              <span className="propose__label">Preview</span>
              <div className="propose__card">
                <div className="propose__card-media">
                  {formData.includeChart && selectedCryptoData ? (
                    <iframe
                      src={`https://www.geckoterminal.com/${selectedCryptoData.chain}/pools/${selectedCryptoData.poolAddress}?embed=1&info=0&swaps=0&light_chart=1&chart_type=price&resolution=1d`}
                      title={`${formData.selectedCrypto} chart`}
                      className="propose__card-frame"
                      allow="clipboard-write"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  ) : previewImage ? (
                    <img
                      src={previewImage}
                      alt="Card preview"
                      className="propose__card-img"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="propose__card-blank">
                      {formData.includeChart ? 'Pick a coin' : 'No picture yet'}
                    </span>
                  )}
                  {formData.category && (
                    <span className="propose__card-tag">{formData.category}</span>
                  )}
                </div>

                <div className="propose__card-body">
                  <h3 className="propose__card-question">
                    {formData.question.trim() || 'Your question goes here'}
                  </h3>
                  <p className="propose__card-when">
                    {formData.endDate && formData.endTime
                      ? `Closes ${formData.endDate} at ${formData.endTime}`
                      : 'No closing time set'}
                  </p>
                </div>

                <div className="propose__card-bar">
                  <span className="propose__card-bar-no">No 50%</span>
                  <span className="propose__card-bar-yes">Yes 50%</span>
                </div>
              </div>
              <p className="propose__caption">Both sides start level. The first bets move it.</p>
            </div>
          )}

          {errors.submit && <p className="propose__alert">{errors.submit}</p>}

          <div className="propose__actions">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="propose__btn propose__btn--quiet"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canCreate || !marketWrite.ready || isSubmitting || isUploading}
              className="propose__btn propose__btn--go"
              aria-busy={isSubmitting}
            >
              {isSubmitting ? 'Waiting for your signature' : 'Propose market'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {/* Sent, not live. Radix supplies the close button and the focus trap. */}
    <Dialog open={showSuccessModal} onOpenChange={(open) => !open && setShowSuccessModal(false)}>
      <DialogContent className="proposed">
        <div className="proposed__marks">
          <img src="/farc.png" alt="Farcaster" className="proposed__mark" />
          <img src="/Base_square_blue.png" alt="Base" className="proposed__mark" />
        </div>

        <DialogTitle className="proposed__title">Proposal sent</DialogTitle>
        <DialogDescription className="proposed__lede">
          It is in the queue, waiting for a resolver to register it on chain. Nobody can
          bet on it until that happens.
        </DialogDescription>

        <p className="proposed__question">{createdQuestion}</p>

        <p className="proposed__note">
          Your address stays on it as the creator, so the creator fee is yours once it
          starts taking bets.
        </p>

        <button type="button" onClick={shareCreatedPrediction} className="proposed__share">
          Share it
        </button>
        <button
          type="button"
          onClick={() => setShowSuccessModal(false)}
          className="proposed__later"
        >
          Maybe later
        </button>
      </DialogContent>
    </Dialog>
    </>
  );
}
