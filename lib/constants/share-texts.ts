/**
 * Every line the app can post to a public feed on a user's behalf.
 *
 * Three rules, learned the hard way, because a wrong line here is not a bug in
 * a page nobody reads, it is a claim published under someone's name.
 *
 * Name no token. Bets settle in the chain's own stablecoin, USDC on Base and
 * Paxos USDG on Robinhood, and the symbol is passed in by the caller from the
 * chain config. There are no ETH or SWIPE bets any more; those live on archived
 * contracts. This file used to print "💰 ETH Pool: 0.0000 ETH" next to a market
 * whose money was all collateral, and a "SWIPE Pool" beside it.
 *
 * Promise no earnings. Swipe is parimutuel: the winning side splits what the
 * losing side put in, less 300 bps to the platform and 50 bps to the creator,
 * both taken from the losing pool only. Nobody is paid for showing up, so a
 * line reading "start earning today" is a claim the contract does not make.
 *
 * Quote no rate. Fees can be changed by the contract owner, so a percentage
 * frozen into a share text goes stale silently. The FAQ and the manifesto are
 * where the numbers live.
 */

// ============================================
// SHARE AFTER STAKING (Post-bet share)
// ============================================

// Function to get stake intros with platform tag
export function getStakeShareIntros(platform: 'farcaster' | 'twitter' = 'farcaster'): string[] {
  const tag = getPlatformTag(platform);
  return [
    `🎯 I just bet on ${tag}!`,
    `💰 Just placed my bet on ${tag}!`,
    `🔥 Made my prediction on ${tag}!`,
    `⚡ Just locked in my bet on ${tag}!`,
    "🎰 Going all in on this prediction!",
    `💎 Diamond hands on ${tag}!`,
    "🚀 Just bet on this. LFG!",
    `🎯 Placed my stake on ${tag}!`,
    `💪 Just made my move on ${tag}!`,
    "🏆 Betting big on this one!",
    "🔮 Made my prediction, feeling good!",
    "⚡ Just swiped on this prediction!",
    "💰 Locked in my bet. What's yours?",
    `🎯 Just took a position on ${tag}!`,
    "🔥 This prediction called to me!"
  ];
}

// Keep old const for backwards compatibility
export const STAKE_SHARE_INTROS = getStakeShareIntros('farcaster');

export const STAKE_SHARE_OUTROS = [
  "WDYT? 👀",
  "What's your take? 👀",
  "You in? 🤔",
  "What do you think? 💭",
  "Your move! 🎯",
  "Are you betting? 🎰",
  "Join me! 💪",
  "Make your call! 🔮",
  "What's your bet? 💰",
  "Agree or nah? 🤷",
  "You with me? 🤝",
  "What side you on? ⚖️",
  "Place your bet! 🎲",
  "Let's see your prediction! 👀",
  "Show me your bet! 💵"
];

export const STAKE_SHARE_CALLS_TO_ACTION = [
  "Check it out:",
  "Join the action:",
  "See the market:",
  "View prediction:",
  "Full details:",
  "Take a look:",
  "Join the bet:",
  "See the odds:",
  "Market here:",
  "Prediction link:",
  "Bet here:",
  "Full market:",
  "Check the pool:",
  "View details:",
  "Join now:"
];

/**
 * Get random stake share intro
 */
export function getRandomStakeIntro(platform: 'farcaster' | 'twitter' = 'farcaster'): string {
  const intros = getStakeShareIntros(platform);
  return intros[Math.floor(Math.random() * intros.length)];
}

/**
 * Get random stake share outro
 */
export function getRandomStakeOutro(): string {
  return STAKE_SHARE_OUTROS[Math.floor(Math.random() * STAKE_SHARE_OUTROS.length)];
}

/**
 * Get random stake share CTA
 */
export function getRandomStakeCTA(): string {
  return STAKE_SHARE_CALLS_TO_ACTION[Math.floor(Math.random() * STAKE_SHARE_CALLS_TO_ACTION.length)];
}

/**
 * Build complete share text for staked prediction
 * @param predictionText - The prediction question
 * @param formattedAmount - Formatted stake amount (e.g., "25.00")
 * @param token - The chain's collateral symbol, USDC on Base and USDG on Robinhood
 * @param predictionUrl - URL to the prediction
 * @param platform - Platform for sharing (farcaster or twitter)
 * @returns Complete share text ready to post
 */
