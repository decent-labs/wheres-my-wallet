const fs = require("fs")

const testSeed = "uno dos tres cinco sies"
const testWords = ["one", "two", "three", "four", "five"]

const checkValidity = async (seed, updateIteration) => {
  const mnemonic = seed.join(" ")
  updateIteration()
  console.log(mnemonic)

  const delay = t => new Promise(resolve => setTimeout(() => resolve(), t))
  await delay(100)
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
    await callback(i, seedArray)
    seedArray[i] = badWord
  }

  currentProgress.seedIndex = 0
  progressFile(progress)
}

const progressFile = progress => {
  const progressPath = "./PROGRESS_TEST.json"
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

const findMoney = async (badSeed, wordlist) => {
  const progress = progressFile()
  const seedArray = badSeed.split(" ")

  // single word replacement
  await getWrongWord(seedArray, -1, progress, 0, async (wordOneIndex, seedArray) => {
    await iterateWords(seedArray, wordlist, wordOneIndex, progress, 0, async (seedArray, updateIteration) => {
      await checkValidity(seedArray, updateIteration)
    })
  })
  maxCounts(progress, 0, seedArray.length, wordlist.length)

  // double word replacement
  await getWrongWord(seedArray, -1, progress, 1, async (wordOneIndex, seedArray) => {
    await getWrongWord(seedArray, wordOneIndex, progress, 2, async (wordTwoIndex, seedArray) => {
      await iterateWords(seedArray, wordlist, wordOneIndex, progress, 1, async seedArray => {
        await iterateWords(seedArray, wordlist, wordTwoIndex, progress, 2, async (seedArray, updateIteration) => {
          await checkValidity(seedArray, updateIteration)
        })
      })
    })
  })
  maxCounts(progress, 1, seedArray.length, wordlist.length)
  maxCounts(progress, 2, seedArray.length, wordlist.length)
}

const go = async (badSeed, wordlist) => {
  await findMoney(badSeed, wordlist)
}

go(testSeed, testWords)
