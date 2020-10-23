![Koinos Miner](assets/images/koinos-cli-miner-banner.png)

[![GitHub Issues](https://img.shields.io/github/issues/open-orchard/koinos-miner.svg)](https://github.com/open-orchard/koinos-miner/issues)
[![GitHub License](https://img.shields.io/badge/license-GPLv3-blue.svg)](https://github.com/open-orchard/koinos-miner/blob/master/LICENSE.md)

## Table of Contents
  - [Dependencies](#dependencies)
  - [Installation](#installation)
  - [Getting Started](#getting-started)
  - [Key Management](#key-management)
  - [Example Run](#example-run)
  - [FAQ](#FAQ)

## Dependencies

Prior to installation, you'll need to install the necessary dependencies.

### Linux (Debian based)

```
sudo apt-get install git cmake build-essential libssl-dev
```

### macOS

On macOS, installing `gcc` is required to support OpenMP parallelization. Using the `brew` package manager, install OpenSSL and gcc.
```
brew install openssl gcc cmake
```

### Windows

On Windows, ensure that you are using the `MingW` compiler and you have installed `CMake`. Using the cholocately package manager, install OpenSSL.

```
choco install openssl
```

## Installation

For both Windows and Linux, you should be able to simply invoke the standard `npm` installer.

```
npm install
```

For macOS, you will need to specify the C compiler as `gcc`.

```
CC=gcc-10 npm install
```

## Getting started

You can view the CLI miner arguments by using `npm` like so:

```
npm start -- --help
```

And get the following output:

```
❯ npm start -- --help

> koinos-miner@1.0.0 start /path/to/koinos-miner
> node app.js "--help"

Usage: app [OPTIONS]...

Options:
  -v, --version                      output the version number
  -a, --addr <addr>                  An ethereum address
  -e, --endpoint <endpoint>          An ethereum endpoint (default: "http://mining.koinos.io")
  -t, --tip <percent>                The percentage of mined coins to tip the developers (default: "5")
  -p, --proof-period <seconds>       How often you want to submit a proof on average (default: "86400")
  -k, --key-file <file>              AES encrypted file containing private key
  -m, --gas-multiplier <multiplier>  The multiplier to apply to the recommended gas price (default: "1")
  -l, --gas-price-limit <limit>      The maximum amount of gas to be spent on a proof submission (default: "1000000000000")
  --import                           Import a private key
  --export                           Export a private key
  -h, --help                         display help for command
```

**Recipient Address**: The `--addr` argument specifies the recipient address, this is where KOIN will be rewarded.

**Ethereum Endpoint**: The `--endpoint` argument specifies the Ethereum node to be used when querying contract information and submitting proofs.

**Developer Tip**: The `--tip` argument specifies the percentage of rewarded KOIN to donate to the development team, thank you!

**Proof Period**: The `--proof-period` argument specifies the number of seconds on average the miner will attempt to mine and submit proofs.

**Gas Multiplier**: The `--gas-multiplier` argument specifies a multiplier to apply to the calculated gas price. This can be used to get your proofs submitted when the Ethereum network gas fees are spiking or are unpredictable.

**Gas Price Limit**: The `--gas-price-limit` argument specifies a cap in the acceptable gas price for a proof submission.

A more detailed explanation of the different miner configurations can be found in the [Koinos GUI Miner](https://github.com/open-orchard/koinos-gui-miner) `README.md`.

## Key Management

The CLI miner provides the arguments `--import`, `--export`, and `--key-file`. These are used in handling the private key of the funding address. The user may import a private key and optionally store it in a key file in which case exporting the key is now possible.

## Example Run

A simple example of running the miner:

```
❯ npm start -- --endpoint http://167.172.118.40:8545 --addr 0x98047645bf61644caa0c24daabd118cc1d640f62 --import

> koinos-miner@1.0.0 start /path/to/koinos-miner
> node app.js "--endpoint" "http://167.172.118.40:8545" "--addr" "0x98047645bf61644caa0c24daabd118cc1d640f62" "--import"

 _  __     _                   __  __ _
| |/ /    (_)                 |  \/  (_)
| ' / ___  _ _ __   ___  ___  | \  / |_ _ __   ___ _ __
|  < / _ \| | '_ \ / _ \/ __| | |\/| | | '_ \ / _ \ '__|
| . \ (_) | | | | | (_) \__ \ | |  | | | | | |  __/ |
|_|\_\___/|_|_| |_|\___/|___/ |_|  |_|_|_| |_|\___|_|

[JS](app.js) Mining with the following arguments:
[JS](app.js) Ethereum Address: 0x98047645bf61644caa0c24daabd118cc1d640f62
[JS](app.js) Ethereum Endpoint: http://167.172.118.40:8545
[JS](app.js) Developer Tip: 5%
[JS](app.js) Proof Period: 86400

Enter private key:
Reinput a same one to confirm it:
Do you want to store your private key encrypted on disk? [y/n]: n
Imported Ethereum address: 0x98047645BF61644CAA0c24dAABD118cC1D640F62
[JS] Starting miner
```
# FAQ

## What is “Proof Frequency?”

The key to understanding the proof frequency is that this number isn’t a “real” setting in the miner. Instead what you are modifying is the *difficulty* of the problem your miner is trying to solve. Harder problems take longer to solve, but the time it takes to solve them is just a guesstimation. The miner might solve the problem right away, or take an unusually long time. It will only rarely take exactly the time you expect it to take.

## Why Set a Low Frequency?

In the case of PoW KOIN mining, increased difficulty results in a higher *potential* KOIN reward. But again, there is randomness here too. The KOIN reward *might* be large, but it might also be small. So a lower number (e.g. 1 per day or 2 per day) is likely to win you larger KOIN rewards. But an added benefit is that it minimizes your Ethereum fees as well.

## Why Set a High Frequency?

Low frequency proofs (i.e. high difficulty) give you bigger potential rewards, so why would you increase the frequency especially considering it will result in higher Ethereum fees? One way to think about mining is like it’s a lottery (except it has slightly better odds ;) ). If you buy enough tickets, you can expect to win an approximate number of times. But you know that your odds of winning with any single ticket is very low. So what do you do? You increase the number of tickets you buy. You make sure that you’re playing the game enough times so that *over the long run* you receive the rewards that the probabilities say you should.

## What Happens if I Shut Down the Miner?

Note that setting a higher frequency doesn’t help you beat someone else to the punch. Your computer is solving hundreds of thousands (or millions) of “losing” hashes every second that it is throwing in the trash, just as you would a losing lottery ticket. It is not saving those hashes, it is searching for one “winning” hash and when it finds that hash it immediately submits a proof to the Ethereum network. This is why it doesn’t matter if your computer loses access to the internet or you just turn off the miner for a moment. You don’t “lose” anything other than the opportunity costs associated with the time that could have been spent mining.

# Why Mine?

It’s important to remember that our mission is to give everyone ownership and control over their digital selves. The foundational product we are releasing to serve that mission is the Koinos mainnet and the purpose of this mining phase is to decentralize the token distribution and ensure that when it launches, the Koinos mainnet is as decentralized as any blockchain out there, if not more!

KOIN will be the cryptocurrency that powers a decentralized computer built from the ground up to enable developers to offer delightful user experiences while protecting the user’s digital information through blockchain integration. The purpose of this phase is to get KOIN into the hands of developers and users who want be able to use the types of applications that Koinos is capable of powering.

## License

Copyright 2020 Open Orchard, Inc.

Koinos Miner is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Koinos Miner is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Koinos Miner.  If not, see <https://www.gnu.org/licenses/>.
