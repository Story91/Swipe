const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PredictionMarket", function () {
  let PredictionMarket;
  let predictionMarket;
  let owner, user1, user2, approver;

  beforeEach(async function () {
    [owner, user1, user2, approver] = await ethers.getSigners();

    PredictionMarket = await ethers.getContractFactory("PredictionMarket");
    predictionMarket = await PredictionMarket.deploy();
    await predictionMarket.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await predictionMarket.owner()).to.equal(owner.address);
    });

    it("Should initialize with correct default values", async function () {
      const contractInfo = await predictionMarket.getContractStats();
      expect(contractInfo[0]).to.equal(0); // totalPredictions
      expect(contractInfo[1]).to.equal(100); // platformFee (1%)
      expect(contractInfo[3]).to.equal(ethers.parseEther("0.001")); // minStake
      expect(contractInfo[4]).to.equal(ethers.parseEther("100")); // maxStake
    });
  });

  describe("Prediction Creation", function () {
    it("Should create prediction successfully", async function () {
      const tx = await predictionMarket.createPrediction(
        "Will BTC hit $100k?",
        "Crypto prediction",
        "Crypto",
        "https://example.com/image.png",
        24 // 1 day
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.eventName === "PredictionCreated");

      expect(event).to.not.be.undefined;
      expect(await predictionMarket.nextPredictionId()).to.equal(2);
    });

    it("Should require payment for non-owner predictions", async function () {
      const creationFee = ethers.parseEther("0.01");

      // Enable public creation first
      await predictionMarket.setPublicCreation(true);

      await expect(
        predictionMarket.connect(user1).createPrediction(
          "Test prediction",
          "Description",
          "Category",
          "image.png",
          24
        )
      ).to.be.revertedWith("Pay creation fee");

      await expect(
        predictionMarket.connect(user1).createPrediction(
          "Test prediction",
          "Description",
          "Category",
          "image.png",
          24,
          { value: creationFee }
        )
      ).to.not.be.reverted;
    });
  });

  describe("Staking", function () {
    let predictionId;

    beforeEach(async function () {
      const tx = await predictionMarket.createPrediction(
        "Will ETH hit $5k?",
        "Ethereum prediction",
        "Crypto",
        "image.png",
        24
      );
      const receipt = await tx.wait();
      predictionId = 1;
    });

    it("Should place stake successfully", async function () {
      const stakeAmount = ethers.parseEther("1.0");

      await expect(
        predictionMarket.connect(user1).placeStake(predictionId, true, {
          value: stakeAmount
        })
      ).to.not.be.reverted;

      const prediction = await predictionMarket.getPredictionBasic(predictionId);
      expect(prediction.yesTotalAmount).to.equal(stakeAmount);
    });

    it("Should reject stakes below minimum", async function () {
      const smallStake = ethers.parseEther("0.0005");

      await expect(
        predictionMarket.connect(user1).placeStake(predictionId, true, {
          value: smallStake
        })
      ).to.be.revertedWith("Stake too low");
    });

    it("Should reject stakes above maximum", async function () {
      const largeStake = ethers.parseEther("101");

      await expect(
        predictionMarket.connect(user1).placeStake(predictionId, true, {
          value: largeStake
        })
      ).to.be.revertedWith("Stake too high");
    });
  });

  describe("Admin Functions", function () {
    let predictionId;

    beforeEach(async function () {
      const tx = await predictionMarket.createPrediction(
        "Test prediction",
        "Description",
        "Category",
        "image.png",
        24
      );
      predictionId = 1;
    });

    it("Should resolve prediction as admin", async function () {
      // Add some stakes first
      await predictionMarket.connect(user1).placeStake(predictionId, true, {
        value: ethers.parseEther("1.0")
      });
      await predictionMarket.connect(user2).placeStake(predictionId, false, {
        value: ethers.parseEther("0.5")
      });

      // Fast forward time past deadline
      await ethers.provider.send("evm_increaseTime", [25 * 60 * 60]); // 25 hours
      await ethers.provider.send("evm_mine");

      await expect(
        predictionMarket.resolvePrediction(predictionId, true)
      ).to.not.be.reverted;

      const prediction = await predictionMarket.getPredictionBasic(predictionId);
      expect(prediction.resolved).to.be.true;
      expect(prediction.outcome).to.be.true;
    });

    it("Should set approver", async function () {
      await predictionMarket.setApprover(approver.address, true);
      expect(await predictionMarket.approvers(approver.address)).to.be.true;
    });
  });

  describe("Approver Functions", function () {
    let predictionId;

    beforeEach(async function () {
      // Enable public creation
      await predictionMarket.setPublicCreation(true);

      // Create prediction as user
      const tx = await predictionMarket.connect(user1).createPrediction(
        "Public prediction",
        "Description",
        "Category",
        "image.png",
        24,
        { value: ethers.parseEther("0.01") }
      );
      predictionId = 1;

      // Set approver
      await predictionMarket.setApprover(approver.address, true);
    });

    it("Should approve prediction", async function () {
      await expect(
        predictionMarket.connect(approver).approvePrediction(predictionId)
      ).to.not.be.reverted;

      const prediction = await predictionMarket.getPredictionBasic(predictionId);
      expect(prediction.approved).to.be.true;
    });

    it("Should reject prediction", async function () {
      await expect(
        predictionMarket.connect(approver).rejectPrediction(predictionId, "Inappropriate content")
      ).to.not.be.reverted;

      const extendedInfo = await predictionMarket.getPredictionExtended(predictionId);
      expect(extendedInfo[2]).to.be.true; // cancelled status
    });
  });

  describe("Payout Calculations", function () {
    let predictionId;

    beforeEach(async function () {
      const tx = await predictionMarket.createPrediction(
        "Test payout prediction",
        "Description",
        "Category",
        "image.png",
        24
      );
      predictionId = 1;

      // Add stakes
      await predictionMarket.connect(user1).placeStake(predictionId, true, {
        value: ethers.parseEther("2.0")
      });
      await predictionMarket.connect(user2).placeStake(predictionId, false, {
        value: ethers.parseEther("1.0")
      });

      // Resolve as YES
      await ethers.provider.send("evm_increaseTime", [25 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      await predictionMarket.resolvePrediction(predictionId, true);
    });

    it("Should calculate correct payout", async function () {
      const payout = await predictionMarket.calculatePayout(predictionId, user1.address);

      // User1 staked 2 ETH on YES, should get 2 ETH + share of 1 ETH losers pool
      // Platform fee: 1 ETH × 1% = 0.01 ETH
      // Distributable: 0.99 ETH
      // User1 share: (2/2) × 0.99 = 0.99 ETH
      // Total payout: 2 + 0.99 = 2.99 ETH
      expect(payout.payout).to.equal(ethers.parseEther("2.99"));
      expect(payout.profit).to.equal(ethers.parseEther("0.99"));
    });

    it("Should allow claiming rewards", async function () {
      const initialBalance = await ethers.provider.getBalance(user1.address);

      await expect(
        predictionMarket.connect(user1).claimReward(predictionId)
      ).to.not.be.reverted;

      const finalBalance = await ethers.provider.getBalance(user1.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });
  });
});
