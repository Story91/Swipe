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

    for (const user of [alice, bob, creator]) {
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

      const pred = await market.predictions(1);
      const balance = await token.balanceOf(await market.getAddress());
      const owed = pred.yesPool + pred.noPool + (await market.platformFeeBalance());

      expect(balance).to.equal(owed);
    });
  });

  describe("exitEarly cannot be used to dodge a loss", function () {
    // Read createdAt/deadline from the contract rather than deriving them
    // from what openMarket was asked for: registerPrediction mines its own
    // block, so a one-second drift is enough to flip a boundary assertion.
    async function windowOf(id) {
      const pred = await market.predictions(id);
      return {
        createdAt: Number(pred.createdAt),
        deadline: Number(pred.deadline),
        span: Number(pred.deadline) - Number(pred.createdAt),
      };
    }

    // Sets the timestamp for the next block without mining an empty one:
    // the following transaction is what lands on it. Mining a block here
    // first would leave the actual exitEarly call one automined second
    // later than intended, which is fatal precision at an exact boundary.
    async function warpTo(timestamp) {
      await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
    }

    // Bob rides 500 on NO — a bet he expects to lose — and holds a
    // token-sized YES position as the sole YES backer. If he could exit that
    // YES position down to zero, yesPool would go to zero, resolution would
    // find no winners, the market would become refundable, and he would
    // recover the full 500 NO stake instead of forfeiting it.
    async function buildExploitPosition() {
      await openMarket(1, DAY);
      await market.connect(bob).placeBet(1, false, usd(500));
      await market.connect(bob).placeBet(1, true, usd(1));
    }

    // The guard's boundary is `elapsed * 4 >= window * 3`, and the difference
    // between that and `>` only exists on the one second where the two sides
    // are equal — which needs a window divisible by 4. openMarket cannot give
    // one: registerPrediction mines its own block, so the span lands a second
    // short of what was asked for and `ceil(span * 3 / 4)` overshoots the
    // boundary. A test built on it therefore passes against `>=` and `>`
    // alike, and cannot see the boundary move. Pinning the registration
    // block's timestamp makes the span exact.
    async function buildExploitPositionOnExactSpan(span) {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const createdAt = now + 10;
      await ethers.provider.send("evm_setNextBlockTimestamp", [createdAt]);
      await market.registerPrediction(1, creator.address, createdAt + span);

      const pred = await market.predictions(1);
      expect(Number(pred.createdAt)).to.equal(createdAt);
      expect(Number(pred.deadline) - createdAt).to.equal(span);
      expect(span % 4).to.equal(0); // or the exact boundary is unreachable

      await market.connect(bob).placeBet(1, false, usd(500));
      await market.connect(bob).placeBet(1, true, usd(1));

      return { createdAt, boundary: createdAt + (span * 3) / 4 };
    }

    it("refuses an exit that would empty the winning pool in the final quarter", async function () {
      await buildExploitPosition();
      const { createdAt, span } = await windowOf(1);

      // Well inside the final quarter, where the outcome is knowable.
      await warpTo(createdAt + Math.ceil((span * 3) / 4) + 1);

      await expect(
        market.connect(bob).exitEarly(1, true, usd(1))
      ).to.be.revertedWith("Would empty the pool");
    });

    it("allows the same exit before the final quarter", async function () {
      await buildExploitPosition();
      const { createdAt, span } = await windowOf(1);

      // Roughly halfway through the market's life. This is the behaviour
      // being deliberately bought back: a sole backer of a side — the
      // common case in a thin market — can still exit in full here.
      await warpTo(createdAt + Math.floor(span / 2));

      await market.connect(bob).exitEarly(1, true, usd(1));

      expect((await market.predictions(1)).yesPool).to.equal(0);
    });

    it("still allows the exit one second before the three-quarter mark", async function () {
      await buildExploitPosition();
      const { createdAt, span } = await windowOf(1);
      const boundary = createdAt + Math.ceil((span * 3) / 4);

      await warpTo(boundary - 1);
      await market.connect(bob).exitEarly(1, true, usd(1));

      expect((await market.predictions(1)).yesPool).to.equal(0);
    });

    it("refuses the exit at exactly the three-quarter mark", async function () {
      // DAY is divisible by 4, so elapsed * 4 == window * 3 here exactly. This
      // is the second the guard's `>=` claims and `>` would give away.
      const { boundary } = await buildExploitPositionOnExactSpan(DAY);

      await warpTo(boundary);

      await expect(
        market.connect(bob).exitEarly(1, true, usd(1))
      ).to.be.revertedWith("Would empty the pool");
    });

    it("allows the exit on the last second before that exact mark", async function () {
      const { boundary } = await buildExploitPositionOnExactSpan(DAY);

      await warpTo(boundary - 1);
      await market.connect(bob).exitEarly(1, true, usd(1));

      expect((await market.predictions(1)).yesPool).to.equal(0);
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
      // Well before the final quarter, so the pool-emptying guard does not
      // apply and a sole backer can exit in full — the common case in a
      // thin market.
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
      // Upper bound alone passes for an implementation that wipes the weight
      // entirely, which would silently confiscate the exiter's share of the
      // losers' pool. The -1n absorbs the deliberate round-up on removal.
      expect(after.weightedYes).to.be.gte((before.weightedYes * 60n) / 100n - 1n);
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

  describe("conservation", function () {
    it("never pays out more than the market took in, across random mixes", async function () {
      const HOUR = 60 * 60;
      const actors = [alice, bob, creator];

      for (const user of actors) {
        await token.mint(user.address, usd(100000));
        await token.connect(user).approve(await market.getAddress(), usd(100000));
      }

      // Deterministic pseudo-random, so a failure is reproducible.
      let seed = 42;
      const rand = (n) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
      };

      for (let round = 0; round < 12; round++) {
        const id = 100 + round;
        const window = (1 + rand(6)) * HOUR;
        const deadline = await deadlineIn(window);
        await market.registerPrediction(id, creator.address, deadline);
        // From the contract, not derived: registration mines its own block.
        const createdAt = Number((await market.predictions(id)).createdAt);

        const marketBefore = await token.balanceOf(await market.getAddress());
        let staked = 0n;

        for (let i = 0; i < 6; i++) {
          const user = actors[rand(actors.length)];
          const amount = usd(1 + rand(50));
          const isYes = rand(2) === 0;

          const at = createdAt + rand(window - 1);
          const now = (await ethers.provider.getBlock("latest")).timestamp;
          if (at > now) {
            await ethers.provider.send("evm_setNextBlockTimestamp", [at]);
            await ethers.provider.send("evm_mine", []);
          }

          await market.connect(user).placeBet(id, isYes, amount);
          staked += amount;

          // Sometimes leave again.
          if (rand(3) === 0) {
            const pos = await market.positions(id, user.address);
            const held = isYes ? pos.yesAmount : pos.noAmount;
            if (held > 0n) {
              const out = held / 2n > 0n ? held / 2n : held;
              try {
                await market.connect(user).exitEarly(id, isYes, out);
              } catch {
                // "Exit value too small" is a legitimate refusal, not a failure.
              }
            }
          }
        }

        // The bound below is an aggregate and cannot see a per-user weight
        // ledger that has drifted from the stake backing it — a stale weight
        // inflates numerator and denominator together. This is the check that
        // does see it: weight can never exceed what the remaining stake could
        // have earned at the best bracket (x1.50).
        for (const user of actors) {
          const pos = await market.positions(id, user.address);
          expect(pos.weightedYes * 10000n).to.be.lte(pos.yesAmount * 15000n);
          expect(pos.weightedNo * 10000n).to.be.lte(pos.noAmount * 15000n);
        }
        const ledger = await market.predictions(id);
        expect(ledger.weightedYesPool * 10000n).to.be.lte(ledger.yesPool * 15000n);
        expect(ledger.weightedNoPool * 10000n).to.be.lte(ledger.noPool * 15000n);

        await warpPast(deadline);
        await market.connect(resolver).resolvePrediction(id, rand(2) === 0);

        const pred = await market.predictions(id);
        for (const user of actors) {
          try {
            if (pred.refundable) {
              await market.connect(user).claimRefund(id);
            } else {
              await market.connect(user).claimWinnings(id);
            }
          } catch {
            // Nothing to claim for this actor in this market.
          }
        }

        const marketAfter = await token.balanceOf(await market.getAddress());
        // The contract may keep dust and fees, but must never have paid out
        // more than this market's stakes brought in.
        expect(marketAfter).to.be.gte(marketBefore);
        expect(marketAfter - marketBefore).to.be.lte(staked);
      }
    });
  });

  describe("V3 additions do not weaken the audit fixes", function () {
    it("still refuses to resolve before the deadline", async function () {
      await openMarket(1, DAY);
      await market.connect(alice).placeBet(1, true, usd(10));
      await expect(
        market.connect(resolver).resolvePrediction(1, true)
      ).to.be.revertedWith("Deadline not reached");
    });

    it("still lets anyone open refunds past the grace period", async function () {
      const deadline = await openMarket(1, DAY);
      await market.connect(alice).placeBet(1, true, usd(10));
      await warpPast(deadline + 31 * DAY);

      await market.connect(alice).enableRefundsAfterGrace(1);
      expect((await market.predictions(1)).refundable).to.equal(true);
    });

    it("never lets the platform withdraw a live stake", async function () {
      await openMarket(1, DAY);
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));

      // 200 tokens sit in the contract, all of it live stake — no bet has
      // resolved, exited, or accrued a fee yet. platformFeeBalance is what
      // withdrawPlatformFees actually moves, so it being zero here, and the
      // withdrawal reverting, is the proof the platform cannot reach the stake.
      expect(await market.platformFeeBalance()).to.equal(0);
      await expect(market.withdrawPlatformFees(owner.address)).to.be.revertedWith(
        "Nothing to withdraw"
      );
    });
  });
});