export function buildStakeShareText(
  predictionText: string,
  formattedAmount: string,
  // The collateral symbol of the chain the bet was signed on, USDC on Base and
  // USDG on Robinhood. It was 'ETH' | 'SWIPE' while a bet could pick its token.
  token: string,
  predictionUrl?: string,
  platform: 'farcaster' | 'twitter' = 'farcaster'
): { text: string; url: string } {
  const intro = getRandomStakeIntro(platform);
  const outro = getRandomStakeOutro();
  const cta = getRandomStakeCTA();
  
  let shareText = `${intro}\n\n"${predictionText}"\n\n💰 My bet: ${formattedAmount} ${token}\n\n${outro}`;
  
  // If no URL provided, add CTA (it will be added as embed)
  if (predictionUrl) {
    shareText += `\n\n${cta}`;
  }
  
  return {
    text: shareText,
    url: predictionUrl || ''
  };
}

// ============================================
// CURRENT PREDICTION SHARE (Before betting)
// ============================================

// Function to get current prediction intros with platform tag
export function getCurrentPredictionIntros(platform: 'farcaster' | 'twitter' = 'farcaster'): string[] {
  const tag = getPlatformTag(platform);
  return [
    `👀 Just found this on ${tag}:`,
    "🎯 This prediction goes hard:",
    "💰 Check out this market:",
    "📈 NFA but this looks spicy:",
    "🎯 WAGMI or NGMI? You decide:",
    "🔥 Hot prediction alert:",
    `⚡ Interesting market on ${tag}:`,
    "🎰 This one's got potential:",
    `💎 Found a gem on ${tag}:`,
    "🚀 Check this prediction:",
    "🔮 What do you think about this:",
    "💭 Curious about this prediction:",
    "🎯 Place your bets:",
    "🏆 Who's got the winning take:",
    "⚖️ Split decision incoming:"
  ];
}

// Keep old const for backwards compatibility
export const CURRENT_PREDICTION_INTROS = getCurrentPredictionIntros('farcaster');

// Function to get current prediction outros with platform tag
export function getCurrentPredictionOutros(platform: 'farcaster' | 'twitter' = 'farcaster'): string[] {
  const tag = getPlatformTag(platform);
  return [
    `Predict on ${tag}! 🎯`,
    "What's your call? 🤔",
    "Make your prediction! 💰",
    "Place your bet! 🎰",
    "Join the market! 🚀",
    "Cast your vote! 🗳️",
    "Show your hand! 🃏",
    "Take your shot! 🎯",
    "Make your move! ♟️",
    "Pick a side! ⚖️",
    "What do you think? 💭",
    "Join the prediction! 🔮",
    "Bet on it! 💵",
    `Join ${tag}! 👆`,
    "Make the call! 📞"
  ];
}

// Keep old const for backwards compatibility
export const CURRENT_PREDICTION_OUTROS = getCurrentPredictionOutros('farcaster');

/**
 * Get random current prediction intro
 */
export function getRandomCurrentPredictionIntro(platform: 'farcaster' | 'twitter' = 'farcaster'): string {
  const intros = getCurrentPredictionIntros(platform);
  return intros[Math.floor(Math.random() * intros.length)];
}

/**
 * Get random current prediction outro
 */
export function getRandomCurrentPredictionOutro(platform: 'farcaster' | 'twitter' = 'farcaster'): string {
  const outros = getCurrentPredictionOutros(platform);
  return outros[Math.floor(Math.random() * outros.length)];
}

/** A pool, in the collateral the market actually holds. */
export interface SharePool {
  /** Readable units, already divided by the token's decimals. */
  amount: number;
  /** USDC on Base, USDG on Robinhood. From the chain config, never a literal. */
  symbol: string;
}

/**
 * Build share text for a market the user is looking at but has not bet on.
 *
 * The two archived pool figures are still in the signature and are ignored.
 * They used to produce the two worst lines this file could post: an "ETH Pool"
 * off `yesTotalAmount` and a "SWIPE Pool" off `swipeYesTotalAmount`, neither of
 * which anything has written since the role split. On every market the app can
 * currently bet on, both read zero, so the share either said nothing or, on an
 * old market that still carries archived totals, told a public feed the pool
 * was denominated in a token the market does not take.
 *
 * They stay in place rather than being deleted because the caller is
 * app/components/Main/TinderCard.tsx and it still passes them positionally.
 * Pass `pool` to get a pool line back, with the currency named.
 *
 * @param predictionText The prediction question
 * @param _archivedEthPool Ignored. The V2 ETH pool, kept for call compatibility
 * @param _archivedSwipePool Ignored. The V2 SWIPE pool, same reason
 * @param participants Number of swipers on this market
 * @param platform Where the text is going
 * @param pool The collateral pool and its symbol, if the caller knows them
 */
