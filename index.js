'use strict';

const { program } = require('commander');

program
   .version('1.0.0', '-v, --version')
   .usage('[OPTIONS]...')
   .requiredOption('-a, --addr <addr>', 'An ethereum address')
   .option('-e, --endpoint <endpoint>', 'An ethereum endpoint', 'https://ropsten.rpc.fiews.io/v1/free')
   .option('-t, --tip <percent>', 'The percentage of mined coins to tip the developers', '5')
   .option('-d, --difficulty <difficulty>', 'The desired number of difficulty bits', '10')
   .parse(process.argv);

console.log( `[JS] Ethereum Address: ${program.addr}` );
console.log( `[JS] Ethereum Endpoint: ${program.endpoint}` );
console.log( `[JS] Developer Tip: ${program.tip}%` );

var Web3 = require('web3');
var web3 = new Web3( program.endpoint );

var StringDecoder = require('string_decoder').StringDecoder;
var decoder = new StringDecoder('utf8');

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
   return str.substring(0, str.length - 1);
}

async function mine() {
   web3.eth.getBlock("latest").then( (block) => {
      console.log( "[JS] Ethereum Block Number: " + block.number );
      console.log( "[JS] Ethereum Block Hash:   " + block.hash );
      child.stdin.write(block.hash + " " + block.number.toString() + ";\n");
   });
}

child.stdin.setEncoding('utf-8');
child.stderr.pipe(process.stderr);
child.stdout.on('data', function (data) {
   console.log( "[JS] Nonce: " + getValue(data) );
   mine();
});

mine();
