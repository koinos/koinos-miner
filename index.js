'use strict';

var Web3 = require('web3');
var Tx = require('ethereumjs-tx').Transaction;
const os = require('os');
const abi = require('./abi.js');
const crypto = require('crypto');
const {Looper} = require("./looper.js");
const Retry = require("./retry.js");
const axios = require('axios')

const GWEI_UNIT = 1000000000
const DEFAULT_SPEED = 'medium'

function difficultyToString( difficulty ) {
   let difficultyStr = difficulty.toString(16);
   difficultyStr = "0x" + "0".repeat(64 - difficultyStr.length) + difficultyStr;
   return difficultyStr;
}

function addressToBytes( addr ) {
   // Convert a string address to bytes
   let ADDRESS_LENGTH = 42;
   if( addr.startsWith("0x") )
      addr = addr.substring(2);
   addr = "0".repeat(ADDRESS_LENGTH - addr.length) + addr;
   return Buffer.from(addr, "hex");
}

/**
 * A simple queue class for request/response processing.
 *
 * Keep track of the information that was used in a request, so we can use it in response processing.
 */
class MiningRequestQueue {
   constructor( reqStream ) {
      this.pendingRequests = [];
      this.reqStream = reqStream;
   }

   sendRequest(req) {
      let difficultyStr = difficultyToString( req.difficulty );
      console.log( "[JS] Ethereum Block Number: " + req.block.number );
      console.log( "[JS] Ethereum Block Hash:   " + req.block.hash );
      console.log( "[JS] Target Difficulty:     " + difficultyStr );
      this.reqStream.write(
         req.minerAddress + " " +
         req.tipAddress + " " +
         req.block.hash + " " +
         req.block.number.toString() + " " +
         difficultyStr + " " +
         req.tipAmount + " " +
         req.powHeight + " " +
         req.threadIterations + " " +
         req.hashLimit + " " +
         req.nonceOffset + ";\n");
      this.pendingRequests.push(req);
   }

   getHead() {
      if( this.pendingRequests.length === 0 )
         return null;
      return this.pendingRequests[0];
   }

   popHead() {
      if( this.pendingRequests.length === 0 )
         return null;
      return this.pendingRequests.shift();
   }
}

