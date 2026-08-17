const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * V4 is V3 with one change: opening a market and settling one are separate
 * roles. Everything else is covered by test/PredictionMarket_V3.test.js and is
 * not repeated here.
 *
 * The change exists so market creation can run on a server key. That is only
 * worth anything if the registrar role is genuinely narrow, so these tests
 * spend their effort on what a registrar CANNOT do rather than on what it can.
 */
describe("PredictionMarket_V4 role split", function () {
  let market, token, owner, resolver, registrar, creator, alice, bob;

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
    [owner, resolver, registrar, creator, alice, bob] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    token = await MockUSDC.deploy();
    await token.waitForDeployment();

    const Market = await ethers.getContractFactory("PredictionMarket_V4");
    market = await Market.deploy(await token.getAddress());
    await market.waitForDeployment();

    for (const user of [alice, bob, creator]) {
      await token.mint(user.address, usd(10000));
      await token.connect(user).approve(await market.getAddress(), usd(10000));
    }

    await market.setResolver(resolver.address, true);
    await market.setRegistrar(registrar.address, true);
  });

  describe("a registrar can open markets", function () {
    it("registers one", async function () {
      const deadline = await deadlineIn(DAY);
      await expect(market.connect(registrar).registerPrediction(1, creator.address, deadline))
        .to.emit(market, "PredictionRegistered")
        .withArgs(1, creator.address, deadline);

      const pred = await market.getPrediction(1);
      expect(pred[0]).to.equal(true);
      expect(pred[1]).to.equal(creator.address);
    });

    it("registers a batch", async function () {
      const deadline = await deadlineIn(DAY);
      await market
        .connect(registrar)
        .registerPredictionsBatch(
          [1, 2, 3],
          [creator.address, creator.address, alice.address],
          [deadline, deadline, deadline]
        );

      expect((await market.getPrediction(3))[1]).to.equal(alice.address);
    });
  });

  describe("a registrar can do nothing else", function () {
    // This block is the whole reason V4 exists. If any of these passes, the
    // server key is as dangerous as V3's was and the split bought nothing.
    beforeEach(async function () {
      const deadline = await deadlineIn(DAY);
      await market.connect(registrar).registerPrediction(1, creator.address, deadline);
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
    });

    it("cannot resolve a market", async function () {
      const deadline = (await market.getPrediction(1))[2];
      await warpPast(Number(deadline));
      await expect(market.connect(registrar).resolvePrediction(1, true)).to.be.revertedWith(
        "Not a resolver"
      );
    });

    it("cannot cancel a market", async function () {
      await expect(
        market.connect(registrar).cancelPrediction(1, "because I felt like it")
      ).to.be.revertedWith("Not a resolver");
    });

    it("cannot grant itself the resolver role", async function () {
      await expect(
        market.connect(registrar).setResolver(registrar.address, true)
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });

    it("cannot appoint another registrar", async function () {
      await expect(
        market.connect(registrar).setRegistrar(alice.address, true)
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });

    it("cannot change a fee", async function () {
      await expect(market.connect(registrar).setPlatformFee(9000)).to.be.revertedWithCustomError(
        market,
        "OwnableUnauthorizedAccount"
      );
    });

    it("cannot withdraw platform fees", async function () {
      await expect(
        market.connect(registrar).withdrawPlatformFees(registrar.address)
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });

    it("cannot move the collateral out with the rescue hatch", async function () {
      await expect(
        market
          .connect(registrar)
          .rescueForeignToken(await token.getAddress(), registrar.address, usd(200))
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });

    it("leaves the pools untouched by anything it is allowed to do", async function () {
      const before = await market.getPrediction(1);
      const deadline = await deadlineIn(DAY);
      await market.connect(registrar).registerPrediction(2, creator.address, deadline);
      const after = await market.getPrediction(1);
      expect(after[3]).to.equal(before[3]);
      expect(after[4]).to.equal(before[4]);
    });
  });

  describe("a resolver is not a registrar", function () {
    // The failure this guards against is reuse: if a resolver could also
    // register, anyone automating creation would reach for the resolver key
    // they already have and V4 would be V3 again in practice.
    it("cannot register, even though it can settle", async function () {
      const deadline = await deadlineIn(DAY);
      await expect(
        market.connect(resolver).registerPrediction(1, creator.address, deadline)
      ).to.be.revertedWith("Not a registrar");
    });

    it("cannot register a batch either", async function () {
      const deadline = await deadlineIn(DAY);
      await expect(
        market.connect(resolver).registerPredictionsBatch([1], [creator.address], [deadline])
      ).to.be.revertedWith("Not a registrar");
    });

    it("still settles a market the registrar opened", async function () {
      const deadline = await deadlineIn(DAY);
      await market.connect(registrar).registerPrediction(1, creator.address, deadline);
      await market.connect(alice).placeBet(1, true, usd(100));
      await market.connect(bob).placeBet(1, false, usd(100));
      await warpPast(deadline);

      await expect(market.connect(resolver).resolvePrediction(1, true)).to.emit(
        market,
        "PredictionResolved"
      );
    });
  });

  describe("the owner and everyone else", function () {
    it("lets the owner register without being granted the role", async function () {
      expect(await market.registrars(owner.address)).to.equal(false);
      const deadline = await deadlineIn(DAY);
      await expect(market.registerPrediction(1, creator.address, deadline)).to.emit(
        market,
        "PredictionRegistered"
      );
    });

    it("refuses a stranger", async function () {
      const deadline = await deadlineIn(DAY);
      await expect(
        market.connect(alice).registerPrediction(1, creator.address, deadline)
      ).to.be.revertedWith("Not a registrar");
    });

    it("revokes the role, and the revoked key stops working immediately", async function () {
      const deadline = await deadlineIn(DAY);
      await market.connect(registrar).registerPrediction(1, creator.address, deadline);

      await expect(market.setRegistrar(registrar.address, false))
        .to.emit(market, "RegistrarSet")
        .withArgs(registrar.address, false);

      await expect(
        market.connect(registrar).registerPrediction(2, creator.address, deadline)
      ).to.be.revertedWith("Not a registrar");
    });

    it("refuses the zero address as a registrar", async function () {
      await expect(market.setRegistrar(ethers.ZeroAddress, true)).to.be.revertedWith(
        "Zero address"
      );
    });

    it("does not make the deployer a registrar in storage", async function () {
      // The owner passes the modifier by being the owner, not by holding the
      // role. Writing the role at construction would leave it set on an
      // address that later transfers ownership away.
      expect(await market.registrars(owner.address)).to.equal(false);
    });
  });

  describe("granting the two roles separately does not merge them", function () {
    it("keeps a resolver out of registration after a registrar is added", async function () {
      await market.setRegistrar(alice.address, true);
      const deadline = await deadlineIn(DAY);
      await expect(
        market.connect(resolver).registerPrediction(1, creator.address, deadline)
      ).to.be.revertedWith("Not a registrar");
    });

    it("keeps a registrar out of settlement after a resolver is added", async function () {
      await market.setResolver(bob.address, true);
      const deadline = await deadlineIn(DAY);
      await market.connect(registrar).registerPrediction(1, creator.address, deadline);
      await warpPast(deadline);
      await expect(market.connect(registrar).resolvePrediction(1, true)).to.be.revertedWith(
        "Not a resolver"
      );
    });

    it("lets one address hold both, when that is deliberate", async function () {
      await market.setRegistrar(resolver.address, true);
      const deadline = await deadlineIn(DAY);
      await market.connect(resolver).registerPrediction(1, creator.address, deadline);
      await warpPast(deadline);
      await expect(market.connect(resolver).resolvePrediction(1, true)).to.emit(
        market,
        "PredictionResolved"
      );
    });
  });
});
