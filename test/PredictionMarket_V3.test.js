const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Every describe block below maps to a finding in
 * docs/superpowers/specs/2026-08-17-usdc-dualpool-security-audit.md.
 * These are the proof that each one is closed, not just claimed to be.
 */
describe("PredictionMarket_V3", function () {
  let market, token, owner, resolver, creator, alice, bob;

  const DEC = 6;
  const usd = (n) => ethers.parseUnits(n.toString(), DEC);
  const DAY = 24 * 60 * 60;

  async function deadlineIn(seconds) {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + seconds;
  }

  async function warpPast(timestamp) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp + 1]);
    await ethers.provider.send("evm_mine", []);
  }

  beforeEach(async function () {
    [owner, resolver, creator, alice, bob] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    token = await MockUSDC.deploy();
    await token.waitForDeployment();

    const Market = await ethers.getContractFactory("PredictionMarket_V3");
    market = await Market.deploy(await token.getAddress());
    await market.waitForDeployment();

    for (const user of [alice, bob]) {
      await token.mint(user.address, usd(10000));
      await token.connect(user).approve(await market.getAddress(), usd(10000));
    }

    await market.setResolver(resolver.address, true);
  });

  async function openMarket(id = 1, seconds = DAY) {
    const deadline = await deadlineIn(seconds);
    await market.registerPrediction(id, creator.address, deadline);
    return deadline;
  }

  // ---------------------------------------------------------------- finding 1
  describe("no house-takes-all when nobody backs the winner", function () {
    it("makes the market refundable instead of seizing the pool", async function () {
      const deadline = await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, true, usd(100));
      await warpPast(deadline);

      // Resolver picks NO — the side nobody backed.
      await market.connect(resolver).resolvePrediction(1, false);

      const pred = await market.getPrediction(1);
      expect(pred.refundable).to.equal(true);
      expect(await market.platformFeeBalance()).to.equal(0n);
    });

    it("returns every staker their principal in full", async function () {
      const deadline = await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await warpPast(deadline);
      await market.connect(resolver).resolvePrediction(1, false);

      const before = await token.balanceOf(alice.address);
      await market.connect(alice).claimRefund(1);
      expect(await token.balanceOf(alice.address) - before).to.equal(usd(100));
    });
  });

  // ---------------------------------------------------------------- finding 2
  describe("no owner path to user funds", function () {
    it("does not expose a rescue function for the collateral", function () {
      expect(market.interface.hasFunction?.("rescueOrphanedUSDC")).to.not.equal(true);
      const names = market.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f.name);
      expect(names).to.not.include("rescueOrphanedUSDC");
    });

    it("refuses to rescue the collateral token", async function () {
      await expect(
        market.rescueForeignToken(await token.getAddress(), owner.address, usd(1))
      ).to.be.revertedWith("Collateral is not rescuable");
    });

    it("lets the owner withdraw booked fees only, never stakes", async function () {
      const deadline = await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
      await warpPast(deadline);
      await market.connect(resolver).resolvePrediction(1, true);

      const fees = await market.platformFeeBalance();
      expect(fees).to.equal(usd(1)); // 1% of the 100 losers pool

      await market.withdrawPlatformFees(owner.address);
      await expect(market.withdrawPlatformFees(owner.address)).to.be.revertedWith(
        "Nothing to withdraw"
      );
      // Alice's winnings are still there to claim.
      await market.connect(alice).claimWinnings(1);
    });
  });

  // ---------------------------------------------------------------- finding 3
  describe("resolution requires the deadline to have passed", function () {
    it("rejects settlement while betting is open", async function () {
      await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));

      await expect(
        market.connect(resolver).resolvePrediction(1, true)
      ).to.be.revertedWith("Deadline not reached");
    });

    it("allows it once the deadline is reached", async function () {
      const deadline = await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
      await warpPast(deadline);

      await market.connect(resolver).resolvePrediction(1, true);
      expect((await market.getPrediction(1)).resolved).to.equal(true);
    });
  });

  // ---------------------------------------------------------------- finding 4
  describe("payouts are fixed at resolution", function () {
    it("ignores fee changes made after the market resolved", async function () {
      const deadline = await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
      await warpPast(deadline);
      await market.connect(resolver).resolvePrediction(1, true);

      // Owner drops fees to zero after the fact.
      await market.setPlatformFee(0);
      await market.setCreatorFee(0);

      const before = await token.balanceOf(alice.address);
      await market.connect(alice).claimWinnings(1);
      const payout = (await token.balanceOf(alice.address)) - before;

      // 100 stake + (100 losers - 1% - 0.5%) = 198.5, at the rates in force
      // when the market was resolved.
      expect(payout).to.equal(usd(198.5));
    });
  });

  // ---------------------------------------------------------------- finding 5
  describe("early exit accounting is exact", function () {
    it("retains precisely what it does not pay out", async function () {
      await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));

      const feesBefore = await market.platformFeeBalance();
      const aliceBefore = await token.balanceOf(alice.address);
      const contractBefore = await token.balanceOf(await market.getAddress());

      await market.connect(alice).exitEarly(1, true, usd(50));

      const paidOut = (await token.balanceOf(alice.address)) - aliceBefore;
      const retained = (await market.platformFeeBalance()) - feesBefore;
      const contractDelta = contractBefore - (await token.balanceOf(await market.getAddress()));

      // Nothing is unaccounted for: the pool gave up 50, the user got paidOut,
      // and the difference is booked as fees.
      expect(paidOut).to.equal(contractDelta);
      expect(paidOut + retained).to.equal(usd(50));
    });

    it("leaves the contract solvent for the remaining participants", async function () {
      await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
      await market.connect(alice).exitEarly(1, true, usd(50));

      const pred = await market.getPrediction(1);
      const balance = await token.balanceOf(await market.getAddress());
      const owed = pred.yesPool + pred.noPool + (await market.platformFeeBalance());

      expect(balance).to.equal(owed);
    });
  });

  // ---------------------------------------------------------------- finding 7
  describe("stakes survive the loss of every privileged key", function () {
    it("refuses refunds before the grace period is over", async function () {
      const deadline = await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await warpPast(deadline);

      await expect(market.enableRefundsAfterGrace(1)).to.be.revertedWith(
        "Grace period not over"
      );
    });

    it("lets anyone open refunds once abandoned, with no privileged call", async function () {
      const deadline = await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await warpPast(deadline + 31 * DAY);

      // bob is not owner, not resolver, and has no position in this market.
      await market.connect(bob).enableRefundsAfterGrace(1);

      const before = await token.balanceOf(alice.address);
      await market.connect(alice).claimRefund(1);
      expect((await token.balanceOf(alice.address)) - before).to.equal(usd(100));
    });
  });

  // ---------------------------------------------------------------- finding 8
  describe("resolver is a separate, revocable role", function () {
    it("lets a resolver settle without being the owner", async function () {
      const deadline = await openMarket();
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
      await warpPast(deadline);

      await market.connect(resolver).resolvePrediction(1, true);
      expect(await market.owner()).to.not.equal(resolver.address);
    });

    it("revokes a compromised resolver without touching ownership", async function () {
      const deadline = await openMarket(2);
      await market.setResolver(resolver.address, false);
      await warpPast(deadline);

      await expect(
        market.connect(resolver).resolvePrediction(2, true)
      ).to.be.revertedWith("Not a resolver");
    });

    it("rejects strangers outright", async function () {
      const deadline = await openMarket();
      await warpPast(deadline);
      await expect(
        market.connect(alice).resolvePrediction(1, true)
      ).to.be.revertedWith("Not a resolver");
    });
  });

  describe("ownership transfer is two-step", function () {
    it("does not hand over control until accepted", async function () {
      await market.transferOwnership(alice.address);
      expect(await market.owner()).to.equal(owner.address);

      await market.connect(alice).acceptOwnership();
      expect(await market.owner()).to.equal(alice.address);
    });
  });

  describe("registration", function () {
    it("reverts the whole batch on a bad entry rather than skipping it", async function () {
      const deadline = await deadlineIn(DAY);
      await expect(
        market.registerPredictionsBatch(
          [10, 11],
          [creator.address, ethers.ZeroAddress],
          [deadline, deadline]
        )
      ).to.be.revertedWith("Creator required");

      expect((await market.getPrediction(10)).registered).to.equal(false);
    });
  });

  // ------------------------------------------------------------ early bonus
  describe("weight brackets", function () {
    // Read createdAt from the contract rather than deriving it from the
    // deadline: registerPrediction mines its own block, so the market's window
    // is not exactly the number of seconds openMarket was asked for, and a
    // one-second drift is enough to flip a boundary assertion.
    async function windowOf(id) {
      const pred = await market.predictions(id);
      return {
        createdAt: Number(pred.createdAt),
        deadline: Number(pred.deadline),
        span: Number(pred.deadline) - Number(pred.createdAt),
      };
    }

    it("pays x1.50 in the first quarter of the market's life", async function () {
      await openMarket(1, 4 * DAY);
      const { createdAt, span } = await windowOf(1);

      expect(await market.weightBpsAt(1, createdAt)).to.equal(15000);
      // One second before the quarter boundary.
      expect(await market.weightBpsAt(1, createdAt + Math.floor(span / 4) - 1)).to.equal(15000);
    });

    it("pays x1.25 in the second quarter", async function () {
      await openMarket(1, 4 * DAY);
      const { createdAt, span } = await windowOf(1);

      // Exactly the quarter boundary is already the second bracket.
      expect(await market.weightBpsAt(1, createdAt + Math.ceil(span / 4))).to.equal(12500);
      expect(await market.weightBpsAt(1, createdAt + Math.floor(span / 2) - 1)).to.equal(12500);
    });

    it("pays x1.00 in the second half and at the deadline", async function () {
      await openMarket(1, 4 * DAY);
      const { createdAt, deadline, span } = await windowOf(1);

      expect(await market.weightBpsAt(1, createdAt + Math.ceil(span / 2))).to.equal(10000);
      expect(await market.weightBpsAt(1, deadline)).to.equal(10000);
    });

    it("uses the same fractions for a two-hour market as a four-day one", async function () {
      const HOUR = 60 * 60;
      await openMarket(2, 2 * HOUR);
      const { createdAt, span } = await windowOf(2);

      // A quarter of two hours is thirty minutes — the same rule, a shorter window.
      expect(await market.weightBpsAt(2, createdAt + Math.floor(span / 4) - 1)).to.equal(15000);
      expect(await market.weightBpsAt(2, createdAt + Math.ceil(span / 4))).to.equal(12500);
      expect(await market.weightBpsAt(2, createdAt + Math.ceil(span / 2))).to.equal(10000);
    });

    it("reverts for a market that does not exist", async function () {
      await expect(market.weightBpsAt(999, 0)).to.be.revertedWith(
        "Prediction not registered"
      );
    });
  });

  describe("weighted payouts", function () {
    it("pays an early backer more than a late one for the same stake", async function () {
      const deadline = await openMarket(1, 4 * DAY);
      const pred = await market.predictions(1);
      const createdAt = Number(pred.createdAt);
      const span = Number(pred.deadline) - createdAt;

      // Alice enters in the first quarter, at x1.50.
      await market.connect(alice).placeBet(1, true, usd(100));

      // Bob enters three quarters of the way through, at x1.00.
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        createdAt + Math.floor((span * 3) / 4),
      ]);
      await ethers.provider.send("evm_mine", []);
      await market.connect(bob).placeBet(1, true, usd(100));

      // Someone has to lose for there to be anything to split.
      await token.mint(owner.address, usd(1000));
      await token.connect(owner).approve(await market.getAddress(), usd(1000));
      await market.connect(owner).placeBet(1, false, usd(200));

      await warpPast(deadline);
      await market.connect(resolver).resolvePrediction(1, true);

      const aliceBefore = await token.balanceOf(alice.address);
      const bobBefore = await token.balanceOf(bob.address);
      await market.connect(alice).claimWinnings(1);
      await market.connect(bob).claimWinnings(1);
      const alicePaid = (await token.balanceOf(alice.address)) - aliceBefore;
      const bobPaid = (await token.balanceOf(bob.address)) - bobBefore;

      expect(alicePaid).to.be.gt(bobPaid);

      // Both get their stake back; only the share of the losers differs, and
      // Alice's share is 1.5x Bob's.
      const aliceProfit = alicePaid - usd(100);
      const bobProfit = bobPaid - usd(100);
      expect(aliceProfit).to.equal((bobProfit * 15000n) / 10000n);
    });

    it("never pays a winner less than their stake", async function () {
      const deadline = await openMarket(1, DAY);
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(1));
      await warpPast(deadline);
      await market.connect(resolver).resolvePrediction(1, true);

      const before = await token.balanceOf(alice.address);
      await market.connect(alice).claimWinnings(1);
      expect((await token.balanceOf(alice.address)) - before).to.be.gte(usd(100));
    });

    it("refunds the raw stake, never the weighted amount", async function () {
      const deadline = await openMarket(1, DAY);
      // First quarter, so the weight is 1.5x — the refund must ignore it.
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(resolver).cancelPrediction(1, "test");

      const before = await token.balanceOf(alice.address);
      await market.connect(alice).claimRefund(1);
      expect((await token.balanceOf(alice.address)) - before).to.equal(usd(100));
    });

    it("does not let a later fee change alter a settled market", async function () {
      const deadline = await openMarket(1, DAY);
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
      await warpPast(deadline);
      await market.connect(resolver).resolvePrediction(1, true);

      await market.setPlatformFee(500);

      const before = await token.balanceOf(alice.address);
      await market.connect(alice).claimWinnings(1);
      const paid = (await token.balanceOf(alice.address)) - before;
      // 100 stake + 100 losers less the 1% + 0.5% charged at resolution.
      expect(paid).to.equal(usd(100) + usd(100) - usd(1) - usd(0.5));
    });
  });

  describe("early exit and weight", function () {
    it("zeroes the weight on a full exit", async function () {
      await openMarket(1, DAY);
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));

      await market.connect(alice).exitEarly(1, true, usd(100));

      const pos = await market.positions(1, alice.address);
      expect(pos.yesAmount).to.equal(0);
      expect(pos.weightedYes).to.equal(0);

      const pred = await market.predictions(1);
      expect(pred.weightedYesPool).to.equal(0);
    });

    it("removes weight in proportion to a partial exit", async function () {
      await openMarket(1, DAY);
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));

      const before = await market.positions(1, alice.address);
      await market.connect(alice).exitEarly(1, true, usd(40));
      const after = await market.positions(1, alice.address);

      expect(after.yesAmount).to.equal(usd(60));
      // 60% of the stake remains, so at most 60% of the weight may remain.
      expect(after.weightedYes).to.be.lte((before.weightedYes * 60n) / 100n);
    });

    it("rounds weight removal against the exiting user", async function () {
      await openMarket(1, DAY);
      // held = 1,000,005 (>= minBet) is divisible by 3 (exit is exactly 1/3 of
      // the stake), but its weighted value at the 1.5x early bracket,
      // 1,500,007, is not divisible by 3 — so the removal fraction does not
      // divide cleanly and rounding is observable.
      await market.connect(alice).placeBet(1, true, 1000005n);
      await market.connect(bob).placeBet(1, false, usd(100));

      const before = await market.positions(1, alice.address);
      await market.connect(alice).exitEarly(1, true, 333335n);
      const after = await market.positions(1, alice.address);

      // Exact proportion would be 2/3 of the weight; rounding must not leave
      // the user with more than that.
      expect(after.weightedYes).to.be.lte((before.weightedYes * 2n) / 3n);
    });

    it("keeps the market solvent after an exit and a re-entry at a lower weight", async function () {
      const deadline = await openMarket(1, 4 * DAY);
      const pred = await market.predictions(1);
      const createdAt = Number(pred.createdAt);
      const span = Number(pred.deadline) - createdAt;

      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
      await market.connect(alice).exitEarly(1, true, usd(50));

      await ethers.provider.send("evm_setNextBlockTimestamp", [
        createdAt + Math.floor((span * 3) / 4),
      ]);
      await ethers.provider.send("evm_mine", []);
      await market.connect(alice).placeBet(1, true, usd(50));

      await warpPast(deadline);
      await market.connect(resolver).resolvePrediction(1, true);

      const contractBefore = await token.balanceOf(await market.getAddress());
      await market.connect(alice).claimWinnings(1);
      const paid = contractBefore - (await token.balanceOf(await market.getAddress()));

      const predAfter = await market.predictions(1);
      expect(paid).to.be.lte(predAfter.yesPool + predAfter.netLosersPool);
    });
  });
});
