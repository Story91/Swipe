const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PredictionMarket_USDC_DualPool", function () {
  let predictionMarket;
  let mockUSDC;
  let owner;
  let resolver;
  let creator;
  let user1;
  let user2;

  const USDC_DECIMALS = 6;
  const toUSDC = (amount) => ethers.parseUnits(amount.toString(), USDC_DECIMALS);
  const fromUSDC = (amount) => ethers.formatUnits(amount, USDC_DECIMALS);

  beforeEach(async function () {
    [owner, resolver, creator, user1, user2] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    // Deploy PredictionMarket_USDC_DualPool
    const PredictionMarket = await ethers.getContractFactory("PredictionMarket_USDC_DualPool");
    predictionMarket = await PredictionMarket.deploy(await mockUSDC.getAddress());
    await predictionMarket.waitForDeployment();

    // Mint USDC to users for testing
    await mockUSDC.mint(user1.address, toUSDC(10000)); // 10,000 USDC
    await mockUSDC.mint(user2.address, toUSDC(10000)); // 10,000 USDC
    await mockUSDC.mint(creator.address, toUSDC(1000)); // 1,000 USDC

    // Add resolver
    await predictionMarket.setResolver(resolver.address, true);
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await predictionMarket.owner()).to.equal(owner.address);
    });

    it("Should set the correct USDC address", async function () {
      expect(await predictionMarket.usdc()).to.equal(await mockUSDC.getAddress());
    });

    it("Should set owner as resolver", async function () {
      expect(await predictionMarket.resolvers(owner.address)).to.be.true;
    });
  });

  describe("Prediction Registration", function () {
    it("Should register a prediction", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400; // 24h from now
      
      await expect(predictionMarket.registerPrediction(1, creator.address, deadline))
        .to.emit(predictionMarket, "PredictionRegistered")
        .withArgs(1, creator.address, deadline);

      const pred = await predictionMarket.getPrediction(1);
      expect(pred.registered).to.be.true;
      expect(pred.creator).to.equal(creator.address);
      expect(pred.deadline).to.equal(deadline);
    });

    it("Should not allow non-resolver to register", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      
      await expect(
        predictionMarket.connect(user1).registerPrediction(1, creator.address, deadline)
      ).to.be.revertedWith("Not resolver");
    });

    it("Should not allow registering same prediction twice", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      await expect(
        predictionMarket.registerPrediction(1, creator.address, deadline)
      ).to.be.revertedWith("Already registered");
    });

    it("Should batch register predictions", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      
      await predictionMarket.registerPredictionsBatch(
        [1, 2, 3],
        [creator.address, creator.address, creator.address],
        [deadline, deadline, deadline]
      );

      const pred1 = await predictionMarket.getPrediction(1);
      const pred2 = await predictionMarket.getPrediction(2);
      const pred3 = await predictionMarket.getPrediction(3);

      expect(pred1.registered).to.be.true;
      expect(pred2.registered).to.be.true;
      expect(pred3.registered).to.be.true;
    });
  });

  describe("Betting", function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      // Approve USDC spending
      await mockUSDC.connect(user1).approve(await predictionMarket.getAddress(), toUSDC(10000));
      await mockUSDC.connect(user2).approve(await predictionMarket.getAddress(), toUSDC(10000));
    });

    it("Should place a YES bet", async function () {
      const betAmount = toUSDC(100);
      
      await expect(predictionMarket.connect(user1).placeBet(1, true, betAmount))
        .to.emit(predictionMarket, "BetPlaced");

      const position = await predictionMarket.getPosition(1, user1.address);
      expect(position.yesAmount).to.equal(betAmount);
      expect(position.noAmount).to.equal(0);
    });

    it("Should place a NO bet", async function () {
      const betAmount = toUSDC(100);
      
      await predictionMarket.connect(user1).placeBet(1, false, betAmount);

      const position = await predictionMarket.getPosition(1, user1.address);
      expect(position.yesAmount).to.equal(0);
      expect(position.noAmount).to.equal(betAmount);
    });

    it("Should update pools correctly", async function () {
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      await predictionMarket.connect(user2).placeBet(1, false, toUSDC(50));

      const pred = await predictionMarket.getPrediction(1);
      expect(pred.yesPool).to.equal(toUSDC(100));
      expect(pred.noPool).to.equal(toUSDC(50));
    });

    it("Should calculate prices correctly", async function () {
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      await predictionMarket.connect(user2).placeBet(1, false, toUSDC(100));

      const prices = await predictionMarket.getPrices(1);
      // 50/50 split = 5000 basis points each
      expect(prices.yesPrice).to.equal(5000);
      expect(prices.noPrice).to.equal(5000);
    });

    it("Should track participants", async function () {
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      await predictionMarket.connect(user2).placeBet(1, false, toUSDC(100));

      const count = await predictionMarket.getParticipantCount(1);
      expect(count).to.equal(2);
    });

    it("Should reject bet below minimum", async function () {
      await expect(
        predictionMarket.connect(user1).placeBet(1, true, toUSDC(0.5)) // 0.5 USDC < 1 USDC minimum
      ).to.be.revertedWith("Below minimum bet");
    });
  });

  describe("Early Exit", function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      await mockUSDC.connect(user1).approve(await predictionMarket.getAddress(), toUSDC(10000));
      await mockUSDC.connect(user2).approve(await predictionMarket.getAddress(), toUSDC(10000));
      
      // Place bets
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      await predictionMarket.connect(user2).placeBet(1, false, toUSDC(100));
    });

    it("Should allow early exit with fee", async function () {
      const balanceBefore = await mockUSDC.balanceOf(user1.address);
      
      await expect(predictionMarket.connect(user1).exitEarly(1, true, toUSDC(100)))
        .to.emit(predictionMarket, "EarlyExit");

      const balanceAfter = await mockUSDC.balanceOf(user1.address);
      const received = balanceAfter - balanceBefore;
      
      // At 50/50, exit value = 100 * 50% = 50 USDC gross
      // 5% fee = 2.5 USDC
      // Net = 47.5 USDC
      expect(received).to.be.closeTo(toUSDC(47.5), toUSDC(0.1));
    });

    it("Should update position after exit", async function () {
      await predictionMarket.connect(user1).exitEarly(1, true, toUSDC(50));

      const position = await predictionMarket.getPosition(1, user1.address);
      expect(position.yesAmount).to.equal(toUSDC(50)); // 100 - 50 = 50
    });

    it("Should calculate exit value correctly", async function () {
      const exitValue = await predictionMarket.calculateExitValue(1, true, toUSDC(100));
      
      // grossValue = 100 * 50% = 50 USDC
      // fee = 50 * 5% = 2.5 USDC
      // netValue = 50 - 2.5 = 47.5 USDC
      expect(exitValue.grossValue).to.be.closeTo(toUSDC(50), toUSDC(0.1));
      expect(exitValue.fee).to.be.closeTo(toUSDC(2.5), toUSDC(0.1));
      expect(exitValue.netValue).to.be.closeTo(toUSDC(47.5), toUSDC(0.1));
    });
  });

  describe("Resolution", function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      await mockUSDC.connect(user1).approve(await predictionMarket.getAddress(), toUSDC(10000));
      await mockUSDC.connect(user2).approve(await predictionMarket.getAddress(), toUSDC(10000));
      
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      await predictionMarket.connect(user2).placeBet(1, false, toUSDC(100));
    });

    it("Should resolve prediction (YES wins)", async function () {
      await expect(predictionMarket.resolvePrediction(1, true))
        .to.emit(predictionMarket, "PredictionResolved")
        .withArgs(1, true, toUSDC(1), toUSDC(0.5), toUSDC(100), toUSDC(100));

      const pred = await predictionMarket.getPrediction(1);
      expect(pred.resolved).to.be.true;
      expect(pred.outcome).to.be.true;
    });

    it("Should resolve prediction (NO wins)", async function () {
      await predictionMarket.resolvePrediction(1, false);

      const pred = await predictionMarket.getPrediction(1);
      expect(pred.resolved).to.be.true;
      expect(pred.outcome).to.be.false;
    });

    it("Should pay creator reward", async function () {
      const creatorBalanceBefore = await mockUSDC.balanceOf(creator.address);
      
      await predictionMarket.resolvePrediction(1, true);
      
      const creatorBalanceAfter = await mockUSDC.balanceOf(creator.address);
      const creatorReward = creatorBalanceAfter - creatorBalanceBefore;
      
      // Creator gets 0.5% of losers pool = 0.5 USDC
      expect(creatorReward).to.equal(toUSDC(0.5));
    });

    it("Should not allow non-resolver to resolve", async function () {
      await expect(
        predictionMarket.connect(user1).resolvePrediction(1, true)
      ).to.be.revertedWith("Not resolver");
    });
  });

  describe("Claiming Winnings", function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      await mockUSDC.connect(user1).approve(await predictionMarket.getAddress(), toUSDC(10000));
      await mockUSDC.connect(user2).approve(await predictionMarket.getAddress(), toUSDC(10000));
      
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      await predictionMarket.connect(user2).placeBet(1, false, toUSDC(100));
      
      // Resolve: YES wins
      await predictionMarket.resolvePrediction(1, true);
    });

    it("Should allow winner to claim", async function () {
      const balanceBefore = await mockUSDC.balanceOf(user1.address);
      
      await expect(predictionMarket.connect(user1).claimWinnings(1))
        .to.emit(predictionMarket, "WinningsClaimed");

      const balanceAfter = await mockUSDC.balanceOf(user1.address);
      const payout = balanceAfter - balanceBefore;
      
      // Winner gets: stake (100) + share of losers pool after fees
      // Losers pool: 100 USDC
      // Platform fee: 1% = 1 USDC
      // Creator fee: 0.5% = 0.5 USDC
      // Net losers pool: 98.5 USDC
      // Payout: 100 + 98.5 = 198.5 USDC
      expect(payout).to.be.closeTo(toUSDC(198.5), toUSDC(0.1));
    });

    it("Should not allow loser to claim winnings", async function () {
      await expect(
        predictionMarket.connect(user2).claimWinnings(1)
      ).to.be.revertedWith("No winning position");
    });

    it("Should not allow double claim", async function () {
      await predictionMarket.connect(user1).claimWinnings(1);
      
      await expect(
        predictionMarket.connect(user1).claimWinnings(1)
      ).to.be.revertedWith("Already claimed");
    });
  });

  describe("Cancellation & Refunds", function () {
    beforeEach(async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      await mockUSDC.connect(user1).approve(await predictionMarket.getAddress(), toUSDC(10000));
      await mockUSDC.connect(user2).approve(await predictionMarket.getAddress(), toUSDC(10000));
      
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      await predictionMarket.connect(user2).placeBet(1, false, toUSDC(50));
    });

    it("Should cancel prediction", async function () {
      await expect(predictionMarket.cancelPrediction(1, "Test cancellation"))
        .to.emit(predictionMarket, "PredictionCancelled")
        .withArgs(1, "Test cancellation");

      const pred = await predictionMarket.getPrediction(1);
      expect(pred.cancelled).to.be.true;
    });

    it("Should allow refund after cancellation", async function () {
      await predictionMarket.cancelPrediction(1, "Test");
      
      const balanceBefore = await mockUSDC.balanceOf(user1.address);
      
      await expect(predictionMarket.connect(user1).claimRefund(1))
        .to.emit(predictionMarket, "RefundClaimed");

      const balanceAfter = await mockUSDC.balanceOf(user1.address);
      const refund = balanceAfter - balanceBefore;
      
      // Full refund of 100 USDC
      expect(refund).to.equal(toUSDC(100));
    });

    it("Should refund both YES and NO positions", async function () {
      // User bets on both sides
      await predictionMarket.connect(user1).placeBet(1, false, toUSDC(25));
      
      await predictionMarket.cancelPrediction(1, "Test");
      
      const balanceBefore = await mockUSDC.balanceOf(user1.address);
      await predictionMarket.connect(user1).claimRefund(1);
      const balanceAfter = await mockUSDC.balanceOf(user1.address);
      
      // Refund of 100 (YES) + 25 (NO) = 125 USDC
      expect(balanceAfter - balanceBefore).to.equal(toUSDC(125));
    });
  });

  describe("Admin Functions", function () {
    it("Should withdraw platform fees", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      await mockUSDC.connect(user1).approve(await predictionMarket.getAddress(), toUSDC(10000));
      await mockUSDC.connect(user2).approve(await predictionMarket.getAddress(), toUSDC(10000));
      
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      await predictionMarket.connect(user2).placeBet(1, false, toUSDC(100));
      
      // Exit early to generate fees
      await predictionMarket.connect(user1).exitEarly(1, true, toUSDC(50));
      
      const feeBalance = await predictionMarket.platformFeeBalance();
      expect(feeBalance).to.be.gt(0);
      
      const ownerBalanceBefore = await mockUSDC.balanceOf(owner.address);
      await predictionMarket.withdrawPlatformFees(owner.address);
      const ownerBalanceAfter = await mockUSDC.balanceOf(owner.address);
      
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(feeBalance);
    });

    it("Should transfer ownership (two-step)", async function () {
      await predictionMarket.transferOwnership(user1.address);
      expect(await predictionMarket.pendingOwner()).to.equal(user1.address);
      
      await predictionMarket.connect(user1).acceptOwnership();
      expect(await predictionMarket.owner()).to.equal(user1.address);
    });

    it("Should set/remove resolvers", async function () {
      await predictionMarket.setResolver(user1.address, true);
      expect(await predictionMarket.resolvers(user1.address)).to.be.true;
      
      await predictionMarket.setResolver(user1.address, false);
      expect(await predictionMarket.resolvers(user1.address)).to.be.false;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle prediction with only YES bets", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      await mockUSDC.connect(user1).approve(await predictionMarket.getAddress(), toUSDC(10000));
      await predictionMarket.connect(user1).placeBet(1, true, toUSDC(100));
      
      // Resolve YES wins
      await predictionMarket.resolvePrediction(1, true);
      
      // Winner should get their stake back (no losers pool)
      const balanceBefore = await mockUSDC.balanceOf(user1.address);
      await predictionMarket.connect(user1).claimWinnings(1);
      const balanceAfter = await mockUSDC.balanceOf(user1.address);
      
      expect(balanceAfter - balanceBefore).to.equal(toUSDC(100));
    });

    it("Should return 50/50 prices for empty pool", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      const prices = await predictionMarket.getPrices(1);
      expect(prices.yesPrice).to.equal(5000);
      expect(prices.noPrice).to.equal(5000);
    });

    it("Should check if prediction is active", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      await predictionMarket.registerPrediction(1, creator.address, deadline);
      
      expect(await predictionMarket.isPredictionActive(1)).to.be.true;
      
      await predictionMarket.cancelPrediction(1, "Test");
      expect(await predictionMarket.isPredictionActive(1)).to.be.false;
    });
  });

  describe("Gas Optimization", function () {
    it("Should batch register efficiently", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 86400;
      const ids = Array.from({ length: 10 }, (_, i) => i + 1);
      const creators = Array(10).fill(creator.address);
      const deadlines = Array(10).fill(deadline);
      
      const tx = await predictionMarket.registerPredictionsBatch(ids, creators, deadlines);
      const receipt = await tx.wait();
      
      console.log(`Gas used for batch registering 10 predictions: ${receipt.gasUsed.toString()}`);
      
      // Verify all registered
      for (let i = 1; i <= 10; i++) {
        const pred = await predictionMarket.getPrediction(i);
        expect(pred.registered).to.be.true;
      }
    });
  });
});
