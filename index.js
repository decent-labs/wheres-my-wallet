require("dotenv").config()

const lpad = require("lpad")

const bip39 = require("bip39")
const { hdkey } = require("ethereumjs-wallet")

const Web3 = require("web3")
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETHEREUM_PROVIDER_URL))

const fs = require("fs")

const money = []
const problems = []

const getBalance = async address => {
  const balancePromise = address => {
    return new Promise((resolve, reject) => {
      web3.eth.getBalance(address, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }

  const wei = await balancePromise(address)
  const balance = web3.utils.fromWei(wei, "ether")
  return balance
}

const getAddress = (hdWallet, path) => {
  const wallet = hdWallet.derivePath(path).getWallet()
  const address = wallet.getAddressString()
  return address
}

const getAddresses = async (mnemonic, paths, gap = 1) => {
  const seed = await bip39.mnemonicToSeed(mnemonic)
  const hdWallet = hdkey.fromMasterSeed(seed)
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

const checkValidity = async (seed, paths, gap, longestWord, updateIteration) => {
  const mnemonic = seed.join(" ")

  if (!bip39.validateMnemonic(mnemonic)) return;

  updateIteration()

  const addressesPaths = await getAddresses(mnemonic, paths, gap)
  const balances = []

  for (const addressPath of addressesPaths) {
    let balance = 0
    try {
      balance = await getBalance(addressPath.address)
      balances.push({ path: addressPath.path, address: addressPath.address, balance })
    } catch (error) {
      problems.push({ mnemonic, path: addressPath.path, address: addressPath.address })
      continue
    }
  }

  console.log(`${new Date().toISOString()}:`, mnemonic.split(" ").map(word => lpad(word, [...Array(longestWord + 1 - word.length)].join(" "))).join(" "))

  for (const balance of balances) {
    if (balance.balance > 0) {
      money.push({ mnemonic, ...balance })
    }
  }

  if (money.length > 0) {
    console.log(`found ${money.length} addresses with a balance so far`)
    console.log(money)
  }

  if (problems.length > 0) {
    console.log("there was a problem looking up the balance for the following addresses")
    console.log(problems)
  }
}

const iterateWords = async (seedArray, wordlist, wordIndex, progress, progressIndex, callback) => {
  let currentProgress = progress.indexes[progressIndex]

  const updateProgress = () => {
    fs.writeFileSync("./PROGRESS.json", JSON.stringify(progress))
  }

  for (let i = currentProgress.wordListIndex; i < wordlist.length; i++) {
    currentProgress.wordListIndex = i
    seedArray[wordIndex] = wordlist[i]
    await callback(seedArray, updateProgress)
  }

  currentProgress.wordListIndex = 0
}

const getWrongWord = async (seedArray, otherIndex, progress, progressIndex, callback) => {
  let currentProgress = progress.indexes[progressIndex]

  if (!currentProgress) {
    progress.indexes[progressIndex] = { seedIndex: 0, wordListIndex: 0 }
    currentProgress = progress.indexes[progressIndex]
  }

  for (let i = currentProgress.seedIndex; i < seedArray.length; i++) {
    if (otherIndex >= i) continue

    currentProgress.seedIndex = i
    fs.writeFileSync("./PROGRESS.json", JSON.stringify(progress))

    const badWord = seedArray[i]
    await callback(i, seedArray)
    seedArray[i] = badWord
  }
}

const getProgress = () => {
  const progressPath = "./PROGRESS.json"
  if (fs.existsSync(progressPath)) return require(progressPath)

  const defaultData = { indexes: [] }
  fs.writeFileSync(progressPath, JSON.stringify(defaultData))
  return require(progressPath)
}

const findLongestWord = wordlist => {
  return wordlist.reduce((currentLength, word) => {
    if (word.length > currentLength) return word.length
    return currentLength
  }, 0)
}

const findMoney = async (badSeed, paths, gap, wordlist) => {
  const progress = getProgress()
  const longestWord = findLongestWord(wordlist)
  const seedArray = badSeed.split(" ")

  // single word replacement
  await getWrongWord(seedArray, -1, progress, 0, async (wordOneIndex, seedArray) => {
    await iterateWords(seedArray, wordlist, wordOneIndex, progress, 0, async (seedArray, updateIteration) => {
      await checkValidity(seedArray, paths, gap, longestWord, updateIteration)
    })
  })

  // double word replacement
  await getWrongWord(seedArray, -1, progress, 1, async (wordOneIndex, seedArray) => {
    await getWrongWord(seedArray, wordOneIndex, progress, 2, async (wordTwoIndex, seedArray) => {
      await iterateWords(seedArray, wordlist, wordOneIndex, progress, 1, async seedArray => {
        await iterateWords(seedArray, wordlist, wordTwoIndex, progress, 2, async (seedArray, updateIteration) => {
          await checkValidity(seedArray, paths, gap, longestWord, updateIteration)
        })
      })
    })
  })
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
