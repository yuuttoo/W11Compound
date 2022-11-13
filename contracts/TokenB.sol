// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenB is ERC20 {
    constructor(string memory name, string memory symbol, uint supply) ERC20(name, symbol) {
        _mint(msg.sender, supply);
    }
}