module.exports = class KoinosMiner {
   threadIterations = 600000;
   hashLimit = 100000000;
   // Start at 32 bits of difficulty
   difficulty = BigInt("0x00000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
   startTime = Date.now();
   endTime = Date.now();
   lastProof = Date.now();
   hashes = 0;
   hashRate = 0;
   child = null;
   contract = null;

   constructor(address, tipAddresses, fromAddress, contractAddress, endpoint, tipAmount, period, gasMultiplier, gasPriceLimit, gweiLimit, gweiMinimum, speed, signCallback, hashrateCallback, proofCallback, errorCallback, warningCallback) {
      let self = this;

      this.address = address;
      this.tipAddresses = tipAddresses;
      this.web3 = new Web3( endpoint );
      this.tipAmount = Math.trunc(tipAmount * 100);
      this.proofPeriod = period;
      this.signCallback = signCallback;
      this.hashrateCallback = hashrateCallback;
      this.errorCallback = errorCallback;
      this.warningCallback = warningCallback;
      this.fromAddress = fromAddress;
      this.gasMultiplier = gasMultiplier;
      this.gasPriceLimit = gasPriceLimit;
      this.gweiLimit = gweiLimit
      this.gweiMinimum = gweiMinimum
      this.speed = speed
      this.contractAddress = contractAddress;
      this.proofCallback = proofCallback;
      this.updateBlockchainLoop = new Looper(
         function() { return self.updateBlockchain(); },
         60*1000,
         function(e) { return self.updateBlockchainError(e); } );
      this.contract = new this.web3.eth.Contract( abi, this.contractAddress );
      this.miningQueue = null;
      this.powHeightCache = {};
      this.currentPHKIndex = 0;
      this.numTipAddresses = 3;
      this.startTimeout = null;

      this.contractStartTimePromise = this.contract.methods.start_time().call().then( (startTime) => {
         this.contractStartTime = startTime;
      }).catch( (e) => {
         let error = {
            kMessage: "Failed to retrieve the start time from the token mining contract.",
            exception: e
         };
         console.log(error);
         if (this.errorCallback && typeof this.errorCallback === "function") {
            this.errorCallback(error);
         }
      });

      // We don't want the mining manager to go down and leave the
      // C process running indefinitely, so we send SIGINT before
      // exiting.
      process.on('uncaughtException', function (err) {
         console.error('[JS] uncaughtException:', err.message);
         console.error(err.stack);
         if (self.child !== null) {
            self.stop();
         }
         let error = {
            kMessage: "An uncaught exception was thrown.",
            exception: err
         };
         if (self.errorCallback && typeof self.errorCallback === "function") {
            self.errorCallback(error);
         }
      });
   }

   async awaitInitialization() {
      if (this.contractStartTimePromise !== null) {
         await this.contractStartTimePromise;
         this.contractStartTimePromise = null;
      }
   }

   getMiningStartTime() {
      return this.contractStartTime;
   }

   async retrievePowHeight(phk) {
      try
      {
         let [fromAddress, address, tipAddress, one_minus_ta, ta] = phk.split(",");
         let result = await this.contract.methods.get_pow_height(
            fromAddress,
            [address, tipAddress],
            [parseInt(one_minus_ta), parseInt(ta)]
         ).call();
         this.powHeightCache[phk] = parseInt(result);
      }
      catch(e)
      {
         let error = {
            kMessage: "Could not retrieve the PoW height.",
            exception: e
         };
         throw error;
      }
   }

   sendTransaction(txData) {
      var self = this;
      self.signCallback(self.web3, txData).then( (rawTx) => {
         self.web3.eth.sendSignedTransaction(rawTx).then( (receipt) => {
            console.log("[JS] Transaction hash is", receipt.transactionHash);
            if (self.proofCallback && typeof self.proofCallback === "function") {
               self.proofCallback(receipt, txData.gasPrice);
            }
         }).
         catch( async (e) => {
            console.log('[JS] Error sending transaction:', e.message);
            let warning = {
               kMessage: e.message,
               exception: e
            };
            if(self.warningCallback && typeof self.warningCallback === "function") {
               self.warningCallback(warning);
            }
         });
      });
   }

   getPHK( tipAddress ) {
      // Get the pow height key for the given tip address
      let ta = this.tipAmount.toString();
      let one_minus_ta = (10000 - this.tipAmount).toString();
      return [this.fromAddress, this.address, tipAddress, one_minus_ta, ta].join(",");
   }

   getActivePHKs() {
      // Get the currently active PHK's
      let minerTipAddresses = this.getTipAddressesForMiner( this.address );
      let result = [];
      for( let i=0; i<minerTipAddresses.length; i++ )
         result.push( this.getPHK( minerTipAddresses[i] ) );
      return result;
   }

   getCurrentPHK() {
      let phks = this.getActivePHKs();
      return phks[this.currentPHKIndex % phks.length];
   }

   rotateTipAddress() {
      let phks = this.getActivePHKs();
      this.currentPHKIndex = (this.currentPHKIndex + 1) % phks.length;
   }

   getTipAddressesForMiner( minerAddress ) {
      // Each miner should only mine to a small subset of tip addresses
      // Figure out which tip addresses the miner mines to as the addresses that minimize H(minerAddress + tipAddress)
      let shuffled = [];
      for( let i=0; i<this.tipAddresses.length; i++ ) {
         let tipAddress = this.tipAddresses[i];
         let sortKey = this.web3.utils.soliditySha3( minerAddress, tipAddress );
         shuffled.push([sortKey, i]);
      }
      shuffled.sort( function(a, b) {
         if( a[0] < b[0] )
            return -1;
         if( a[0] > b[0] )
            return 1;
         if( a[1] < b[1] )
            return -1;
         if( a[1] > b[1] )
            return 1;
         return 0;
      } );

      let result = [];
      for( let i=0; i<this.numTipAddresses; i++ )
      {
         result.push( this.tipAddresses[shuffled[i][1]] );
      }
      return result;
   }

   async updateBlockchain() {
      var self = this;
      const gasPrice = await this.getGasPrice()
      await Retry("update blockchain data", async function() {
         let phks = self.getActivePHKs();
         for( let i=0; i<phks.length; i++ )
         {
            await self.retrievePowHeight(phks[i]);
         }
         await self.updateLatestBlock();
      });
   }

   updateBlockchainError(e) {
      let error = e;
      if (error.kMessage === undefined) {
         error = {
            kMessage: "Could not update the blockchain.",
            exception: e
         };
      }
      console.log( "[JS] Exception in updateBlockchainLoop():", e);
      if (this.errorCallback && typeof this.errorCallback === "function") {
         this.errorCallback(error);
      }
   }

   async onRespFinished(req) {
      console.log("[JS] Finished!");
      this.endTime = Date.now();
      this.adjustDifficulty();
      this.sendMiningRequest();
   }

   async onRespNonce(req, nonce) {
      console.log( "[JS] Nonce: " + nonce );
      this.endTime = Date.now();
      var delta = this.endTime - this.lastProof;
      this.lastProof = this.endTime;
      var ms = delta % 1000;
      delta = Math.trunc(delta / 1000);
      var seconds = delta % 60;
      delta = Math.trunc(delta / 60);
      var minutes = delta % 60;
      var hours = Math.trunc(delta / 60);
      console.log( "[JS] Time to find proof: " + hours + ":" + minutes + ":" + seconds + "." + ms );

      let mineArgs = [
         [req.minerAddress,req.tipAddress],
         [10000-req.tipAmount,req.tipAmount],
         req.block.number,
         req.block.hash,
         difficultyToString( req.difficulty ),
         req.powHeight,
         "0x" + nonce.toString(16)
      ];

      const gasPrice = await this.getGasPrice();
      // If error happens, an object is returned, otherwise a number
      if(typeof gasPrice === object || gasPrice.kMessage) {
         this.errorCallback(gasPrice);
      }

      this.sendTransaction({
         from: req.fromAddress,
         to: this.contractAddress,
         gas: (req.powHeight == 1 ? 900000 : 500000),
         gasPrice: gasPrice,
         data: this.contract.methods.mine(...mineArgs).encodeABI()
      });

      this.rotateTipAddress();
      this.adjustDifficulty();
      this.startTime = Date.now();
      this.sendMiningRequest();
   }

   async getGasPrice() {
      const gweiMinimum = Number(this.gweiMinimum)
      const gweiLimit = Number(this.gweiLimit)
      const gasPriceLimit = Number(this.gasPriceLimit)

      // get current gas price from network
      let gasPrice = parseInt(await this.web3.eth.getGasPrice());

      // convert it to gwei
      let gwei = gasPrice / GWEI_UNIT;
      console.log(`[GAS] Received gas price: ${gwei} Gwei`)

      // multiply and round
      gwei = Math.round(gwei * this.gasMultiplier);
      console.log(`[GAS] Multiplied gas price to: ${gwei} Gwei`);

      let speedGwei = gweiMinimum

      // get speed prices from upvest api
      if(this.speed) {
         try {
            const {data} = await axios.get('https://fees.upvest.co/estimate_eth_fees'); 
            speedGwei = data.estimates[this.speed] || data.estimates[DEFAULT_SPEED];
            console.log(`[GAS] Estimated ${this.speed || DEFAULT_SPEED} gas price: ${speedGwei} Gwei`);
         } catch (error) {
            console.error('axios', error);
         }
      }

      // if the speed gwei price is bigger than gwei, use that instead
      if(speedGwei && speedGwei > gwei) {
         console.log(`[GAS] Using ${this.speed || DEFAULT_SPEED} gas price of ${speedGwei} Gwei (vs. ${gwei} Gwei)`)
         gwei = speedGwei;
      }

      // check whether gasPrice was empty or it's below the set minimum, if yes => set gwei to minimum
      if(!gwei || gwei < gweiMinimum) {
         gwei = gweiMinimum;
         console.log(`[GAS] Gas price is below minimum - set to: ${gwei} Gwei`);
      }

      // convert gwei back to gasPrice
      gasPrice = gwei * GWEI_UNIT;

      const wasGasPriceLimitModified = Boolean(gasPriceLimit !== 1000000000000);
      const wasGweiLimitModified = Boolean(gweiLimit !== 1000);
      const isDefaultSettings = !wasGasPriceLimitModified && !wasGweiLimitModified;

      // Logic:
      // user sets gas limit => use gas limit
      // gwei limit is added to code
      // user doesn't set gwei limit => use gas limit
      // user sets gwei limit => use gwei limit
      // user doesn't set anything => use gwei limit (gwei is easier to read)

      if ((!isDefaultSettings || wasGweiLimitModified) && gwei > gweiLimit) {
         console.log(`[GAS] Gwei limit reached: (${gwei} | ${gweiLimit})`);
         let error = {
            kMessage: "The gwei price (" + gwei + ") has exceeded the gwei price limit (" + gweiLimit + ")."
         };
         if (this.errorCallback && typeof this.errorCallback === "function") {
            return error
         }
      }
      
      if (gasPrice > gasPriceLimit) {
         console.log(`[GAS] Gas limit reached: (${gasPrice} | ${gasPriceLimit})`);
         let error = {
            kMessage: "The gas price (" + gasPrice + ") has exceeded the gas price limit (" + gasPriceLimit + ")."
         };
         if (this.errorCallback && typeof this.errorCallback === "function") {
            return error
         }
      }

      return gasPrice
   }

   async onRespHashReport( req, newHashes )
   {
      let now = Date.now();
      this.updateHashrate(newHashes - this.hashes, now - this.endTime);
      this.hashes = newHashes;
      this.endTime = now;
   }

   async runMiner() {
      if (this.startTimeout) {
         clearTimeout(this.startTimeout);
         this.startTimeout = null;
      }
      var self = this;

      let tipAddresses = this.getTipAddressesForMiner( this.address );
      console.log("[JS] Selected tip addresses", tipAddresses );

      this.currentPHKIndex = Math.floor(this.numTipAddresses * Math.random());

      var spawn = require('child_process').spawn;
      this.child = spawn( this.minerPath(), [this.address, this.oo_address] );
      this.child.stdin.setEncoding('utf-8');
      this.child.stderr.pipe(process.stdout);
      this.miningQueue = new MiningRequestQueue(this.child.stdin);
      this.child.stdout.on('data', async function (data) {
         if ( self.isFinishedWithoutNonce(data) ) {
            await self.onRespFinished(self.miningQueue.popHead());
         }
         else if ( self.isFinishedWithNonce(data) ) {
            let nonce = BigInt('0x' + self.getValue(data));
            await self.onRespNonce(self.miningQueue.popHead(), nonce);
         }
         else if ( self.isHashReport(data) ) {
            let ret = self.getValue(data).split(" ");
            let newHashes = parseInt(ret[1]);
            await self.onRespHashReport(self.miningQueue.getHead(), newHashes);
         }
         else {
            let error = {
               kMessage: 'Unrecognized response from the C mining application.'
            };
            if (self.errorCallback && typeof self.errorCallback === "function") {
               self.errorCallback(error);
            }
         }
      });
      self.updateBlockchainLoop.start();
      self.sendMiningRequest();
   }

   async start() {
      if (this.startTimeout !== null) {
         console.log("[JS] Miner is already scheduled to start");
         return;
      }

      if (this.child !== null) {
         console.log("[JS] Miner has already started");
         return;
      }

      console.log("[JS] Starting miner");
      var self = this;

      try {
         await self.updateBlockchain();
      }
      catch( e ) {
         self.updateBlockchainError(e);
      }
      await this.awaitInitialization();

      self.startTime = Date.now();
      let now = Math.floor(Date.now() / 1000);
      if (now < this.contractStartTime) {
         let startDateTime = new Date(this.contractStartTime * 1000);
         console.log("[JS] Mining will begin at " + startDateTime.toLocaleString());
         this.startTimeout = setTimeout(function() {
            self.runMiner();
         }, (this.contractStartTime - now) * 1000);
      }
      else {
         this.runMiner();
      }
   }

   stop() {
      if (this.child !== null) {
         console.log("[JS] Stopping miner");
         this.child.kill('SIGINT');
         this.child = null;
      }
      else {
         console.log("[JS] Miner has already stopped");
      }

      if (this.startTimeout !== null) {
         clearTimeout(this.startTimeout);
         this.startTimeout = null;
      }

      console.log("[JS] Stopping blockchain update loop");
      try {
         this.updateBlockchainLoop.stop();
      }
      catch( e ) {
         if( e.name === "LooperAlreadyStopping" ) {
            console.log("[JS] Blockchain update loop was already stopping");
         }
      }
   }

   minerPath() {
      var miner = __dirname + '/bin/koinos_miner';
      if ( process.platform === "win32" ) {
         miner += '.exe';
      }
      return miner;
   }

   getValue(s) {
      let str = s.toString();
      return str.substring(2, str.indexOf(";"));
   }

   isFinishedWithoutNonce(s) {
      let str = s.toString();
      return "F:" === str.substring(0, 2);
   }

   isFinishedWithNonce(s) {
      let str = s.toString();
      return "N:" === str.substring(0, 2);
   }

   isHashReport(s) {
      let str = s.toString();
      return "H:" === str.substring(0,2);
   }

   updateHashrate(d_hashes, d_time) {
      d_time = Math.max(d_time, 1);
      if ( this.hashRate > 0 ) {
         this.hashRate += Math.trunc((d_hashes * 1000) / d_time);
         this.hashRate /= 2;
      }
      else {
         this.hashRate = Math.trunc((d_hashes * 1000) / d_time);
      }

      if (this.hashrateCallback && typeof this.hashrateCallback === "function") {
         this.hashrateCallback(this.hashRate);
      }
   }

   adjustDifficulty() {
      const maxHash = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"); // 2^256 - 1
      this.hashRate = Math.max(this.hashRate, 1);
      var hashesPerPeriod = this.hashRate * parseInt(this.proofPeriod);
      this.difficulty = maxHash / BigInt(Math.trunc(hashesPerPeriod));
      this.threadIterations = Math.max(this.hashRate / (2 * os.cpus().length), 1); // Per thread hash rate, sync twice a second
      this.hashLimit = this.hashRate * 60 * 1; // Hashes for 1 minute
   }

   static formatHashrate(h) {
      var units = ""
      switch( Math.trunc(Math.log10(h) / 3) ) {
         case 0:
            return h + " H/s"
         case 1:
            return Math.trunc(h/ 1000) + "." + Math.trunc(h % 1000) + " KH/s"
         case 2:
            return Math.trunc(h/ 1000000) + "." + Math.trunc((h / 1000) % 1000) + " MH/s"
         default:
            return Math.trunc(h/ 1000000000) + "." + Math.trunc((h / 1000000) % 1000) + " GH/s"
      }
   }

   bufToBigInt(buf) {
      let result = 0n;
      if( buf.length == 0 )
         return result;
      let s = BigInt(8*(buf.length - 1));
      for( let i=0; i<buf.length; i++ )
      {
         result |= BigInt(buf[i]) << s;
         s -= 8n;
      }
      return result;
   }

   getNonceOffset() {
      // At most 2^128 - hashLimit
      let maxOffset = (1n << 128n) - BigInt(Math.trunc(this.hashLimit));
      let maxOffsetStr = maxOffset.toString(16);
      maxOffsetStr = "0x" + "0".repeat(64 - maxOffsetStr.length) + maxOffsetStr;

      console.log("[JS] maxOffset:", maxOffsetStr);
      while( true )
      {
         // Reroll until we get something less than maxOffset
         // Probability of needing a reroll is pretty tiny though
         let rdata = crypto.randomBytes(16);
         console.log("[JS] rdata:", rdata);
         let x = this.bufToBigInt(rdata);
         console.log("[JS] x:", x.toString(16));
         if( x < maxOffset )
         {
            let xStr = x.toString(16);
            xStr = "0x" + "0".repeat(64 - xStr.length) + xStr;
            return xStr;
         }
      }
   }

   sendMiningRequest() {
      let phk = this.getCurrentPHK();
      let [fromAddress, address, tipAddress, one_minus_ta, ta] = phk.split(",");
      this.hashes = 0;
      this.miningQueue.sendRequest({
         fromAddress : fromAddress,
         minerAddress : address,
         tipAddress : tipAddress,
         difficulty : this.difficulty,
         block : this.recentBlock,
         tipAmount : ta,
         powHeight : this.powHeightCache[phk]+1,
         threadIterations : Math.trunc(this.threadIterations),
         hashLimit : Math.trunc(this.hashLimit),
         nonceOffset : this.getNonceOffset()
         });
   }

   async updateLatestBlock() {
      try
      {
         this.headBlock = await this.web3.eth.getBlock("latest");
         // get several blocks behind head block so most reorgs don't invalidate mining
         let confirmedBlock = await this.web3.eth.getBlock(this.headBlock.number - 6 );
         this.recentBlock = confirmedBlock;
      }
      catch( e )
      {
         let error = {
            kMessage: "An error occurred while attempting to retrieve the latest block.",
            exception: e
         };
         throw error;
      }
   }
}
