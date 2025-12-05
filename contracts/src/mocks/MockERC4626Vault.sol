// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC4626Vault is ERC4626 {
    uint256 public yieldMultiplierBps = 10000;

    constructor(address _asset) ERC4626(IERC20(_asset)) ERC20("Mock Vault", "mVAULT") {}

    function totalAssets() public view override returns (uint256) {
        return (IERC20(asset()).balanceOf(address(this)) * yieldMultiplierBps) / 10000;
    }

    function accrueYieldBps(uint256 bps) external {
        yieldMultiplierBps = yieldMultiplierBps + bps;
    }

    function setYieldMultiplier(uint256 bps) external {
        yieldMultiplierBps = bps;
    }
}
