/* eslint-disable max-len */
/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable prefer-destructuring */
const { time, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const path = require('path');
const {
  setupAddresses,
  setupEnvironment,
  setupToken,
  setupSuspiciousContract,
} = require('../utils');

let adr;
let env;

const scriptName = path.basename(__filename, '.js');

describe(scriptName, () => {
  beforeEach(async () => {
    adr = await setupAddresses();
    env = await setupEnvironment(adr.lssAdmin,
      adr.lssRecoveryAdmin,
      adr.lssPauseAdmin,
      adr.lssInitialHolder,
      adr.lssBackupAdmin);
    lerc20Token = await setupToken(2000000,
      'Random Token',
      'RAND',
      adr.lerc20InitialHolder,
      adr.lerc20Admin.address,
      adr.lerc20BackupAdmin.address,
      Number(time.duration.days(1)),
      env.lssController.address);
    reportedToken = await setupToken(2000000,
      'Reported Token',
      'REPORT',
      adr.lerc20InitialHolder,
      adr.regularUser5.address,
      adr.lerc20BackupAdmin.address,
      Number(time.duration.days(1)),
      env.lssController.address);
    suspiciousContract = await setupSuspiciousContract(adr.lssSuspiciousContractDeployer, env.lssGovernance.address);
    nonSuspiciousContract = await setupSuspiciousContract(adr.lssSuspiciousContractDeployer, env.lssGovernance.address);

    await env.lssController.connect(adr.lssAdmin).setWhitelist([env.lssReporting.address], true);
    await env.lssController.connect(adr.lssAdmin).setDexList([adr.dexAddress.address], true);

    await env.lssGovernance.connect(adr.lssAdmin).addCommitteeMembers([
      adr.member1.address,
      adr.member2.address,
      adr.member3.address,
      adr.member4.address]);

    await env.lssToken.connect(adr.lssInitialHolder)
      .transfer(adr.reporter1.address, env.stakingAmount * 3);
    await env.lssToken.connect(adr.lssInitialHolder)
      .transfer(adr.reporter2.address, env.stakingAmount * 3);

    await lerc20Token.connect(adr.lerc20InitialHolder).transfer(adr.maliciousActor1.address, 1000);
    await lerc20Token.connect(adr.lerc20InitialHolder).transfer(reportedToken.address, 1000);

    await env.lssToken.connect(adr.reporter1).approve(env.lssReporting.address, env.stakingAmount * 3);
    await env.lssToken.connect(adr.reporter2).approve(env.lssReporting.address, env.stakingAmount * 3);

    await ethers.provider.send('evm_increaseTime', [
      Number(time.duration.minutes(5)),
    ]);

    // Report id: 1
    await env.lssReporting.connect(adr.reporter1)
      .report(lerc20Token.address, adr.maliciousActor1.address);
    // Report id: 2
    await env.lssReporting.connect(adr.reporter1)
      .report(lerc20Token.address, reportedToken.address);
    // Report id: 3
    await env.lssReporting.connect(adr.reporter2)
      .report(lerc20Token.address, suspiciousContract.address);
  });

  describe('when everyone votes negatively', () => {
    beforeEach(async () => {
      // votes for reported account
      await env.lssGovernance.connect(adr.lssAdmin).losslessVote(1, false);
      await env.lssGovernance.connect(adr.lerc20Admin).tokenOwnersVote(1, false);
      await env.lssGovernance.connect(adr.member1).committeeMemberVote(1, false);
      await env.lssGovernance.connect(adr.member2).committeeMemberVote(1, false);
      await env.lssGovernance.connect(adr.member3).committeeMemberVote(1, false);
      await env.lssGovernance.connect(adr.member4).committeeMemberVote(1, false);

      // votes for reported smart contract
      await env.lssGovernance.connect(adr.lssAdmin).losslessVote(3, false);
      await env.lssGovernance.connect(adr.lerc20Admin).tokenOwnersVote(3, false);
      await env.lssGovernance.connect(adr.member1).committeeMemberVote(3, false);
      await env.lssGovernance.connect(adr.member2).committeeMemberVote(3, false);
      await env.lssGovernance.connect(adr.member3).committeeMemberVote(3, false);
      await env.lssGovernance.connect(adr.member4).committeeMemberVote(3, false);
    });

    it('should let reported address retrieve compensation', async () => {
      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker2.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker3.address, env.stakingAmount * 2);

      await env.lssToken.connect(adr.staker1)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.staker2)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.staker3)
        .approve(env.lssStaking.address, env.stakingAmount * 2);

      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssStaking.connect(adr.staker1).stake(1);
      await env.lssStaking.connect(adr.staker2).stake(1);
      await env.lssStaking.connect(adr.staker3).stake(1);

      // Solving reports
      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);
      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(3);

      expect(
        await env.lssGovernance.isReportSolved(1),
      ).to.be.equal(true);

      expect(
        await env.lssGovernance.reportResolution(1),
      ).to.be.equal(false);

      // Smart contract report should have failed in favor of smart contract
      expect(
        await env.lssGovernance.isReportSolved(3),
      ).to.be.equal(true);

      expect(
        await env.lssGovernance.reportResolution(3),
      ).to.be.equal(false);

      // New function should only be called by smart contracts
      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveSmartContractCompensation(),
      ).to.be.revertedWith('LSS: Sender is not a smart contract');

      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
      ).to.emit(env.lssGovernance, 'CompensationRetrieval').withArgs(
        adr.maliciousActor1.address,
        20,
      );

      // Smart contract should be able to retrieve its compensation
      await expect(
        suspiciousContract.connect(adr.lssSuspiciousContractDeployer).retrieveLSSCompensation(),
      ).to.emit(env.lssGovernance, 'CompensationRetrieval').withArgs(
        suspiciousContract.address,
        20,
      );

      const compensationPercentage = await env.lssGovernance.compensationPercentage();

      expect(
        await env.lssToken.balanceOf(adr.maliciousActor1.address),
      ).to.be.equal((env.reportingAmount * compensationPercentage) / 100);

      // Smart contract lss token should have been increased by compensation percentage
      expect(
        await env.lssToken.balanceOf(suspiciousContract.address),
      ).to.be.equal((env.reportingAmount * compensationPercentage) / 100);
    });

    it('should revert if tries to retrieve twice', async () => {
      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker2.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker3.address, env.stakingAmount * 2);

      await env.lssToken.connect(adr.staker1)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.staker2)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.staker3)
        .approve(env.lssStaking.address, env.stakingAmount * 2);

      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssStaking.connect(adr.staker1).stake(1);
      await env.lssStaking.connect(adr.staker2).stake(1);
      await env.lssStaking.connect(adr.staker3).stake(1);

      // Solving reports
      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);
      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(3);

      expect(
        await env.lssGovernance.isReportSolved(1),
      ).to.be.equal(true);

      expect(
        await env.lssGovernance.reportResolution(1),
      ).to.be.equal(false);

      // Smart contract report should have failed in favor of smart contract
      expect(
        await env.lssGovernance.isReportSolved(3),
      ).to.be.equal(true);

      expect(
        await env.lssGovernance.reportResolution(3),
      ).to.be.equal(false);

      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
      ).to.not.be.reverted;

      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
      ).to.be.revertedWith('LSS: Already retrieved');

      // Smart contract should be able to retrieve its compensation only once
      await expect(
        suspiciousContract.connect(adr.lssSuspiciousContractDeployer).retrieveLSSCompensation(),
      ).to.emit(env.lssGovernance, 'CompensationRetrieval').withArgs(
        suspiciousContract.address,
        20,
      );

      await expect(
        suspiciousContract.connect(adr.lssSuspiciousContractDeployer).retrieveLSSCompensation(),
      ).to.be.revertedWith('LSS: Already retrieved');
    });

    it('should revert if other than the afflicted tries to retrieve', async () => {
      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker2.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker3.address, env.stakingAmount * 2);

      await env.lssToken.connect(adr.staker1)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.staker2)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.staker3)
        .approve(env.lssStaking.address, env.stakingAmount * 2);

      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssStaking.connect(adr.staker1).stake(1);
      await env.lssStaking.connect(adr.staker2).stake(1);
      await env.lssStaking.connect(adr.staker3).stake(1);

      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);

      expect(
        await env.lssGovernance.isReportSolved(1),
      ).to.be.equal(true);

      expect(
        await env.lssGovernance.reportResolution(1),
      ).to.be.equal(false);

      await expect(
        env.lssGovernance.connect(adr.regularUser1).retrieveCompensation(),
      ).to.be.revertedWith('LSS: No retribution assigned');

      // Smart contracts should only be able to retrieve its own compensations
      await expect(
        nonSuspiciousContract.connect(adr.lssSuspiciousContractDeployer).retrieveLSSCompensation(),
      ).to.be.revertedWith('LSS: No retribution assigned');
    });

    it('should revert if called by other than the governance contract', async () => {
      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker1.address, env.stakingAmount + env.stakingAmount);
      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker2.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.lssInitialHolder)
        .transfer(adr.staker3.address, env.stakingAmount * 2);

      await env.lssToken.connect(adr.staker1)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.staker2)
        .approve(env.lssStaking.address, env.stakingAmount * 2);
      await env.lssToken.connect(adr.staker3)
        .approve(env.lssStaking.address, env.stakingAmount * 2);

      await ethers.provider.send('evm_increaseTime', [
        Number(time.duration.minutes(5)),
      ]);

      await env.lssStaking.connect(adr.staker1).stake(1);
      await env.lssStaking.connect(adr.staker2).stake(1);
      await env.lssStaking.connect(adr.staker3).stake(1);

      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);

      expect(
        await env.lssGovernance.isReportSolved(1),
      ).to.be.equal(true);

      expect(
        await env.lssGovernance.reportResolution(1),
      ).to.be.equal(false);

      await expect(
        env.lssReporting.connect(adr.regularUser1).retrieveCompensation(adr.regularUser1.address, 200),
      ).to.be.revertedWith('LSS: Lss SC only');
    });
  });

  describe('when erroneusly reported twice', () => {
    beforeEach(async () => {
      await env.lssGovernance.connect(adr.lssAdmin).losslessVote(1, false);
      await env.lssGovernance.connect(adr.lerc20Admin).tokenOwnersVote(1, false);
      await env.lssGovernance.connect(adr.member1).committeeMemberVote(1, false);
      await env.lssGovernance.connect(adr.member2).committeeMemberVote(1, false);
      await env.lssGovernance.connect(adr.member3).committeeMemberVote(1, false);
      await env.lssGovernance.connect(adr.member4).committeeMemberVote(1, false);

      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(1);

      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
      ).to.emit(env.lssGovernance, 'CompensationRetrieval').withArgs(
        adr.maliciousActor1.address,
        20,
      );

      await env.lssReporting.connect(adr.reporter1)
        .report(lerc20Token.address, adr.maliciousActor1.address);

      await env.lssGovernance.connect(adr.lssAdmin).losslessVote(4, false);
      await env.lssGovernance.connect(adr.lerc20Admin).tokenOwnersVote(4, false);
      await env.lssGovernance.connect(adr.member1).committeeMemberVote(4, false);
      await env.lssGovernance.connect(adr.member2).committeeMemberVote(4, false);
      await env.lssGovernance.connect(adr.member3).committeeMemberVote(4, false);
      await env.lssGovernance.connect(adr.member4).committeeMemberVote(4, false);

      await env.lssGovernance.connect(adr.lssAdmin).resolveReport(4);
    });

    it('should let the address retrieve compensation twice', async () => {
      await expect(
        env.lssGovernance.connect(adr.maliciousActor1).retrieveCompensation(),
      ).to.emit(env.lssGovernance, 'CompensationRetrieval').withArgs(
        adr.maliciousActor1.address,
        20,
      );
    });
  });
});
