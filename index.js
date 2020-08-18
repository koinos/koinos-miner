'use strict';

const { program } = require('commander');

program
  .version('1.0.0', '-v, --version')
  .usage('[OPTIONS]...')
  .requiredOption('-a, --addr <addr>', 'An ethereum address')
  .option('-e, --endpoint <endpoint>', 'An ethereum endpoint')
  .option('-t, --tip <percent>', 'The percentage of mined coins to tip the developers', '5')
  .parse(process.argv);

console.log( `Ethereum Address: ${program.addr}` );
console.log( `Ethereum Endpoint: ${program.endpoint}` );
console.log( `Developer Tip: ${program.tip}%` );

