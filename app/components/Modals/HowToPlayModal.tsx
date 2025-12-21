"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Stepper, { Step } from "@/components/Stepper";
import { TrendingUp, Wallet, Trophy, CheckCircle2, Sparkles, X } from "lucide-react";
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
      <DialogContent className="!p-0 !w-[calc(100vw-32px)] !max-w-[380px] sm:!max-w-[400px] !rounded-3xl !border-2 !border-[#d4ff00] !bg-gradient-to-b from-zinc-900 to-black overflow-hidden">
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
            stepCircleContainerClassName="!border-0 !shadow-none !bg-transparent !max-w-none"
            stepContainerClassName="!p-3 !pb-0"
            contentClassName="!min-h-[260px]"
            footerClassName="!pt-2"
            backButtonText="Back"
            nextButtonText="Next"
          >
            {/* Step 1: Welcome */}
            <Step>
              <div className="flex flex-col items-center text-center px-2 py-2">
                <div className="w-14 h-14 rounded-full bg-[#d4ff00]/20 flex items-center justify-center mb-3">
                  <Sparkles className="w-7 h-7 text-[#d4ff00]" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  Welcome to Swipe! 🎯
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Predict the future, Tinder-style! Swipe on predictions, stake your ETH, and win big if you&apos;re right.
                </p>
              </div>
            </Step>

            {/* Step 2: Swipe Mechanics */}
            <Step>
              <div className="flex flex-col items-center text-center px-2 py-2">
                {/* Swipe GIFs - g1 and g2 side by side */}
                <div className="flex gap-3 mb-3">
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-700">
                    <img 
                      src="/g1.gif" 
                      alt="Swipe left demonstration" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-700">
                    <img 
                      src="/g2.gif" 
                      alt="Swipe right demonstration" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  Swipe to Predict
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed mb-2">
                  It works just like <span className="text-[#d4ff00] font-semibold">Tinder</span>! 
                  <br />
                  <span className="text-red-400 font-semibold">Swipe LEFT</span> = <span className="text-red-400">NO</span>
                  <br />
                  <span className="text-green-400 font-semibold">Swipe RIGHT</span> = <span className="text-green-400">YES</span>
                </p>
                <div className="mt-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg w-full">
                  <p className="text-zinc-300 text-xs leading-relaxed">
                    <span className="text-[#d4ff00] font-semibold">1st swipe</span> = Choose <span className="text-green-400">YES</span> or <span className="text-red-400">NO</span>
                    <br />
                    <span className="text-[#d4ff00] font-semibold">2nd swipe</span> = Confirm your <span className="text-blue-400">bet</span>
                  </p>
                </div>
              </div>
            </Step>

            {/* Step 3: Staking */}
            <Step>
              <div className="flex flex-col items-center text-center px-2 py-2">
                <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-3">
                  <Wallet className="w-7 h-7 text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  Bet with ETH or SWIPE
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Choose how much to bet with <span className="text-blue-400 font-semibold">ETH</span> or <span className="text-[#d4ff00] font-semibold">SWIPE</span> token. The higher your bet, the higher your potential rewards!
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <TrendingUp className="w-4 h-4" />
                  <span>Real-time odds displayed on each card</span>
                </div>
              </div>
            </Step>

            {/* Step 4: Winning */}
            <Step>
              <div className="flex flex-col items-center text-center px-2 py-2">
                <div className="w-14 h-14 rounded-full bg-[#d4ff00]/20 flex items-center justify-center mb-3">
                  <Trophy className="w-7 h-7 text-[#d4ff00]" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  Win & Claim Rewards
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  If your prediction is correct, claim your proportional share from your <span className="text-[#d4ff00] font-semibold">dashboard</span>! Only 1% platform fee on profits.
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Fair proportional payouts for everyone</span>
                </div>
              </div>
            </Step>

            {/* Step 5: Ready */}
            <Step>
              <div className="flex flex-col items-center text-center px-2 py-2">
                <div className="text-4xl mb-3">🚀</div>
                <h3 className="text-lg font-bold text-white mb-2">
                  You&apos;re Ready!
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Start swiping and make your first prediction. Good luck predicting the future!
                </p>
                <div className="mt-3 px-3 py-2 bg-[#d4ff00]/10 border border-[#d4ff00]/30 rounded-lg">
                  <p className="text-[#d4ff00] text-xs font-medium">
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