export function buildCurrentPredictionShareText(
  predictionText: string,
  _archivedEthPool?: number,
  _archivedSwipePool?: number,
  participants?: number,
  platform: 'farcaster' | 'twitter' = 'farcaster',
  pool?: SharePool
): { text: string; includeStats: boolean } {
  const intro = getRandomCurrentPredictionIntro(platform);
  const outro = getRandomCurrentPredictionOutro(platform);

  let shareText = `${intro}\n\n"${predictionText}"`;

  let hasStats = false;
  if (pool && pool.amount > 0) {
    const amount =
      pool.amount >= 1000 ? `${(pool.amount / 1000).toFixed(1)}k` : pool.amount.toFixed(2);
    shareText += `\n\n💰 Pool: ${amount} ${pool.symbol}`;
    hasStats = true;
  }

  if (participants && participants > 0) {
    shareText += `\n👥 ${participants} swipers`;
    hasStats = true;
  }

  shareText += `\n\n${outro}`;

  return {
    text: shareText,
    includeStats: hasStats
  };
}

// ============================================
// WIN/LOSS SHARE (After prediction resolves)
// ============================================

// Function to get win share intros with platform tag
export function getWinShareIntros(platform: 'farcaster' | 'twitter' = 'farcaster'): string[] {
  const tag = getPlatformTag(platform);
  return [
    `🎉 Just won on ${tag}!`,
    `💰 Profit secured on ${tag}!`,
    "🏆 Called it right!",
    "💎 Diamond hands paid off!",
    "🚀 To the moon!",
    "⚡ Nailed this prediction!",
    `🎯 Perfect call on ${tag}!`,
    "💪 That's how it's done!",
    "🔥 Another W in the books!",
    "🏅 Victory is sweet!",
    "📈 Green candles baby!",
    `💵 Cashing out on ${tag}!`,
    "🎰 Hit the jackpot!",
    "🌟 Prediction master!",
    "🔮 Called the future!"
  ];
}

// Function to get loss share intros with platform tag
export function getLossShareIntros(platform: 'farcaster' | 'twitter' = 'farcaster'): string[] {
  const tag = getPlatformTag(platform);
  return [
    `💪 Took an L on ${tag}`,
    "📉 Not my best prediction",
    "🎲 Can't win them all",
    "🤷 Missed this one",
    `💭 Learning experience on ${tag}`,
    "📊 Not today, but tomorrow",
    "🎯 Better luck next time",
    "🔄 On to the next one",
    `💡 Lesson learned on ${tag}`,
    "🌊 Riding out this L",
    "🎰 The other side called it",
    "📉 Red candle this time",
    "🤔 Didn't see that coming",
    "⚖️ Wrong side of history",
    "🎲 Roll the dice again"
  ];
}

// Keep old consts for backwards compatibility
export const WIN_SHARE_INTROS = getWinShareIntros('farcaster');
export const LOSS_SHARE_INTROS = getLossShareIntros('farcaster');

/**
 * Get random win share intro
 */
export function getRandomWinIntro(platform: 'farcaster' | 'twitter' = 'farcaster'): string {
  const intros = getWinShareIntros(platform);
  return intros[Math.floor(Math.random() * intros.length)];
}

/**
 * Get random loss share intro
 */
export function getRandomLossIntro(platform: 'farcaster' | 'twitter' = 'farcaster'): string {
  const intros = getLossShareIntros(platform);
  return intros[Math.floor(Math.random() * intros.length)];
}

// ============================================
// PLATFORM-SPECIFIC TAGS
// ============================================

/**
 * Get platform-specific mention tag
 * @param platform - 'farcaster' or 'twitter'
 * @returns Appropriate tag for the platform
 */
export function getPlatformTag(platform: 'farcaster' | 'twitter'): string {
  return platform === 'twitter' ? '@swipe_ai_' : '@swipeai';
}

