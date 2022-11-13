//SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./aave/interfaces/FlashLoanReceiverBase.sol";
import "../CErc20.sol";
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "hardhat/console.sol";



contract FlashLoan is FlashLoanReceiverBase {
  using SafeMath for uint;

  ISwapRouter swapRouter;
  address UNI = 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984;
  

  event Log(string message, uint val);

  constructor(ILendingPoolAddressesProvider _addressProvider, address swapRouterAddress)
    public
    FlashLoanReceiverBase(_addressProvider)
  {
    swapRouter = ISwapRouter(swapRouterAddress);
  }

  //這裡呼叫aave 有call back會觸發executeOperation   
  function flashloan(address asset, uint amount) external {
    
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
    address borrower;
    CErc20 cUSDC;
    CErc20 cUNI;
    // do stuff here (arbitrage, liquidation, etc...)

    // {
    //     (address borrower, address cUSDCAddress, address cUNIAddress) = 
    //     abi.decode(params, (address, address, address));
    // }

    //以貸款償還user1欠的款
    cUSDC.liquidateBorrow(borrower, amounts[0], cUNI);//reward為抵押品UNI, 送到rewardAddress cUNI

    //從rewardAddress 贖回 UNI 
    cUNI.redeem(cUNI.balanceOf(address(this)));

    
    uint256 uniAmount = IERC20(UNI).balanceOf(address(this));//本合約UNI餘額
    emit Log( "uniAmount: " ,uniAmount);


    //轉UNI為USDC 
    ISwapRouter.ExactInputSingleParams memory swapParams =
    ISwapRouter.ExactInputSingleParams({
        tokenIn: cUNI.underlying(),//UNI
        tokenOut: cUSDC.underlying(),//USDC
        fee: 3000, // 0.3%
        recipient: address(this),
        deadline: block.timestamp,
        amountIn: uniAmount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    });

    uint256 amountOut = swapRouter.exactInputSingle(swapParams);

    emit Log("amountOut", amountOut);

    
    //還aave
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
