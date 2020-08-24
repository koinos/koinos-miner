'use strict';

var Web3 = require('web3');
const os = require('os');

module.exports = class KoinosMiner {
   powHeight = 0;
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

   constructor(address, endpoint, tip, period, hashrateCallback) {
      this.address = address;
      this.web3 = new Web3( endpoint );
      this.tip  = tip * 100;
      this.proofPeriod = period;
      this.hashrateCallback = hashrateCallback;
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
         process.exit(1)
      });
   }

   start() {
      if (this.child !== null) {
         console.log("[JS] Miner has already started");
         return;
      }
      console.log("[JS] Starting miner");
      var self = this;
      var spawn = require('child_process').spawn;
      this.child = spawn( this.minerPath(), [this.address] );
      this.child.stdin.setEncoding('utf-8');
      this.child.stderr.pipe(process.stdout);
      this.child.stdout.on('data', function (data) {
         if ( self.isFinished(data) ) {
            self.endTime = Date.now();
            console.log("[JS] Finished!");
            self.adjustDifficulty();
            self.mine();
         }
         else if ( self.isNonce(data) ) {
            self.endTime = Date.now();
            var nonce = parseInt(self.getValue(data),16);
            console.log( "[JS] Nonce: " + nonce );
            var delta = self.endTime - self.lastProof;
            self.lastProof = self.endTime;
            var ms = delta % 1000;
            delta = Math.trunc(delta / 1000);
            var seconds = delta % 60;
            delta = Math.trunc(delta / 60);
            var minutes = delta % 60;
            var hours = Math.trunc(delta / 60);
            console.log( "[JS] Time to find proof: " + hours + ":" + minutes + ":" + seconds + "." + ms );
            self.powHeight++;
            self.adjustDifficulty();
            self.mine();
         }
         else if ( self.isHashReport(data) ) {
            var ret = self.getValue(data).split(" ");
            var now = Date.now();
            var newHashes = parseInt(ret[1]);
            self.updateHashrate(newHashes - self.hashes, now - self.endTime);
            self.hashes = newHashes;
            self.endTime = now;
         }
      });
      this.mine();
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
      var miner = process.cwd() + '/bin/koinos_miner';
      if ( process.platform === "win32" ) {
         miner += '.exe';
      }
      return miner;
   }

   getValue(s) {
      let str = s.toString();
      return str.substring(2, str.length - 2);
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
         this.hashrateCallback(this.formatHashrate(this.hashRate));
      }
   }

   adjustDifficulty() {
      const maxHash = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"); // 2^256 - 1
      this.hashRate = Math.max(this.hashRate, 1);
      var hashesPerPeriod = this.hashRate * parseInt(this.proofPeriod);
      this.difficulty = maxHash / BigInt(Math.trunc(hashesPerPeriod));
      this.difficulty >>= 1n;
      this.threadIterations = Math.max(this.hashRate / os.cpus().length, 1); // Per thread hash rate
      this.hashLimit = this.hashRate * 60 * 30; // Hashes for 30 minutes
   }

   formatHashrate(h) {
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

   async mine() {
      this.web3.eth.getBlock("latest").then( (block) => {
         var difficultyStr = this.difficulty.toString(16);
         difficultyStr = "0x" + "0".repeat(64 - difficultyStr.length) + difficultyStr;
         console.log( "[JS] Ethereum Block Number: " + block.number );
         console.log( "[JS] Ethereum Block Hash:   " + block.hash );
         console.log( "[JS] Target Difficulty:     " + difficultyStr );
         this.startTime = Date.now();
         this.hashes = 0;
         this.child.stdin.write(
            block.hash + " " +
            block.number.toString() + " " +
            difficultyStr + " " +
            this.tip + " " +
            this.powHeight + " " +
            Math.trunc(this.threadIterations) + " " +
            Math.trunc(this.hashLimit) + ";\n");
      });
   }
}
