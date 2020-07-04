# Where's My Wallet

A tool to brute force seed phrases that aren't quite right.

_This tool currently only works with Ethereum. Pull Requests to support more chains are greately appreciated._

This tool does two passes over a seed phrase, replacing words with other words.

On the first pass, a single word index in the original bad seed phrase is repalced with another valid word from the full word list. We loop through each word index in the seed phrase, replacing it with each word index in the full word list. This pass will find money if just a single word in the phrase was copied incorrectly.

After the first pass is complete, the second pass starts.

The second pass will replace TWO words at a time, and takes _much_ longer to execute. This pass will find money ff two words in the phrase were transposed, or two words are incorrect.

As the script executes and creates mnemonic phraes, if the a phrase is valid (aka the checksum is good), we generate an address(es) for that phrase, and check the balance. If the balance is 0, we move onto the next one. If the balance is > 0, we found money! The details of that address (how to regenerate it) are printed to the console, and the program continues.

Don't worry, when you kill the script, any previously-found monies are printed to the console on exit.

When you start the script again, it'll pick up where it last left off (via the data saved into `PROGRESS.json`).

## Setup

Welcome! To use this tool, you need to set up the environment for your specific needs.

### Install dependencies

```sh
$ npm install
```

### Set up your environment

```sh
$ cp .env.example .env
```

Head into `.env` and enter your slightly-wrong seed phrase into the `BAD_SEED` variable.

Set your wordlist language.

Provide a comma-delimited list of derivation paths. You can use an `x` in place of a path parameter, to treat that parameter as a variable.

If you are using an `x` in a derivation path, you must set a `DERIVATION_PATH_GAP`. This value is looped through, and replaces the `x` in a derivation path. For example, if your derivation path is `"m/44'/60'/x'/0/0"`, and your gap is `5`, the addresses derived from

- `"m/44'/60'/0'/0/0"`
- `"m/44'/60'/1'/0/0"`
- `"m/44'/60'/2'/0/0"`
- `"m/44'/60'/3'/0/0"`
- `"m/44'/60'/4'/0/0"`

will be checked.

Finally, set your Ethereum provider URL, to be used for checking address balances. Every valid address that's generated from every valid seed phrase that's generated will make a `getBalance(address)` call against this node, so get ready for a barrage of network requests.

## TODOs and Known Bugs

- Save `money` to disk when `money` is found
  - Append to file, don't overwrite it
- Save `problems` to disk when `problems` are found
  - Append to file, don't overwrite it
- Update structure of `PROGRESS.json` to be a little friendly for the implementer
- Do better error handling on user-inputs (env variables)
- Make better tests
- Refactor so that user can set an environment variable for the "number of concurrent word replacements" (eg. 1, 2, 3, 4...)
  - This has been really hard for me to figure out. I think some kind of recursive call, but the callback-style of the code is making it difficult
