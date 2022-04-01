// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

import "../../contracts/Interfaces/ILosslessGovernance.sol";

/// @notice This is just a test contract used to retrieve compensation on unit tests
contract SuspiciousContractTest {

    ILssGovernance private lssGovernance;

    constructor(ILssGovernance _lssGovernance) {
        lssGovernance = _lssGovernance;
    }

    function retrieveLSSCompensation() external {
        lssGovernance.retrieveSmartContractCompensation();
    }
}