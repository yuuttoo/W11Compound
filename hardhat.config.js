require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();



/** @type import('hardhat/config').HardhatUserConfig */



const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
console.log(`ALCHEMY_API_KEY : ${ALCHEMY_API_KEY}`);




module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1
          }
        }
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
        blockNumber: 15815693,
        enabled: true
      }
    }
  }
}
