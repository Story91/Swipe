"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Stepper, { Step } from "@/components/Stepper";
import { ArrowLeft, ArrowRight, TrendingUp, Wallet, Trophy, CheckCircle2, Sparkles, X } from "lucide-react";
import "@/components/Stepper.css";
import { useState } from "react";

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HowToPlayModal({ isOpen, onClose }: HowToPlayModalProps) {
  const [currentStep, setCurrentStep] = useState(1);

  const handleSkip = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!p-0 !max-w-[380px] sm:!max-w-[420px] !rounded-3xl !border-2 !border-[#d4ff00] !bg-gradient-to-b from-zinc-900 to-black overflow-hidden !mx-4">
        <DialogTitle className="sr-only">How to Play</DialogTitle>
        
        {/* Skip Button - Top Right */}
        <button
          onClick={handleSkip}
          className="absolute right-4 top-4 z-50 rounded-full p-1.5 hover:bg-zinc-800 transition-colors"
          aria-label="Skip tutorial"
        >
          <X className="h-4 w-4 text-zinc-400 hover:text-white" />
        </button>
        
        <div className="relative">
          {/* Header Glow Effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-[#d4ff00]/20 rounded-full blur-3xl pointer-events-none" />
          
          <Stepper
            initialStep={1}
            onStepChange={setCurrentStep}
            onFinalStepCompleted={onClose}
            stepCircleContainerClassName="!border-0 !shadow-none !bg-transparent"
            stepContainerClassName="!p-4 !pb-0 sm:!p-6 sm:!pb-0"
            contentClassName="!min-h-[280px] sm:!min-h-[320px]"
            footerClassName="!pt-4 sm:!pt-6"
            backButtonText="Back"
            nextButtonText="Next"
          >
            {/* Step 1: Welcome */}
            <Step>
              <div className="flex flex-col items-center text-center px-4 py-2 sm:px-6 sm:py-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#d4ff00]/20 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-[#d4ff00]" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  Welcome to Swipe! 🎯
                </h3>
                <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                  Predict the future, Tinder-style! Swipe on predictions, stake your ETH, and win big if you&apos;re right.
                </p>
              </div>
            </Step>

            {/* Step 2: Swipe Mechanics */}
            <Step>
              <div className="flex flex-col items-center text-center px-4 py-2 sm:px-6 sm:py-4">
                <div className="flex gap-4 mb-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-500/20 flex items-center justify-center border-2 border-red-500">
                    <ArrowLeft className="w-6 h-6 sm:w-7 sm:h-7 text-red-500" />
                  </div>
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500">
                    <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 text-green-500" />
                  </div>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
                  Swipe to Predict
                </h3>
                <p className="text-zinc-400 text-sm sm:text-base leading-relaxed mb-3">
                  It works just like <span className="text-[#d4ff00] font-semibold">Tinder</span>! 
                  <br />
                  <span className="text-red-400 font-semibold">Swipe LEFT</span> if you think it <span className="text-red-400">WON&apos;T</span> happen.
                  <br />
                  <span className="text-green-400 font-semibold">Swipe RIGHT</span> if you think it <span className="text-green-400">WILL</span> happen.
                </p>
                <div className="mt-2 px-3 py-2 sm:px-4 sm:py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg w-full">
                  <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
                    <span className="text-[#d4ff00] font-semibold">First swipe</span> = Choose <span className="text-green-400">YES</span> or <span className="text-red-400">NO</span>
                    <br />
                    <span className="text-[#d4ff00] font-semibold">Second swipe</span> = Confirm your <span className="text-blue-400">bet</span>
                  </p>
                </div>
              </div>
            </Step>

            {/* Step 3: Staking */}
            <Step>
              <div className="flex flex-col items-center text-center px-4 py-2 sm:px-6 sm:py-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
                  <Wallet className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  Bet with ETH or SWIPE
                </h3>
                <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                  Choose how much to bet with <span className="text-blue-400 font-semibold">ETH</span> or <span className="text-[#d4ff00] font-semibold">SWIPE</span> token (0.001 - 100 ETH). The higher your bet, the higher your potential rewards!
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs sm:text-sm text-zinc-500">
                  <TrendingUp className="w-4 h-4" />
                  <span>Real-time odds displayed on each card</span>
                </div>
              </div>
            </Step>

            {/* Step 4: Winning */}
            <Step>
              <div className="flex flex-col items-center text-center px-4 py-2 sm:px-6 sm:py-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#d4ff00]/20 flex items-center justify-center mb-4">
                  <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-[#d4ff00]" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  Win & Claim Rewards
                </h3>
                <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                  If your prediction is correct, claim your proportional share of the losing pool from your <span className="text-[#d4ff00] font-semibold">dashboard</span>! Only 1% platform fee on profits.
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs sm:text-sm text-zinc-500">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Fair proportional payouts for everyone</span>
                </div>
              </div>
            </Step>

            {/* Step 5: Ready */}
            <Step>
              <div className="flex flex-col items-center text-center px-4 py-2 sm:px-6 sm:py-4">
                <div className="text-5xl sm:text-6xl mb-4">🚀</div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  You&apos;re Ready!
                </h3>
                <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                  Start swiping and make your first prediction. Good luck predicting the future!
                </p>
                <div className="mt-4 px-4 py-2 sm:px-5 sm:py-3 bg-[#d4ff00]/10 border border-[#d4ff00]/30 rounded-lg">
                  <p className="text-[#d4ff00] text-xs sm:text-sm font-medium">
                    💡 Tip: Check the Stats tab to see market trends
                  </p>
                </div>
              </div>
            </Step>
          </Stepper>
          
          {/* Skip Button at Bottom (alternative) */}
          <div className="px-4 pb-4 flex justify-center">
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Skip Tutorial
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

