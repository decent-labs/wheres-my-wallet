const testSeed = "uno dos tres"
const testWords = ["one", "two", "three", "four", "five"]

const checkValidity = async seed => {
  const mnemonic = seed.join(" ")
  const data = { mnemonic }
  console.log(data)
}

const iterateWords = async (seedArray, wordlist, wordIndex, callback) => {
  for (let i = 0; i < wordlist.length; i++) {
    seedArray[wordIndex] = wordlist[i]
    await callback(seedArray)
  }
}

const getBadWord = async (seedArray, otherIndex, callback) => {
  for (let i = 0; i < seedArray.length; i++) {
    if (otherIndex >= i) continue;
    const badWord = seedArray[i]
    await callback(i, seedArray)
    seedArray[i] = badWord
  }
}

const findMoney = async (badSeed, wordlist) => {
  const seedArray = badSeed.split(" ")

  await getBadWord(seedArray, -1, async (wordOneIndex, seedArray) => {
    await iterateWords(seedArray, wordlist, wordOneIndex, async seedArray => {
      await checkValidity(seedArray)
    })
  })

  await getBadWord(seedArray, -1, async (wordOneIndex, seedArray) => {
    await getBadWord(seedArray, wordOneIndex, async (wordTwoIndex, seedArray) => {
      await iterateWords(seedArray, wordlist, wordOneIndex, async seedArray => {
        await iterateWords(seedArray, wordlist, wordTwoIndex, async seedArray => {
          await checkValidity(seedArray)
        })
      })
    })
  })
}

const go = async (badSeed, wordlist) => {
  await findMoney(badSeed, wordlist)
}

go(testSeed, testWords)
