'use strict';

const { program } = require('commander');
const os = require('os')

program
   .version('1.0.0', '-v, --version')
   .usage('[OPTIONS]...')
   .requiredOption('-a, --addr <addr>', 'An ethereum address')
   .option('-e, --endpoint <endpoint>', 'An ethereum endpoint', 'https://ropsten.rpc.fiews.io/v1/free')
   .option('-t, --tip <percent>', 'The percentage of mined coins to tip the developers', '5')
   .option('-p, --proof-period <seconds>', 'How often you want to submit a proof on average', '86400')
   .parse(process.argv);

let tip = program.tip  * 100;
var pow_height = 0;
var thread_iterations = 600000;
var hash_limit = 100000000;
// Start at 32 bits of difficulty
var difficulty = BigInt("0x00000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
var start_time = Date.now();
var end_time = Date.now();
var last_proof = Date.now();
var hashes = 0;
var hash_rate = 0;

console.log( `[JS] Ethereum Address: ${program.addr}` );
console.log( `[JS] Ethereum Endpoint: ${program.endpoint}` );
console.log( `[JS] Developer Tip: ${tip}` );

var Web3 = require('web3');
var web3 = new Web3( program.endpoint );

function minerPath() {
   var miner = process.cwd() + '/bin/koinos_miner';
   if ( process.platform === "win32" ) {
      miner += '.exe';
   }
   return miner;
}

var spawn = require('child_process').spawn;
var child = spawn( minerPath() );

function getValue(s) {
   let str = s.toString();
   return str.substring(2, str.length - 2);
}

function isFinished(s) {
   let str = s.toString();
   return "F:" === str.substring(0, 2);
}

function isNonce(s) {
   let str = s.toString();
   return "N:" === str.substring(0, 2);
}

function isHashReport(s) {
   let str = s.toString();
   return "H:" === str.substring(0,2);
}

async function mine() {
   web3.eth.getBlock("latest").then( (block) => {
      var difficulty_str = difficulty.toString(16);
      difficulty_str = "0x" + "0".repeat(64 - difficulty_str.length) + difficulty_str;
      console.log( "[JS] Ethereum Block Number: " + block.number );
      console.log( "[JS] Ethereum Block Hash:   " + block.hash );
      console.log( "[JS] Target Difficulty:     " + difficulty_str );
      start_time = Date.now();
      hashes = 0;
      child.stdin.write(
         block.hash + " " +
         block.number.toString() + " " +
         difficulty_str + " " +
         tip + " " +
         pow_height + " " +
         Math.trunc(thread_iterations) + " " +
         Math.trunc(hash_limit) + ";\n");
   });
}

function updateHashrate(d_hashes, d_time) {
   if ( hash_rate > 0 ) {
      hash_rate += Math.trunc((d_hashes * 1000) / d_time);
      hash_rate /= 2;
   }
   else {
      hash_rate = Math.trunc((d_hashes * 1000) / d_time);
   }
}

function adjustDifficulty() {
   const max_hash = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"); // 2^256 - 1
   var hashes_per_period = hash_rate * parseInt(program.proofPeriod);
   difficulty = max_hash / BigInt(Math.trunc(hashes_per_period));
   difficulty >>= 1n;
   thread_iterations = hash_rate / os.cpus().length; // Per thread hash rate
   hash_limit = hash_rate * 60 * 30; // Hashes for 30 minutes
}

function formatHashrate(h) {
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

child.stdin.setEncoding('utf-8');
child.stderr.pipe(process.stdout);
child.stdout.on('data', function (data) {
   if ( isFinished(data) ) {
      end_time = Date.now();
      console.log("[JS] Finished!");
      adjustDifficulty();
      mine();
   }
   else if ( isNonce(data) ) {
      var now = Date.now();
      var new_hashes = parseInt(getValue(data),16);
      updateHashrate(new_hashes - hashes, now - end_time);
      end_time = now;
      console.log( "[JS] Nonce: " + new_hashes );
      var delta = end_time - last_proof;
      last_proof = end_time;
      var ms = delta % 1000;
      delta = Math.trunc(delta / 1000);
      var seconds = delta % 60;
      delta = Math.trunc(delta / 60);
      var minutes = delta % 60;
      var hours = Math.trunc(delta / 60);
      console.log( "[JS] Time to find proof: " + hours + ":" + minutes + ":" + seconds + "." + ms );
      pow_height++;
      adjustDifficulty();
      mine();
   }
   else if ( isHashReport(data) ) {
      var ret = getValue(data).split(" ");
      var now = Date.now();
      var new_hashes = parseInt(ret[1]);
      updateHashrate(new_hashes - hashes, now - end_time);
      hashes = new_hashes;
      end_time = now;
      console.log( "[JS] Current hash rate: " + formatHashrate(hash_rate) );
   }
});

mine();
