const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Every describe block below maps to a finding in
 * docs/superpowers/specs/2026-08-17-usdc-dualpool-security-audit.md.
 * These are the proof that each one is closed, not just claimed to be.
 */
describe("PredictionMarket_USDG_DualPool", function () {
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

    const Market = await ethers.getContractFactory("PredictionMarket_USDG_DualPool");
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
});
