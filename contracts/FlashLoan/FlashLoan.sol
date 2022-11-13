//SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./aave/interfaces/FlashLoanReceiverBase.sol";

contract FlashLoan is FlashLoanReceiverBase {
  using SafeMath for uint;

  event Log(string message, uint val);

  constructor(ILendingPoolAddressesProvider _addressProvider)
    public
    FlashLoanReceiverBase(_addressProvider)
  {}


  function aaveLiquidator(address asset, uint amount) external {
    uint bal = IERC20(asset).balanceOf(address(this));
    require(bal > amount, "bal <= amount");

    address receiver = address(this);

    address[] memory assets = new address[](1);
    assets[0] = asset;

    uint[] memory amounts = new uint[](1);
    amounts[0] = amount;

    // 0 = no debt, 1 = stable, 2 = variable
    // 0 = pay all loaned
    uint[] memory modes = new uint[](1);
    modes[0] = 0;

    address onBehalfOf = address(this);

    bytes memory params = ""; // extra data to pass abi.encode(...)
    uint16 referralCode = 0;

    LENDING_POOL.flashLoan(
      receiver,//此合約
      assets, //借出幣種
      amounts, //借出數量
      modes,   //模式
      onBehalfOf,
      params,
      referralCode
    );
  }

  //aave 回呼此函數 代表已拿到借款
  //在此處理執行邏輯
  function executeOperation(
    address[] calldata assets,
    uint[] calldata amounts,
    uint[] calldata premiums,
    address initiator,
    bytes calldata params
  ) external override returns (bool) {
    // do stuff here (arbitrage, liquidation, etc...)



    // abi.decode(params) to decode params
    for (uint i = 0; i < assets.length; i++) {
      emit Log("borrowed", amounts[i]);
      emit Log("fee", premiums[i]);

      uint amountOwing = amounts[i].add(premiums[i]);//總欠款為借款 + 利息
      IERC20(assets[i]).approve(address(LENDING_POOL), amountOwing);//approve aave取款
    }
    // repay Aave
    return true;
  }
}
