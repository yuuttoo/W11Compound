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
  address USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;


  

  event Log(string message, uint val);

  constructor(ILendingPoolAddressesProvider _addressProvider, address swapRouterAddress)
    public
    FlashLoanReceiverBase(_addressProvider)
  {
    swapRouter = ISwapRouter(swapRouterAddress);
  }

  //這裡呼叫aave 有call back會觸發executeOperation   
  function flashloan(address asset, uint amount, address borrower, address cUSDC, address cUNI) external {
    
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

    // extra data to pass abi.encode(...)
    bytes memory params = abi.encode(address(borrower), address(cUSDC), address(cUNI)); 

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
    address user1;
    address cUSDC;
    address cUNI;

    // do stuff here (arbitrage, liquidation, etc...)
    //abi.decode  params from flashLoan function
    {
        (address borrower, 
         address cUSDC_address, 
         address cUNI_address) 
         = abi.decode(params, (address, address, address));
         user1 = borrower;
         cUSDC = cUSDC_address;
         cUNI = cUNI_address;
    }

    //console.log("check decode", user1, cUSDC, cUNI);
    IERC20(assets[0]).approve(address(cUSDC), amounts[0]);//approve cUSDC取用USDC
    //console.log("check approve", assets[0], address(cUSDC));

    //以貸款償還清算user1的欠款
    CErc20(cUSDC).liquidateBorrow(user1, amounts[0], CErc20(cUNI));//reward為抵押品UNI, cUNI作為債權
    console.log("check liquidateBorrow", assets[0], address(cUSDC));

    //從rewardAddress 贖回 UNI 
    {
        //cUNI.redeem(cUNI.balanceOf(address(this)));
    }
    
    uint256 uniAmount = IERC20(UNI).balanceOf(address(this));//本合約UNI餘額
    emit Log( "uniAmount: " ,uniAmount);

    {

   
    //轉UNI為USDC 
    IERC20(UNI).approve(address(swapRouter), uniAmount);

    ISwapRouter.ExactInputSingleParams memory swapParams =
    ISwapRouter.ExactInputSingleParams({
        tokenIn: UNI,
        tokenOut: USDC,
        fee: 3000, // 0.3%
        recipient: address(this),
        deadline: block.timestamp,
        amountIn: uniAmount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    });
    uint256 amountOut = swapRouter.exactInputSingle(swapParams);

    emit Log("amountOut", amountOut);
    }
    //approve aave access 




    {
    //還aave
    for (uint i = 0; i < assets.length; i++) {
      emit Log("borrowed", amounts[i]);
      emit Log("fee", premiums[i]);

      uint amountOwing = amounts[i].add(premiums[i]);//總欠款為借款 + 利息
      IERC20(assets[i]).approve(address(LENDING_POOL), amountOwing);//approve aave取款
    }
     }
    // repay Aave
    return true;
  }
}
