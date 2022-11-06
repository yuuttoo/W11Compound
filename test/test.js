const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");


describe("CERC20 borrow/repay", function() {

    async function deployCerc20V2Fixture() {
        //prepare owner and user account
        const [owner, user1, user2] = await ethers.getSigners();

        //部署TokenA 
        const tokenAFactory = await ethers.getContractFactory("TokenA");
        const tokenA = await tokenAFactory.deploy("TokenA", "TKA", ethers.utils.parseUnits("1000", 18));
        await tokenA.deployed();
        console.log(`tokenA deployed to ${tokenA.address}`);

        //部署TokenB
        const tokenBFactory = await ethers.getContractFactory("TokenB");
        const tokenB = await tokenBFactory.deploy("TokenB", "TKB", ethers.utils.parseUnits("1000", 18));
        await tokenB.deployed();
        console.log(`tokenB deployed to ${tokenB.address}`);


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
        const interestRateModel = await InterestRateModel.deploy(//將利率模型合約中的借貸利率設定為 0%
            ethers.utils.parseUnits("0",18),//baseRatePerYear
            ethers.utils.parseUnits("0",18)//multiplierPerYear
        );
        await interestRateModel.deployed();
        console.log(`interestRateModel deployed to ${interestRateModel.address}`);
        
                
        //部署cErc20 tokenA       
        const cTKAFactory = await ethers.getContractFactory("CErc20");
        const cTKA = await cTKAFactory.deploy();
        await cTKA.deployed();
        console.log(`cTKA deployed to ${cTKA.address}`);
        
        //initialize cTokenA
        await cTKA["initialize(address,address,address,uint256,string,string,uint8)"](
            tokenA.address,
            comptroller.address,
            interestRateModel.address,
            ethers.utils.parseUnits("1", 18),//1:1
            "CTokenA",
            "CTKA",
            18
        );

        const cTKBFactory = await ethers.getContractFactory("CErc20");
        const cTKB = await cTKBFactory.deploy();
        await cTKB.deployed();
        console.log(`cTKB deployed to ${cTKB.address}`);
        
        //initialize cTokenB
        await cTKB["initialize(address,address,address,uint256,string,string,uint8)"](
            tokenB.address,
            comptroller.address,
            interestRateModel.address,
            ethers.utils.parseUnits("1", 18),//1:1
            "CTokenB",
            "CTKB",
            18
        );
      
        //設定priceOracle
        comptroller._setPriceOracle(priceOracle.address);

        await comptroller.connect(owner)._supportMarket(cTKA.address);
        console.log ("cTKA added to comptroller market list");

        await comptroller.connect(owner)._supportMarket(cTKB.address);
        console.log ("cTKB added to comptroller market list");


        //Oracle設定 TokenA 價格 $1
        await priceOracle.connect(owner).setUnderlyingPrice(cTKA.address, ethers.utils.parseUnits("1",18));
        let tokenAPrice = await priceOracle.connect(owner).getUnderlyingPrice(cTKA.address);
        let formattingTKAPrice = ethers.utils.formatEther(tokenAPrice);
        console.log(`tokenA price: ${formattingTKAPrice}`);
        

        //Oracle設定 TokenB 價格 $100
        await priceOracle.connect(owner).setUnderlyingPrice(cTKB.address, ethers.utils.parseUnits("100",18));
        let tokenBPrice = await priceOracle.connect(owner).getUnderlyingPrice(cTKB.address);
        let formattingTKBPrice = ethers.utils.formatEther(tokenBPrice);
        console.log(`tokenB price: ${formattingTKBPrice}`);


        //將CTKB, CTKA加入抵押
        await comptroller.connect(user1).enterMarkets([cTKA.address, cTKB.address]);//address in []
        console.log(`cTKA, cTKB entered Markets`);
        let user1Assets = await comptroller.connect(user1).getAssetsIn(user1.address);
        console.log(`user1 getAssetsIn: ${user1Assets}`);


        //設定TokenB collateral factor 為 50%
        //newCollateralFactorMantissa The new collateral factor, scaled by 1e18
        await comptroller.connect(owner)._setCollateralFactor(cTKB.address, ethers.utils.parseUnits("0.5", 18));
        console.log(`Set TokenB collateral factor to 50%`);

        //預存 100顆 tokenA到CTKA  ok
        await tokenA.connect(owner).approve(cTKA.address, ethers.utils.parseUnits("100", 18));
        await cTKA.connect(owner).mint(ethers.utils.parseUnits("100", 18));
        let TKAOfCTKA = ethers.utils.formatEther(await tokenA.balanceOf(cTKA.address));
        console.log(`TKA in CTKA Amount:  ${TKAOfCTKA}`);             
    

        return { owner, user1, user2, tokenA, tokenB, cTKA, cTKB, comptroller };
    }




    //W12 Q3
    it("Should be borrow/repay", async function() {
        const { user1, tokenA, tokenB, cTKA, cTKB } = await loadFixture(deployCerc20V2Fixture);

        //approve user1
        await tokenB.connect(user1).approve(cTKB.address, ethers.utils.parseUnits("100",18));


        //send 100 tokenB to user1  
        await tokenB.transfer(user1.address, ethers.utils.parseUnits("100", 18));
        let user1tokenBAmountBeforeMint = ethers.utils.formatEther(await tokenB.balanceOf(user1.address));
        console.log(`user1 tokenB Amount:  ${user1tokenBAmountBeforeMint} `);      
        

        //User1 使用 1 顆 tokenB 來 mint cTKB 
        await cTKB.connect(user1).mint(ethers.utils.parseUnits("1", 18));
        let user1tokenBAmountAfterMint = ethers.utils.formatEther(await tokenB.balanceOf(user1.address));
        console.log(`user1 tokenB Amount after mint 1 CTKB:  ${user1tokenBAmountAfterMint} `);
        let user1CTKBAmount = ethers.utils.formatEther(await cTKB.balanceOf(user1.address));
        console.log(`user1 CTKB Amount after mint 1 CTKB:  ${user1CTKBAmount} `);


        //User1 使用 tokenB 作為抵押品來借出 50 顆 token A
        //error: function returned an unexpected amount of data
        //at Comptroller.borrowAllowed (contracts/Comptroller.sol:372)
        await cTKA.connect(user1).borrow(ethers.utils.parseUnits("50", 18));
        let user1TKAAmount = ethers.utils.formatEther(await tokenA.balanceOf(user1.address));
        console.log(`user1 TKA Amount:  ${user1TKAAmount} `);
        let TKAOfCTKA2 = ethers.utils.formatEther(await tokenA.balanceOf(cTKA.address));
        console.log(`TKA in CTKA Amount:  ${TKAOfCTKA2}`);     
        console.log(`===================================`);    
    })

    it("User1 Should be liquidated", async function() {
        const { owner, user1, user2, tokenA, tokenB, cTKA, cTKB, comptroller } = await loadFixture(deployCerc20V2Fixture);
        //延續 (3.) 的借貸場景
        //approve user1
        await tokenB.connect(user1).approve(cTKB.address, ethers.utils.parseUnits("100",18));

        //send 100 tokenB to user1  
        await tokenB.transfer(user1.address, ethers.utils.parseUnits("100", 18));
        let user1tokenBAmountBeforeMint = ethers.utils.formatEther(await tokenB.balanceOf(user1.address));
        console.log(`user1 tokenB Amount:  ${user1tokenBAmountBeforeMint} `);      
        

        //User1 使用 1 顆 tokenB 來 mint cTKB 
        await cTKB.connect(user1).mint(ethers.utils.parseUnits("1", 18));
        let user1tokenBAmountAfterMint = ethers.utils.formatEther(await tokenB.balanceOf(user1.address));
        console.log(`user1 tokenB Amount after mint 1 CTKB:  ${user1tokenBAmountAfterMint} `);
        let user1CTKBAmount = ethers.utils.formatEther(await cTKB.balanceOf(user1.address));
        console.log(`user1 CTKB Amount after mint 1 CTKB:  ${user1CTKBAmount} `);


        //User1 使用 tokenB 作為抵押品來借出 50 顆 token A
        //error: function returned an unexpected amount of data
        //at Comptroller.borrowAllowed (contracts/Comptroller.sol:372)
        await cTKA.connect(user1).borrow(ethers.utils.parseUnits("50", 18));
        let user1TKAAmount = ethers.utils.formatEther(await tokenA.balanceOf(user1.address));
        console.log(`user1 TKA Amount:  ${user1TKAAmount} `);
        let TKAOfCTKA2 = ethers.utils.formatEther(await tokenA.balanceOf(cTKA.address));
        console.log(`TKA in CTKA Amount:  ${TKAOfCTKA2}`);     


        //設定TokenB collateral factor, 讓 user1 被 user2 清算
        //原本50%可借50顆，只要調降抵押率 < 50%，user1就會被清算
        await comptroller.connect(owner)._setCollateralFactor(cTKB.address, ethers.utils.parseUnits("0.3", 18));
        console.log(`Set TokenA collateral factor to 40%`);

        //send 25 tokenA to user2
        await tokenA.transfer(user2.address, ethers.utils.parseUnits("25", 18));
        let user2tokenAAmount = ethers.utils.formatEther(await tokenA.balanceOf(user2.address));
        console.log(`user2 tokenA Amount:  ${user2tokenAAmount} `);

        //check  user1 tokenA shorfall 
        let result = await comptroller.getAccountLiquidity(user1.address);
        let shorfallResult = ethers.utils.formatEther(result[2]);
        console.log(`user1 tokenA shortfall result: ${shorfallResult}`);//10
    

        //set close factor or LiquidateComptrollerRejection(17)
        comptroller._setCloseFactor(ethers.utils.parseUnits("0.5", 18));

        //approve user2
        console.log(`TKA in CTKA Amount:  ${TKAOfCTKA2}`);  
        
        
        let TKAOfUser2BeforeRepay =  ethers.utils.formatEther(await tokenA.balanceOf(user2.address));
        console.log(`TKA of user2 Amount:  ${TKAOfUser2BeforeRepay}`);   
        let TKAOfCTKABeforeRepay =  ethers.utils.formatEther(await tokenA.balanceOf(cTKA.address));
        console.log(`TKA in CTKA Amount before user2 repay:  ${TKAOfCTKABeforeRepay}`); 

        await tokenA.connect(user2).approve(cTKA.address, ethers.utils.parseUnits("25",18));
        await cTKA.connect(user2).liquidateBorrow(user1.address, ethers.utils.parseUnits("25", 18), cTKB.address);
        let TKAOfUser2AfterRepay =  ethers.utils.formatEther(await tokenA.balanceOf(user2.address));
        console.log(`CTKA of user2 Amount:  ${TKAOfUser2AfterRepay}`);     
        let TKAOfCTKAAfterRepay =  ethers.utils.formatEther(await tokenA.balanceOf(cTKA.address));
        console.log(`TKA in CTKA Amount after user2 repay:  ${TKAOfCTKAAfterRepay}`); 
        console.log(`===================================`);    

    })

    })
