// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Test-only stand-in for USDC. Mirrors the two properties the
 *         prediction market depends on: 6 decimals and a standard
 *         boolean-returning ERC-20 interface.
 * @dev    Not for deployment to any live network — mint() is unrestricted.
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    /// @dev USDC uses 6 decimals, not the ERC20 default of 18.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Freely mintable so tests can fund arbitrary accounts.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
