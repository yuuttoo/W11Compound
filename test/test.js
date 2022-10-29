const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CERC20", function() {
    it("Should be able to mint or redeem", async function() {
        //部署comptroller 
        const comptrollerFactory = await ethers.getContractFactory("Comptroller");
        const comptroller = await comptrollerFactory.deploy();
        await comptroller.deployed();
        console.log(`comptroller deployed to ${comptroller.address}`);
            
          


        //部署erc20 
        const erc20Factory = await ethers.getContractFactory("TestErc20");
        const erc20 = await erc20Factory.deploy();
        await erc20.deployed();
        console.log(`erc20 deployed to ${erc20.address}`);
            
         

        //部署interestRateModel_
        //找合約 參數先設為0 後部署
        //參數要設定18
        const InterestRateModel = await ethers.getContractFactory("WhitePaperInterestRateModel");
        const interestRateModel = await InterestRateModel.deploy(//將利率模型合約中的借貸利率設定為 0%
            ethers.utils.parseUnits("0",18),//baseRatePerYear
            ethers.utils.parseUnits("0",18)//multiplierPerYear
        );
        await interestRateModel.deployed();
        console.log(`interestRateModel deployed to ${interestRateModel.address}`);
            
    
       
        //最後部署cErc20 
        const cErc20Factory = await ethers.getContractFactory("CErc20");
        const cErc20 = await cErc20Factory.deploy();
        await cErc20.deployed();
        console.log(`cErc20 deployed to ${cErc20.address}`);
            

        //部署後會遇到error : cErc20.initialize is not a function  所以改寫成下面的function signature初始化寫法
        //因為兩個繼承的合約(ctoken) 都有initial函數 
        //改寫成指定函數加上參數
        //再把上面部署的各合約地址放過來
        //因為原本是proxy 這裡要到CErc20.sol手動加 admin 到initialize
        //admin = payable(msg.sender);
        //或部署CErc20Immutable
         await cErc20["initialize(address,address,address,uint256,string,string,uint8)"](
            erc20.address,
            comptroller.address,
            interestRateModel.address,
            ethers.utils.parseUnits("1", 18),//1:1
            "MyToken",
            "MTK",
            18
        )
      

        //部署simplePriceOracle
        const PriceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
        const priceOracle = await PriceOracleFactory.deploy();
        await priceOracle.deployed();
        console.log(`simplePriceOracle deployed to ${priceOracle.address}`);
        
        //設定priceOracle
        comptroller._setPriceOracle(priceOracle);

        //W11 2. 部署完後mint 測試mintFresh
        
    })
})
