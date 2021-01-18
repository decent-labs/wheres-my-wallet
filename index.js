require("dotenv").config()

const lpad = require("lpad")
const bip39 = require("bip39")
const bitcoin = require("bitcoinjs-lib")
const ElectrumCli = require('electrum-client')
const fs = require("fs")

const money = []
const problems = []

const getHistory = async (ecl, address) => {
  const revHash = bitcoin.crypto.sha256(bitcoin.address.toOutputScript(address)).reverse().toString('hex')
  const history = (await ecl.blockchainScripthash_getHistory(revHash)).length > 0
  return history
}

const getAddress = (hdWallet, path) => {
  const wallet = hdWallet.derivePath(path)
  let address

  if (path.startsWith("m/44")) {
    address = bitcoin.payments.p2pkh({ pubkey: wallet.publicKey }).address
  } else if (path.startsWith("m/49")) {
    address = bitcoin.payments.p2sh({ redeem: bitcoin.payments.p2wpkh({ pubkey: wallet.publicKey }) }).address
  } else if (path.startsWith("m/84")) {
    address = bitcoin.payments.p2wpkh({ pubkey: wallet.publicKey }).address
  }

  return address
}

const getAddresses = async (mnemonic, paths, gap = 1) => {
  const seed = await bip39.mnemonicToSeed(mnemonic)
  const hdWallet = bitcoin.bip32.fromSeed(seed);
  const data = []
  for (let path of paths.split(",")) {
    let address = ""
    if (path.includes("x")) {
      for (let i = 0; i < gap; i++) {
        const realPath = path.replace("x", i)
        address = getAddress(hdWallet, realPath)
        data.push({ address, path: realPath })
      }
    } else {
      address = getAddress(hdWallet, path)
      data.push({ address, path })
    }
  }
  return data
}

const checkValidity = async (ecl, seed, paths, gap, longestWord, updateIteration) => {
  const mnemonic = seed.join(" ")

  if (!bip39.validateMnemonic(mnemonic)) return;

  updateIteration()

  const addressesPaths = await getAddresses(mnemonic, paths, gap)
  const histories = []

  for (const addressPath of addressesPaths) {
    let history = false
    try {
      history = await getHistory(ecl, addressPath.address)
      histories.push({ path: addressPath.path, address: addressPath.address, history })
    } catch (error) {
      problems.push({ mnemonic, path: addressPath.path, address: addressPath.address })
      continue
    }
  }

  console.log(`${new Date().toISOString()}:`, mnemonic.split(" ").map(word => lpad(word, [...Array(longestWord + 1 - word.length)].join(" "))).join(" "))

  for (const history of histories) {
    if (history.history) {
      money.push({ mnemonic, address: history.address, path: history.path })
    }
  }

  if (money.length > 0) {
    console.log(`found ${money.length} addresses with a history so far`)
    console.log(money)
  }

  if (problems.length > 0) {
    console.log("there was a problem looking up the history for the following addresses")
    console.log(problems)
  }
}

const iterateWords = async (seedArray, wordlist, wordIndex, progress, progressIndex, callback) => {
  let currentProgress = progress.indexes[progressIndex]

  for (let i = currentProgress.wordListIndex; i < wordlist.length; i++) {
    currentProgress.wordListIndex = i
    seedArray[wordIndex] = wordlist[i]
    await callback(seedArray, () => progressFile(progress))
  }

  currentProgress.wordListIndex = 0
  progressFile(progress)
}

const getWrongWord = async (seedArray, otherIndex, progress, progressIndex, callback) => {
  let currentProgress = progress.indexes[progressIndex]

  if (!currentProgress) {
    progress.indexes[progressIndex] = { seedIndex: 0, wordListIndex: 0 }
    currentProgress = progress.indexes[progressIndex]
    progressFile(progress)
  }

  for (let i = currentProgress.seedIndex; i < seedArray.length; i++) {
    if (otherIndex >= i) continue

    currentProgress.seedIndex = i
    progressFile(progress)

    const badWord = seedArray[i]
    if (badWord != "x") continue
    await callback(i, seedArray)
    seedArray[i] = badWord
  }

  currentProgress.seedIndex = 0
  progressFile(progress)
}

const progressFile = progress => {
  const progressPath = "./PROGRESS.json"
  const write = (path, progress) => fs.writeFileSync(path, JSON.stringify(progress, null, "\t"))
  if (progress) return write(progressPath, progress)
  if (fs.existsSync(progressPath)) return require(progressPath)
  const defaultData = { indexes: [] }
  write(progressPath, defaultData)
  return require(progressPath)
}

const maxCounts = (progress, index, seedLength, wordListLength) => {
  let currentProgress = progress.indexes[index]
  currentProgress.seedIndex = seedLength - 1
  currentProgress.wordListIndex = wordListLength - 1
  progressFile(progress)
}

const findLongestWord = wordlist => {
  return wordlist.reduce((currentLength, word) => {
    if (word.length > currentLength) return word.length
    return currentLength
  }, 0)
}

const findMoney = async (badSeed, paths, gap, wordlist) => {
  const progress = progressFile()
  const longestWord = findLongestWord(wordlist)
  const seedArray = badSeed.split(" ")

  const ecl = new ElectrumCli(process.env.ELECTRUM_PORT, process.env.ELECTRUM_HOST, process.env.ELECTRUM_PROTOCOL)
  await ecl.connect()

  // // single word replacement
  // await getWrongWord(seedArray, -1, progress, 0, async (wordOneIndex, seedArray) => {
  //   await iterateWords(seedArray, wordlist, wordOneIndex, progress, 0, async (seedArray, updateIteration) => {
  //     await checkValidity(ecl, seedArray, paths, gap, longestWord, updateIteration)
  //   })
  // })
  // maxCounts(progress, 0, seedArray.length, wordlist.length)

  // double word replacement
  await getWrongWord(seedArray, -1, progress, 1, async (wordOneIndex, seedArray) => {
    await getWrongWord(seedArray, wordOneIndex, progress, 2, async (wordTwoIndex, seedArray) => {
      await iterateWords(seedArray, wordlist, wordOneIndex, progress, 1, async (seedArray) => {
        await iterateWords(seedArray, wordlist, wordTwoIndex, progress, 2, async (seedArray, updateIteration) => {
          await checkValidity(ecl, seedArray, paths, gap, longestWord, updateIteration)
        })
      })
    })
  })
  maxCounts(progress, 1, seedArray.length, wordlist.length)
  maxCounts(progress, 2, seedArray.length, wordlist.length)

  await ecl.close()
}

const go = async (badSeed, paths, gap, wordlist) => {
  await findMoney(badSeed, paths, gap, wordlist)
  done(money, problems)
}

const done = (money, problems) => {
  if (money.length > 0) {
    console.log("")
    console.log("we have a winner!")
    console.log(money)
    console.log("")
  } else {
    console.log("")
    console.log(":(")
    console.log("")
  }
  if (problems.length > 0) {
    console.log("")
    console.log("there were problems checking the balance of the following addresses")
    console.log(problems)
    console.log("")
  }
  process.exit()
}

process.on("SIGINT", () => done(money, problems))

go(
  process.env.BAD_SEED,
  process.env.DERIVATION_PATHS,
  process.env.DERIVATION_PATH_GAP,
  eval(`bip39.wordlists.${process.env.WORD_LIST_LANGUAGE}`)
)
