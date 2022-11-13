const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {impersonateAccount} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ethers } = require("hardhat");
const { expect } = require("chai");


describe("AAVE flashloan liquidation", function() {


    async function deployFixture() {
        //prepare owner and user account
        const [owner, user1, user2] = await ethers.getSigners(); 
        const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';  
        const uniAddress = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
        const binanceHotWalletAddress = '0xF977814e90dA44bFA03b6295A0616a897441aceC';
        const LENDING_POOL_PROVIDER_ADDRESS = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";
        const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
        let usdc;
        let uni;

        //let formattingTKBPrice = ethers.utils.formatEther(tokenBPrice);

        //check forking by getting Binance USDC, UNI balance
        usdc = await ethers.getContractAt("ERC20", usdcAddress);
        let USDCofBinance = await usdc.balanceOf(binanceHotWalletAddress);
        console.log(`Binance wallet USDC balance: ${USDCofBinance}`); 
        
        uni = await ethers.getContractAt("ERC20", uniAddress);
        let UNIofBinance = await uni.balanceOf(binanceHotWalletAddress);
        console.log(`Binance wallet UNI balance: ${UNIofBinance}`);

        //取得binance wallet 
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [binanceHotWalletAddress],
          });
        
        const binanceWallet = await ethers.getSigner(binanceHotWalletAddress);  


        //部署comptroller 
        const comptrollerFactory = await ethers.getContractFactory("Comptroller");
        const comptroller = await comptrollerFactory.deploy();
        await comptroller.deployed();
        console.log(`comptroller deployed to ${comptroller.address}`);

        //部署simplePriceOracle
        const PriceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
        const priceOracle = await PriceOracleFactory.deploy();
        await priceOracle.deployed();
        console.log(`simplePriceOracle deployed to ${priceOracle.address}`);
        
        
        //部署interestRateModel_
        const InterestRateModel = await ethers.getContractFactory("WhitePaperInterestRateModel");
        const interestRateModel = await InterestRateModel.deploy(
            ethers.utils.parseUnits("0",18),
            ethers.utils.parseUnits("0",18)
        );
        await interestRateModel.deployed();
        console.log(`interestRateModel deployed to ${interestRateModel.address}`);

        //部署cTokenA       
        const cTKAFactory = await ethers.getContractFactory("CErc20");
        const cUSDC = await cTKAFactory.deploy();
        await cUSDC.deployed();
        console.log(`cUSDC deployed to ${cUSDC.address}`);


        //initialize cTokenA
        await cUSDC["initialize(address,address,address,uint256,string,string,uint8)"](
            usdcAddress,
            comptroller.address,
            interestRateModel.address,
            ethers.utils.parseUnits("1", 18),//1:1
            "cUSDC",
            "cUSDC",
            18
        );


        //部署cTokenB
        const cTKBFactory = await ethers.getContractFactory("CErc20");
        const cUNI = await cTKBFactory.deploy();
        await cUNI.deployed();
        console.log(`cUNI deployed to ${cUNI.address}`);
        
        //initialize cTokenB
        await cUNI["initialize(address,address,address,uint256,string,string,uint8)"](
            uniAddress,
            comptroller.address,
            interestRateModel.address,
            ethers.utils.parseUnits("1", 18),//1:1
            "cUNI",
            "cUNI",
            18
        );

    

        //設定priceOracle
        comptroller._setPriceOracle(priceOracle.address);

        await comptroller.connect(owner)._supportMarket(cUSDC.address);
        console.log ("cUSDC added to comptroller market list");

        await comptroller.connect(owner)._supportMarket(cUNI.address);
        console.log ("cUNI added to comptroller market list");


        //Oracle設定 cUSDC 價格 $1
        await priceOracle.connect(owner).setUnderlyingPrice(cUSDC.address, ethers.utils.parseUnits("1",18));
        let cUSDCPrice = await priceOracle.connect(owner).getUnderlyingPrice(cUSDC.address);
        let formattingcUSDCPrice = ethers.utils.formatEther(cUSDCPrice);
        console.log(`cUSDC price: ${formattingcUSDCPrice}`);

        //Oracle設定 cUNI 價格 $10
        await priceOracle.connect(owner).setUnderlyingPrice(cUNI.address, ethers.utils.parseUnits("10",18));
        let cUNIPrice = await priceOracle.connect(owner).getUnderlyingPrice(cUNI.address);
        let formattingcUNIPrice = ethers.utils.formatEther(cUNIPrice);
        console.log(`cUNI price: ${formattingcUNIPrice}`);

        //User1將UNI, USDC加入抵押
        await comptroller.connect(user1).enterMarkets([cUNI.address, cUSDC.address]);//address in []
        console.log(`UNI, USDC entered Markets`);
        let user1Assets = await comptroller.connect(user1).getAssetsIn(user1.address);
        console.log(`user1 getAssetsIn: ${user1Assets}`);


        //設定UNI collateral factor 為 50%
        //newCollateralFactorMantissa The new collateral factor, scaled by 1e18
        await comptroller.connect(owner)._setCollateralFactor(cUNI.address, ethers.utils.parseUnits("0.5", 18));
        console.log(`Set UNI collateral factor to 50%`);

        //set close factor to 50% 
        await comptroller._setCloseFactor(ethers.utils.parseUnits("0.5", 18));

        //set Liquidation incentive to 10% (1.1)
        await comptroller._setLiquidationIncentive(ethers.utils.parseUnits("1.1", 18));

        //deploy flash loan contract
        const flashLoanFactory = await ethers.getContractFactory("FlashLoan");
        const aaveFL = await flashLoanFactory.deploy(LENDING_POOL_PROVIDER_ADDRESS, SWAP_ROUTER_ADDRESS);
        await aaveFL.deployed();
        console.log(`flash loan contract deplaoyed to ${aaveFL.address}`);

        
        return {  owner, user1, user2, usdcAddress, uniAddress, binanceWallet, uni, usdc, cUSDC, cUNI, comptroller, priceOracle, aaveFL };
        
    }

    //W13 Q6
    it("User1 Should be liquidated by AAVE Flash loan", async function() {
        const { owner, user1, user2, usdcAddress, uniAddress, binanceWallet, uni, usdc, cUSDC, cUNI, comptroller, priceOracle, aaveFL } = await loadFixture(deployFixture);
        
        //approve cUNI using user1's UNI or get reverted with reason string 're-entered'
        await uni.connect(user1).approve(cUNI.address, ethers.utils.parseUnits("1000",18));
        
        //從binance預存 10000顆 UNI到cUNI  

        //從binance預存 10000顆 USDC到cUSDC  
        let transferAmount = ethers.utils.parseUnits("10000", 6);//10000
        await usdc.connect(binanceWallet).transfer(cUSDC.address, transferAmount);
        let usdcOfcUsdc = await usdc.balanceOf(cUSDC.address);
        console.log(`USDC in cUsdc Amount:  ${usdcOfcUsdc}`);

        //從binance預存1000顆UNI給 User1
        await uni.connect(binanceWallet).transfer(user1.address, ethers.utils.parseUnits("1000", 18));
        let uniOfUser1 = ethers.utils.formatEther(await uni.balanceOf(user1.address));
        console.log(`UNI of User1 balance:  ${uniOfUser1}`);
        console.log("==== user1 minting cUNI===============")

       
        //User1 先放1000 UNI到 cUNI or get 'BorrowComptrollerRejection(4)'
        await cUNI.connect(user1).mint(ethers.utils.parseUnits("1000", 18));
        let user1UNIAmountAftermint = ethers.utils.formatEther(await uni.balanceOf(user1.address));
        console.log(`user1 UNI Amount After mint:  ${user1UNIAmountAftermint} `);
        let UNIOfcUNI = ethers.utils.formatEther(await uni.balanceOf(cUNI.address));
        console.log(`UNI of cUNI Amount:  ${UNIOfcUNI}`);  



        
        //User1 使用 UNI 作為抵押品借出 5000 顆 USDC (decimal 6)
        await cUSDC.connect(user1).borrow(ethers.utils.parseUnits("5000", 6));
        let user1USDCAmount = await usdc.balanceOf(user1.address);
        console.log(`user1 USDCAmount:  ${user1USDCAmount} `);
        let USDCOfcUSDC = await usdc.balanceOf(cUSDC.address);
        console.log(`USDC in cUSDC Amount:  ${USDCOfcUSDC}`);  

        let user1Liquidity = await comptroller.getAccountLiquidity(user1.address);
        console.log(`user1 Liquidity before price dumping: ${user1Liquidity}`);

        //將 UNI 價格改為 $6.2 使 User1 產生 Shortfall
        await priceOracle.setUnderlyingPrice(cUNI.address, ethers.utils.parseUnits("6.2", 18))
        let uniPrice = await priceOracle.connect(owner).getUnderlyingPrice(cUNI.address);
        let formattingUniPrice = ethers.utils.formatEther(uniPrice);
        console.log(`UNI price: ${formattingUniPrice}`);



        let user1LiquidityAfter = await comptroller.getAccountLiquidity(user1.address);

        console.log(`user1 Liquidity after price dumping: ${user1LiquidityAfter}`);


        //讓 User2 透過 AAVE 的 Flash loan 來清算 User1
        //原本1000顆UNI $10 可借5000 (10000 * 0.5(collatoral_factor)), 跌到6.2 只可借3100 因此可清算user1
        //幫忙還一半的usdc 2500顆

        await aaveFL.connect(user2).flashloan(usdcAddress, ethers.utils.parseUnits("2500", 6), user1.address, cUSDC.address, cUNI.address);
        //console.log("")

        //可以自行檢查清算 50% 後是不是大約可以賺 121 USD
        let user2USDC = ethers.utils.formatEther(await usdc.balanceOf(user2.address));
        console.log(`user2 USDC Amount After mint:  ${user2USDC} `);
    })

})