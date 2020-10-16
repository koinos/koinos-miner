'use strict';

const { program } = require('commander');

require('dotenv').config();

program
   .version('1.0.0', '-v, --version')
   .usage('[OPTIONS]...')
   .requiredOption('-a, --addr <addr>', 'An ethereum address')
   .option('-e, --endpoint <endpoint>', 'An ethereum endpoint', 'http://mining.koinos.io')
   .option('-t, --tip <percent>', 'The percentage of mined coins to tip the developers', '5')
   .option('-p, --proof-period <seconds>', 'How often you want to submit a proof on average', '86400')
   .option('-k, --key-file <file>', 'AES encrypted file containing private key')
   .option('-m, --gas-multiplier <multiplier>', 'The multiplier to apply to the recommended gas price', '1')
   .option('-g, --gwei-limit <limit>', 'The maximum amount of gas in gwei unit to be spent on a proof submission', '1000')
   .option('-b, --gwei-minimum <limit>', 'The minimum amount of gas in gwei unit to be spent on a proof submission', '25')
   .option('-s, --speed <speed>', `How fast should the transaction be: slow | medium | fast | fastest (https://fees.upvest.co/estimate_eth_fees)`)
   .option('-l, --gas-price-limit <limit>', 'The maximum amount of gas to be spent on a proof submission', '1000000000000')
   .option('--import', 'Import a private key')
   .option('--export', 'Export a private key')
   .option('--use-env', 'Use private key from .env file (privateKey=YOUR_PRIVATE_KEY)')
   .parse(process.argv);

console.log(` _  __     _                   __  __ _`);
console.log(`| |/ /    (_)                 |  \\/  (_)`);
console.log(`| ' / ___  _ _ __   ___  ___  | \\  / |_ _ __   ___ _ __`);
console.log(`|  < / _ \\| | '_ \\ / _ \\/ __| | |\\/| | | '_ \\ / _ \\ '__|`);
console.log(`| . \\ (_) | | | | | (_) \\__ \\ | |  | | | | | |  __/ |`);
console.log(`|_|\\_\\___/|_|_| |_|\\___/|___/ |_|  |_|_|_| |_|\\___|_|`);
console.log(``);
console.log(`[JS](app.js) Mining with the following arguments:`);
console.log(`[JS](app.js) Ethereum Address: ${program.addr}`);
console.log(`[JS](app.js) Ethereum Endpoint: ${program.endpoint}`);
console.log(`[JS](app.js) Developer Tip: ${program.tip}%`);
console.log(`[JS](app.js) Proof Period: ${program.proofPeriod}`);
console.log(``);

let KoinosMiner = require('.');
const readlineSync = require('readline-sync');
const crypto = require('crypto')
var Web3 = require('web3');
var fs = require('fs');

const tip_addresses = [
   "0x292B59941aE124acFca9a759892Ae5Ce246eaAD2",
   "0xbf3C8Ffc87Ba300f43B2fDaa805CcA5DcB4bC984",
   "0x407A73626697fd22b1717d294E6B39437531013d",
   "0x69486fda786D82dBb61C78847A815d5F615C2B15",
   "0x434eAbB24c0051280D1CC0AF6E12bF59b5F932e9",
   "0xa524095504833359E6E1d41161102B1a314b97C0",
   "0xf7771105679d2bfc27820B93C54516f1d8772C88",
   "0xa0fc784961E6aCc30D28FA072Aa4FB3892C1938A",
   "0x306443eeBf036A35a360f005BE306FD7855e8Cb5",
   "0x40609227175ac3093086072391Ff603db2e3D72a",
   "0xE536fdfF635aEB8B9DFd6Be207e1aE10A58fB85e",
   "0x9d2DfA864887dF1f41bC02CE94C74Bb0dE471Da6",
   "0x563f6EB769883f98e56BF20127c116ABce8EF564",
   "0x33D682B145f4AA664353b6B6A7B42a13D1c190a9",
   "0xea701365BC23Aa696D5DaFa0394cC6f1a18b2832",
   "0xc8B02B313Bd56372D278CAfd275641181d29793d",
   "0xd73B6Da85bE7Dae4AC2A7D5388e9F237ed235450",
   "0x03b6470040b5139b82F96f8D9D61DAb43a01a75c",
   "0xF8357581107a12c3989FFec217ACb6cd0336acbE",
   "0xeAdB773d0896EC5A3463EFAF6A1b763ECEC33743"
   ];
