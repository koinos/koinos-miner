'use strict';

const { program } = require('commander');

program
   .version('1.0.0', '-v, --version')
   .usage('[OPTIONS]...')
   .requiredOption('-a, --addr <addr>', 'An ethereum address')
   .option('-e, --endpoint <endpoint>', 'An ethereum endpoint', 'https://ropsten.rpc.fiews.io/v1/free')
   .option('-t, --tip <percent>', 'The percentage of mined coins to tip the developers', '5')
   .option('-p, --proof-period <seconds>', 'How often you want to submit a proof on average', '86400')
   .option('-k, --key-file <file>', 'AES encrypted file containing private key')
   .option('--import', 'Import a private key')
   .option('--export', 'Export a private key')
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

const oo_address       = '0x0e27703cB52CD4a9206B1Dc58a816CEE09Ab885e';
const contract_address = '0xc4e86fB87ddBC4e397cE6B066e16640F433d3592';

var account;

var w3 = new Web3(process.endpoint);

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

if (program.import)
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

var miner = new KoinosMiner(program.addr, oo_address, account.address, contract_address, program.endpoint, program.tip, program.proofPeriod, signCallback, hashrateCallback, proofCallback)

miner.start();