// ============================================
// ACTIVE PREDICTION SHARE (User already bet)
// ============================================

export const ACTIVE_PREDICTION_INTROS = [
  "🎯 I'm in on this one",
  "💰 Just placed my bet",
  "🔥 This prediction looks spicy",
  "⚡ Locked in my position",
  "💎 All in on this",
  "🚀 Bet placed, let's go",
  "🎰 Put my money where my mouth is",
  "💪 Made my move",
  "🏆 Confident in this bet",
  "🔮 My prediction is in",
  "⚖️ Chose my side",
  "🎯 Skin in the game",
  "💵 Staked my claim",
  "🃏 Cards on the table",
  "📈 Betting on this outcome"
];

/**
 * Get random active prediction intro with tag
 */
export function getRandomActivePredictionIntro(platform: 'farcaster' | 'twitter'): string {
  const intro = ACTIVE_PREDICTION_INTROS[Math.floor(Math.random() * ACTIVE_PREDICTION_INTROS.length)];
  const tag = getPlatformTag(platform);
  return `${intro} ${tag}`;
}

// ============================================
// STATS SHARE (Portfolio sharing)
// ============================================

export const STATS_WIN_INTROS = [
  "🏆 Crushing it on",
  "💎 Diamond hands paying off!",
  "📈 To the moon with",
  "💰 Profits rolling in on",
  "🚀 Mooning with",
  "⚡ Winning streak on",
  "🔥 On fire with",
  "💵 Stacking wins on",
  "🎯 Precision trading on",
  "🏅 Victory lap with"
];

export const STATS_LOSS_INTROS = [
  "📉 Learning the ropes on",
  "🎰 Some you win, some you learn!",
  "💪 NGMI? More like WAGMI soon!",
  "🌊 Weathering the storm on",
  "🎲 Down but not out on",
  "💭 Building back better with",
  "🔄 Comeback season on",
  "📊 Red today, green tomorrow on",
  "🤔 Recalibrating strategy on",
  "⚖️ Balancing the portfolio on"
];

/**
 * Get random stats share intro
 */
