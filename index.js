'use strict';

var Web3 = require('web3');
var Tx = require('ethereumjs-tx').Transaction;
const os = require('os');
const abi = require('./abi.js');
const crypto = require('crypto');

module.exports = class KoinosMiner {
   powHeight = 0;
   threadIterations = 600000;
   hashLimit = 100000000;
   // Start at 32 bits of difficulty
   difficulty = BigInt("0x00000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
   startTime = Date.now();
   endTime = Date.now();
   lastProof = Date.now();
   lastPowHeightUpdate = Date.now();
   hashes = 0;
   hashRate = 0;
   child = null;
   contract = null;

   constructor(address, oo_address, fromAddress, contractAddress, endpoint, tip, period, gasMultiplier, gasPriceLimit, signCallback, hashrateCallback, proofCallback, errorCallback) {
      this.address = address;
      this.oo_address = oo_address;
      this.web3 = new Web3( endpoint );
      this.tip  = Math.trunc(tip * 100);
      this.proofPeriod = period;
      this.signCallback = signCallback;
      this.hashrateCallback = hashrateCallback;
      this.errorCallback = errorCallback;
      this.fromAddress = fromAddress;
      this.gasMultiplier = gasMultiplier;
      this.gasPriceLimit = gasPriceLimit;
      this.contractAddress = contractAddress;
      this.proofCallback = proofCallback;
      this.contract = new this.web3.eth.Contract( abi, this.contractAddress );
      var self = this;

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

   async retrievePowHeight() {
      try
      {
         let self = this;
         let result = await this.contract.methods.get_pow_height(
            this.fromAddress,
            [this.address, this.oo_address],
            [10000 - this.tip, this.tip]
         ).call();
         self.powHeight = parseInt(result) + 1;
         self.lastPowHeightUpdate = Date.now();
      }
      catch(e)
      {
         let error = {
            kMessage: "Could not retrieve the PoW height.",
            exception: e
         };
         if (self.errorCallback && typeof self.errorCallback === "function") {
            self.errorCallback(error);
         }
      }
   }

   sendTransaction(txData) {
      var self = this;
      self.signCallback(self.web3, txData).then( (rawTx) => {
         self.web3.eth.sendSignedTransaction(rawTx).catch( async (error) => {
            console.log('[JS] Error sending transaction:', error.message);
            // If anything goes wrong, get a new powHeight
            await self.retrievePowHeight();
         });
      });
   }

   async onRespFinished() {
      this.endTime = Date.now();
      console.log("[JS] Finished!");
      this.adjustDifficulty();

      // Check pow height every 10 minutes
      if( Date.now() - this.lastPowHeightUpdate > 1000 * 60 * 10 ) {
         this.retrievePowHeight();
      }
      await this.updateLatestBlock();
      this.writeMiningRequest(this.recentBlock);
   }

   async onRespNonce(nonce) {
      this.endTime = Date.now();
      console.log( "[JS] Nonce: " + nonce );
      var delta = this.endTime - this.lastProof;
      this.lastProof = this.endTime;
      var ms = delta % 1000;
      delta = Math.trunc(delta / 1000);
      var seconds = delta % 60;
      delta = Math.trunc(delta / 60);
      var minutes = delta % 60;
      var hours = Math.trunc(delta / 60);
      console.log( "[JS] Time to find proof: " + hours + ":" + minutes + ":" + seconds + "." + ms );

      var submission = [
         [this.address,this.oo_address],
         [10000-this.tip,this.tip],
         this.recentBlock.number,
         this.recentBlock.hash,
         '0x' + this.difficulty.toString(16),
         this.powHeight,
         '0x' + nonce.toString(16)
      ];

      let gasPrice = Math.round(parseInt(await this.web3.eth.getGasPrice()) * this.gasMultiplier);

      if (gasPrice > this.gasPriceLimit) {
         let error = {
            kMessage: "The gas price (" + gasPrice + ") has exceeded the gas price limit (" + this.gasPriceLimit + ")."
         };
         if (this.errorCallback && typeof this.errorCallback === "function") {
            this.errorCallback(error);
         }
      }

      this.sendTransaction({
         from: this.fromAddress,
         to: this.contractAddress,
         gas: (this.powHeight == 1 ? 500000 : 150000),
         gasPrice: gasPrice,
         data: this.contract.methods.mine(
            [this.address,this.oo_address],
            [10000-this.tip,this.tip],
            this.recentBlock.number,
            this.recentBlock.hash,
            '0x' + this.difficulty.toString(16),
            this.powHeight,
            '0x' + nonce.toString(16)
         ).encodeABI()
      });

      // We will consider this a powHeight "update" to prevent immediately retrieving the old height
      // and mining on it.
      this.lastPowHeightUpdate = Date.now();
      this.powHeight++;
      this.adjustDifficulty();
      await this.updateLatestBlock();
      this.startTime = Date.now();
      this.writeMiningRequest(this.recentBlock);

      if (this.proofCallback && typeof this.proofCallback === "function") {
         this.proofCallback(submission);
      }
   }

   async onRespHashReport( newHashes )
   {
      let now = Date.now();
      this.updateHashrate(newHashes - this.hashes, now - this.endTime);
      this.hashes = newHashes;
      this.endTime = now;
   }

   async start() {
      if (this.child !== null) {
         console.log("[JS] Miner has already started");
         return;
      }

      console.log("[JS] Starting miner");
      var self = this;

      await this.retrievePowHeight();

      var spawn = require('child_process').spawn;
      this.child = spawn( this.minerPath(), [this.address, this.oo_address] );
      this.child.stdin.setEncoding('utf-8');
      this.child.stderr.pipe(process.stdout);
      this.child.stdout.on('data', async function (data) {
         if ( self.isFinished(data) ) {
            await self.onRespFinished();
         }
         else if ( self.isNonce(data) ) {
            let nonce = BigInt('0x' + self.getValue(data));
            await self.onRespNonce(nonce);
         }
         else if ( self.isHashReport(data) ) {
            let ret = self.getValue(data).split(" ");
            let newHashes = parseInt(ret[1]);
            await self.onRespHashReport(newHashes);
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

      await self.updateLatestBlock();
      self.startTime = Date.now();
      self.writeMiningRequest(self.recentBlock);
   }

   stop() {
      if ( this.child !== null) {
         console.log("[JS] Stopping miner");
         this.child.kill('SIGINT');
         this.child = null;
      }
      else {
         console.log("[JS] Miner has already stopped");
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

   isFinished(s) {
      let str = s.toString();
      return "F:" === str.substring(0, 2);
   }

   isNonce(s) {
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

   writeMiningRequest(block) {
      var difficultyStr = this.difficulty.toString(16);
      difficultyStr = "0x" + "0".repeat(64 - difficultyStr.length) + difficultyStr;
      console.log( "[JS] Ethereum Block Number: " + block.number );
      console.log( "[JS] Ethereum Block Hash:   " + block.hash );
      console.log( "[JS] Target Difficulty:     " + difficultyStr );
      this.hashes = 0;
      this.block = block;
      this.child.stdin.write(
         block.hash + " " +
         block.number.toString() + " " +
         difficultyStr + " " +
         this.tip + " " +
         this.powHeight + " " +
         Math.trunc(this.threadIterations) + " " +
         Math.trunc(this.hashLimit) + " " +
         this.getNonceOffset() + ";\n");
   }

   async updateLatestBlock() {
      try
      {
         let headBlock = await this.web3.eth.getBlock("latest");
         // get several blocks behind head block so most reorgs don't invalidate mining
         let confirmedBlock = await this.web3.eth.getBlock(headBlock.number - 6 );
         this.recentBlock = confirmedBlock;
      }
      catch( e )
      {
         if( this.errorCallback && typeof this.errorCallback === "function" ) {
            self.errorCallback(e);
         }
         let error = {
            kMessage: "An error occurred while attempting to start the miner.",
            exception: e
         };
         throw error;
      }
   }
}
