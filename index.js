'use strict';

const { program } = require('commander');

program
   .version('1.0.0', '-v, --version')
   .usage('[OPTIONS]...')
   .requiredOption('-a, --addr <addr>', 'An ethereum address')
   .option('-e, --endpoint <endpoint>', 'An ethereum endpoint', 'https://ropsten.rpc.fiews.io/v1/free')
   .option('-t, --tip <percent>', 'The percentage of mined coins to tip the developers', '5')
   .option('-d, --difficulty <difficulty>', 'The desired number of difficulty bits', '28')
   .parse(process.argv);

let tip = program.tip  * 100;
var pow_height = 0;
var thread_iterations = 600000;
var hash_limit = Number.MAX_SAFE_INTEGER;

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
      console.log( "[JS] Ethereum Block Number: " + block.number );
      console.log( "[JS] Ethereum Block Hash:   " + block.hash );
      child.stdin.write(
         block.hash + " " + 
         block.number.toString() + " " + 
         program.difficulty + " " +
         tip + " " +
         pow_height + " " +
         thread_iterations + " " +
         hash_limit + ";\n");
   });
}

child.stdin.setEncoding('utf-8');
child.stderr.pipe(process.stdout);
child.stdout.on('data', function (data) {
   if ( isFinished(data) ) {
      console.log("[JS] Finished!");
      mine();
   }
   else if ( isNonce(data) ) {
      console.log( "[JS] Nonce: " + getValue(data) );
      pow_height++;
      mine();
   }
   else if ( isHashReport(data) ) {
      console.log( "[JS] Hash report: " + getValue(data) );
   }
});

mine();