export function getRandomStatsIntro(isProfit: boolean, platform: 'farcaster' | 'twitter'): string {
  const intros = isProfit ? STATS_WIN_INTROS : STATS_LOSS_INTROS;
  const intro = intros[Math.floor(Math.random() * intros.length)];
  const tag = getPlatformTag(platform);
  return `${intro} ${tag}`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format time remaining
 */
export function formatTimeLeft(deadline: number): string {
  const now = Date.now() / 1000;
  const timeLeft = deadline - now;
  
  if (timeLeft <= 0) return 'Ended';
  
  const days = Math.floor(timeLeft / 86400);
  const hours = Math.floor((timeLeft % 86400) / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// formatSwipeAmount lived here. Nothing imported it, and no bet is denominated
// in SWIPE any more, so the only thing it could do was tempt a caller into
// printing a SWIPE figure on a market that settles in stablecoin. TinderCard
// has its own local copy for the archived leaderboard it still renders.

// ============================================
// CLAIM REWARD SHARE (After claiming winnings)
// ============================================

export const CLAIM_SHARE_INTROS = [
  "🎉 Just claimed",
  "💰 Cashed out",
  "🏆 Collected my winnings",
  "💵 Just withdrew",
  "✨ Rewards claimed",
  "🤑 Money in the bank",
  "💎 Profits secured",
  "🎯 Just collected",
  "🔥 Winnings claimed",
  "⚡ Got paid",
  "💸 Just claimed my",
  "🏅 Victory rewards claimed",
  "📈 Profits withdrawn",
  "💰 Just scooped up",
  "🎊 Claimed my rewards"
];

// Function to get claim outros with platform tag
export function getClaimShareOutros(platform: 'farcaster' | 'twitter' = 'farcaster'): string[] {
  const tag = getPlatformTag(platform);
  return [
    `Predict on ${tag}:`,
    "Join the winning side:",
    "Your turn to win:",
    "Take a side:",
    "Make your own call:",
    `Swipe on ${tag}:`,
    "Join the action:",
    "Pick a side:",
    "Winners split the losing pool:",
    `Win with ${tag}:`,
    "Back your own read:",
    "The market is open:",
    "Join winning predictions:",
    "Start your winning streak:",
    "Call it before the deadline:"
  ];
}

// Keep old const for backwards compatibility
export const CLAIM_SHARE_OUTROS = getClaimShareOutros('farcaster');

/**
 * Get random claim share intro
 */
export function getRandomClaimIntro(): string {
  return CLAIM_SHARE_INTROS[Math.floor(Math.random() * CLAIM_SHARE_INTROS.length)];
}

/**
 * Get random claim share outro
 */
export function getRandomClaimOutro(platform: 'farcaster' | 'twitter' = 'farcaster'): string {
  const outros = getClaimShareOutros(platform);
  return outros[Math.floor(Math.random() * outros.length)];
}

/**
 * Build share text for claimed prediction
 */
export function buildClaimShareText(
  payoutFormatted: string,
  profitFormatted: string,
  tokenSymbol: string,
  predictionQuestion: string,
  outcome: boolean,
  platform: 'farcaster' | 'twitter' = 'farcaster'
): string {
  const intro = getRandomClaimIntro();
  const outro = getRandomClaimOutro(platform);
  const tag = getPlatformTag(platform);
  
  return `${intro} ${payoutFormatted} ${tokenSymbol} (+${profitFormatted} profit) from ${tag}!\n\n"${predictionQuestion}"\n\nPrediction was ${outcome ? 'YES ✅' : 'NO ❌'}\n\n${outro}`;
}

// ============================================
// PORTFOLIO STATS SHARE (Enhanced Dashboard)
// ============================================

export const PORTFOLIO_WIN_INTROS = [
  "🏆 Crushing it on",
  "💎 Diamond hands paying off!",
  "📈 To the moon with",
  "💰 Profits rolling in on",
  "🚀 Mooning with",
  "⚡ Winning streak on",
  "🔥 On fire with",
  "💵 Stacking wins on",
  "🎯 Precision trading on",
  "🏅 Victory lap with",
  "📊 Portfolio pumping on",
  "💪 Dominating predictions on",
  "✨ Making bank on",
  "🎰 Lucky streak on",
  "🌟 Shining bright with"
];

export const PORTFOLIO_LOSS_INTROS = [
  "📉 Learning the ropes on",
  "🎰 Some you win, some you learn!",
  "💪 NGMI? More like WAGMI soon!",
  "🌊 Weathering the storm on",
  "🎲 Down but not out on",
  "💭 Building back better with",
  "🔄 Comeback season on",
  "📊 Red today, green tomorrow on",
  "🤔 Recalibrating strategy on",
  "⚖️ Balancing the portfolio on",
  "🏗️ Rebuilding on",
  "🎯 Finding my edge on",
  "💡 Learning from losses on",
  "🔮 Future looks bright on",
  "🚀 Preparing for liftoff with"
];

// Function to get portfolio outros with platform tag
export function getPortfolioShareOutros(platform: 'farcaster' | 'twitter' = 'farcaster'): string[] {
  const tag = getPlatformTag(platform);
  return [
    `Predict on ${tag}! 🎯`,
    "Join the prediction market! 🚀",
    "Start your journey! 💰",
    "Make your predictions! 🔮",
    "Bet on the future! ⚡",
    "Back your own read! 💵",
    "Join winning traders! 🏆",
    "Call it early! 📈",
    "Your turn to win! 🎰",
    "Take your first swipe! 💎",
    "Join the community! 🤝",
    "Make your mark! ✨",
    "Bet smart, win big! 🎯",
    "Get in the market! 🔥",
    "Predict your future! 🌟"
  ];
}

// Keep old const for backwards compatibility
export const PORTFOLIO_SHARE_OUTROS = getPortfolioShareOutros('farcaster');

/**
 * Get random portfolio share intro
 */
export function getRandomPortfolioIntro(isProfit: boolean, platform: 'farcaster' | 'twitter'): string {
  const intros = isProfit ? PORTFOLIO_WIN_INTROS : PORTFOLIO_LOSS_INTROS;
  const intro = intros[Math.floor(Math.random() * intros.length)];
  const tag = getPlatformTag(platform);
  return `${intro} ${tag}`;
}

/**
 * Get random portfolio share outro
 */
export function getRandomPortfolioOutro(platform: 'farcaster' | 'twitter' = 'farcaster'): string {
  const outros = getPortfolioShareOutros(platform);
  return outros[Math.floor(Math.random() * outros.length)];
}
