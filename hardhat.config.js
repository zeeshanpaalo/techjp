require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      mining: {
        auto: false,
        interval: 1000,
      },
    },
  },
  solidity: "0.8.18",
};
