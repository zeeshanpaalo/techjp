npm i
npx hardhat test


Bug Summary:
<br />
`Attacker prepares a Malicious Safebox with a Malicious social recoverer. Attacker transfers the ownership to alice. Alice uses that safe and transfer some native eth. The malicous social recoverer can then take ownership of the safe back with everything in it.`
`In real world, an attacker have to monitor the mempool for any transaction calling createSafebox on SafeboxFactory.sol. And front running can be employed to transfer the ownership to Alice.`
<br />
Possible Mitigation: 
`The setSocialRecover function should invalidate any existing social recovering details`