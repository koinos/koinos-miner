'use strict';

var Web3 = require('web3');
const os = require('os');
//const abi = require('./abi.js')

const contract_address = '0x97AF17cDda337a87Ab335F496f5ca4B8520952bf'

var abi =
[
   {
     "anonymous": false,
     "inputs": [
       {
         "indexed": false,
         "internalType": "address[]",
         "name": "recipients",
         "type": "address[]"
       },
       {
         "indexed": false,
         "internalType": "uint256[]",
         "name": "split_percents",
         "type": "uint256[]"
       },
       {
         "indexed": false,
         "internalType": "uint256",
         "name": "hc_submit",
         "type": "uint256"
       },
       {
         "indexed": false,
         "internalType": "uint256",
         "name": "hc_decay",
         "type": "uint256"
       },
       {
         "indexed": false,
         "internalType": "uint256",
         "name": "token_virtual_mint",
         "type": "uint256"
       },
       {
         "indexed": false,
         "internalType": "uint256[]",
         "name": "tokens_mined",
         "type": "uint256[]"
       }
     ],
     "name": "Mine",
     "type": "event"
   },
   {
     "anonymous": false,
     "inputs": [
       {
         "indexed": true,
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       },
       {
         "indexed": true,
         "internalType": "address",
         "name": "account",
         "type": "address"
       },
       {
         "indexed": true,
         "internalType": "address",
         "name": "sender",
         "type": "address"
       }
     ],
     "name": "RoleGranted",
     "type": "event"
   },
   {
     "anonymous": false,
     "inputs": [
       {
         "indexed": true,
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       },
       {
         "indexed": true,
         "internalType": "address",
         "name": "account",
         "type": "address"
       },
       {
         "indexed": true,
         "internalType": "address",
         "name": "sender",
         "type": "address"
       }
     ],
     "name": "RoleRevoked",
     "type": "event"
   },
   {
     "inputs": [],
     "name": "DEFAULT_ADMIN_ROLE",
     "outputs": [
       {
         "internalType": "bytes32",
         "name": "",
         "type": "bytes32"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "EMISSION_COEFF_1",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "EMISSION_COEFF_2",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "FINAL_PRINT_RATE",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "HC_RESERVE_DECAY_TIME",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "MINEABLE_TOKENS",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "ONE_KNS",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "RECENT_BLOCK_LIMIT",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "START_HC_RESERVE",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "TOTAL_EMISSION_TIME",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "address[]",
         "name": "recipients",
         "type": "address[]"
       },
       {
         "internalType": "uint256[]",
         "name": "split_percents",
         "type": "uint256[]"
       },
       {
         "internalType": "uint256",
         "name": "recent_eth_block_number",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "recent_eth_block_hash",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "target",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "pow_height",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "nonce",
         "type": "uint256"
       }
     ],
     "name": "check_pow",
     "outputs": [],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       }
     ],
     "name": "getRoleAdmin",
     "outputs": [
       {
         "internalType": "bytes32",
         "name": "",
         "type": "bytes32"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       },
       {
         "internalType": "uint256",
         "name": "index",
         "type": "uint256"
       }
     ],
     "name": "getRoleMember",
     "outputs": [
       {
         "internalType": "address",
         "name": "",
         "type": "address"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       }
     ],
     "name": "getRoleMemberCount",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "uint256",
         "name": "current_time",
         "type": "uint256"
       }
     ],
     "name": "get_background_activity",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "hc_decay",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "token_virtual_mint",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "uint256",
         "name": "t",
         "type": "uint256"
       }
     ],
     "name": "get_emission_curve",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "uint256",
         "name": "hc",
         "type": "uint256"
       }
     ],
     "name": "get_hash_credits_conversion",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "uint256",
         "name": "dt",
         "type": "uint256"
       }
     ],
     "name": "get_hc_reserve_multiplier",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "pure",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "address",
         "name": "miner",
         "type": "address"
       }
     ],
     "name": "get_pow_height",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "address[]",
         "name": "recipients",
         "type": "address[]"
       },
       {
         "internalType": "uint256[]",
         "name": "split_percents",
         "type": "uint256[]"
       },
       {
         "internalType": "uint256",
         "name": "recent_eth_block_number",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "recent_eth_block_hash",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "target",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "pow_height",
         "type": "uint256"
       }
     ],
     "name": "get_secured_struct_hash",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "pure",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       },
       {
         "internalType": "address",
         "name": "account",
         "type": "address"
       }
     ],
     "name": "grantRole",
     "outputs": [],
     "stateMutability": "nonpayable",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       },
       {
         "internalType": "address",
         "name": "account",
         "type": "address"
       }
     ],
     "name": "hasRole",
     "outputs": [
       {
         "internalType": "bool",
         "name": "",
         "type": "bool"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "hc_reserve",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "address",
         "name": "tok",
         "type": "address"
       },
       {
         "internalType": "uint256",
         "name": "start_t",
         "type": "uint256"
       },
       {
         "internalType": "bool",
         "name": "testing",
         "type": "bool"
       }
     ],
     "name": "initialize",
     "outputs": [],
     "stateMutability": "nonpayable",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "is_testing",
     "outputs": [
       {
         "internalType": "bool",
         "name": "",
         "type": "bool"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "last_mint_time",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "address[]",
         "name": "recipients",
         "type": "address[]"
       },
       {
         "internalType": "uint256[]",
         "name": "split_percents",
         "type": "uint256[]"
       },
       {
         "internalType": "uint256",
         "name": "recent_eth_block_number",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "recent_eth_block_hash",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "target",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "pow_height",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "nonce",
         "type": "uint256"
       }
     ],
     "name": "mine",
     "outputs": [],
     "stateMutability": "nonpayable",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       },
       {
         "internalType": "address",
         "name": "account",
         "type": "address"
       }
     ],
     "name": "renounceRole",
     "outputs": [],
     "stateMutability": "nonpayable",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "bytes32",
         "name": "role",
         "type": "bytes32"
       },
       {
         "internalType": "address",
         "name": "account",
         "type": "address"
       }
     ],
     "name": "revokeRole",
     "outputs": [],
     "stateMutability": "nonpayable",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "start_time",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "address[]",
         "name": "recipients",
         "type": "address[]"
       },
       {
         "internalType": "uint256[]",
         "name": "split_percents",
         "type": "uint256[]"
       },
       {
         "internalType": "uint256",
         "name": "recent_eth_block_number",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "recent_eth_block_hash",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "target",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "pow_height",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "nonce",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "current_time",
         "type": "uint256"
       }
     ],
     "name": "test_mine",
     "outputs": [],
     "stateMutability": "nonpayable",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "uint256",
         "name": "current_time",
         "type": "uint256"
       }
     ],
     "name": "test_process_background_activity",
     "outputs": [],
     "stateMutability": "nonpayable",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "token",
     "outputs": [
       {
         "internalType": "contract IMintableERC20",
         "name": "",
         "type": "address"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [],
     "name": "token_reserve",
     "outputs": [
       {
         "internalType": "uint256",
         "name": "",
         "type": "uint256"
       }
     ],
     "stateMutability": "view",
     "type": "function"
   },
   {
     "inputs": [
       {
         "internalType": "uint256",
         "name": "seed",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "secured_struct_hash",
         "type": "uint256"
       },
       {
         "internalType": "uint256",
         "name": "nonce",
         "type": "uint256"
       }
     ],
     "name": "work",
     "outputs": [
       {
         "internalType": "uint256[11]",
         "name": "work_result",
         "type": "uint256[11]"
       }
     ],
     "stateMutability": "pure",
     "type": "function"
   }
];

module.exports = class KoinosMiner {
   oo_address = '0x8c7b3F56C5d06710701eD51fB2aAD709CBff9D00'
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
   contract = null;

   constructor(address, endpoint, tip, period, hashrateCallback) {
      this.address = address;
      this.web3 = new Web3( endpoint );
      this.tip  = tip * 100;
      this.proofPeriod = period;
      this.hashrateCallback = hashrateCallback;
      this.contract = new this.web3.eth.Contract( abi, contract_address, {from: address, gasPrice:'20000000000', gas: 6721975} );
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

      this.contract.methods.get_pow_height(this.address).call({from: this.address}).then(
         function(result)
         {
            self.powHeight = result + 1;
         }
      );


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
            var nonce = BigInt('0x' + self.getValue(data));
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

            console.log([
               [self.address,self.oo_address],
               [10000-self.tip,self.tip],
               self.block.number,
               self.block.hash,
               self.difficulty,
               self.powHeight,
               nonce
            ]);

            self.contract.methods.mine(
               [self.address,self.oo_address],
               [10000-self.tip,self.tip],
               self.block.number,
               self.block.hash,
               self.difficulty,
               self.powHeight,
               nonce).send({from: self.address});
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
         this.block = block;
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