const contract_address = '0xa18c8756ee6B303190A702e81324C72C0E7080c5';

var account;

var w3 = new Web3(program.endpoint);

let warningCallback = function(warning) {
   console.log(`[JS](app.js) Warning: `, warning);
}

let errorCallback = function(error) {
   console.log(`[JS](app.js) Error: `, error);
}

let hashrateCallback = function(hashrate)
{
   console.log(`[JS](app.js) Hashrate: ` + KoinosMiner.formatHashrate(hashrate));
}

let proofCallback = function(submission) {}

let signCallback = async function(web3, txData)
{
   return (await web3.eth.accounts.signTransaction(txData, account.privateKey)).rawTransaction;
}

function enterPassword()
{
   return readlineSync.questionNewPassword('Enter password for encryption: ', {mask: ''});
}

function encrypt(data, password)
{
   const passwordHash = crypto.createHmac('sha256', password).digest();
   const key = Buffer.from(passwordHash.toString('hex').slice(16), 'hex');
   const iv = Buffer.from(crypto.createHmac('sha256', passwordHash).digest('hex').slice(32), 'hex');
   var cipher = crypto.createCipheriv('aes-192-cbc', key, iv );

   var cipherText = cipher.update(data, 'utf8', 'hex');
   cipherText += cipher.final('hex');

   return cipherText;
}

function decrypt(cipherText, password)
{
   const passwordHash = crypto.createHmac('sha256', password).digest();
   const key = Buffer.from(passwordHash.toString('hex').slice(16), 'hex');
   const iv = Buffer.from(crypto.createHmac('sha256', passwordHash).digest('hex').slice(32), 'hex');
   var decipher = crypto.createDecipheriv('aes-192-cbc', key, iv );

   let decrypted = '';

   decipher.on('readable', () => {
      let chunk;
      while (null !== (chunk = decipher.read())) {
         decrypted += chunk.toString('utf8');
      }
   });

   decipher.write(cipherText, 'hex');
   decipher.end();

   return decrypted
}

if(program.useEnv) {
   if(!process.env.privateKey) {
      console.log(`Can't find privateKey within .env file.`);
      process.exit(0);
   }
   account = w3.eth.accounts.privateKeyToAccount(process.env.privateKey);
   console.log('Imported Ethereum address: ' + account.address);
}
else if (program.import)
{
   account = w3.eth.accounts.privateKeyToAccount(
      readlineSync.questionNewPassword('Enter private key: ', {
         mask: '',
         min: 64,
         max: 66,
         charlist: '$<0-9>$<A-F>$<a-f>x'
   }));

   if(readlineSync.keyInYNStrict('Do you want to store your private key encrypted on disk?'))
   {
      var cipherText = encrypt(account.privateKey, enterPassword());

      var filename = readlineSync.question('Where do you want to save the encrypted private key? ');
      fs.writeFileSync(filename, cipherText);
   }

   console.log('Imported Ethereum address: ' + account.address);
}
else if (program.keyFile)
{
   if(program.export && !readlineSync.keyInYNStrict('Outputting your private key unencrypted can be dangerous. Are you sure you want to continue?'))
   {
      process.exit(0);
   }

   var data = fs.readFileSync(program.keyFile, 'utf8');
   account = w3.eth.accounts.privateKeyToAccount(decrypt(data, enterPassword()));

   console.log('Decrypted Ethereum address: ' + account.address);

   if(program.export)
   {
      console.log(account.privateKey);
      process.exit(0);
   }
}
else
{
   if(!readlineSync.keyInYNStrict('No private key file specified. Do you want to create a new key?'))
   {
      process.exit(0);
   }

   var seed = readlineSync.question('Enter seed for entropy: ', {hideEchoBack: true, mask: ''});
   account = w3.eth.accounts.create(crypto.createHmac('sha256', seed).digest('hex'));

   var cipherText = encrypt(account.privateKey, enterPassword());

   var filename = readlineSync.question('Where do you want to save the encrypted private key? ');
   fs.writeFileSync(filename, cipherText);

   console.log('Created new Ethereum address: ' + account.address);
}

var miner = new KoinosMiner(
   program.addr,
   tip_addresses,
   account.address,
   contract_address,
   program.endpoint,
   program.tip,
   program.proofPeriod,
   program.gasMultiplier,
   program.gasPriceLimit,
   program.gweiLimit,
   program.gweiMinimum,
   program.speed,
   signCallback,
   hashrateCallback,
   proofCallback,
   errorCallback,
   warningCallback);

miner.start();
