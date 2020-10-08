const fs = require('fs');
const fetch = require('node-fetch');

// General Functions
function average(arr){
  return arr.reduce((a, p) => a+p) / arr.length;
}
function emAverage(arr){
  if(arr.length == 1) return arr[0];
  let prev = emAverage(arr.slice(-arr.length+1));
  return (arr[0] - prev) / 2*(arr.length+1) + prev;
}
function variance(arr){
  let avg = average(arr);
  let pure = arr.reduce((a, p) => a + (p - avg) ** 2);
  return pure / arr.length;
}

// VWAP
function vwapCalc(data){
  let volPrice = data.v.reduce((a, p, i) => a + p * data.c[i]);
  let allVol = data.v.reduce((a, p) => a + p);
  return volPrice / allVol;
}

// ADX
function adxCalc(highs, lows){
  if(highs.length == 1) return highs[0];

  let pdi = Math.max(0, highs.slice(-2)[1] - highs.slice(-2)[0]);
  let ndi = Math.max(0, lows.slice(-2)[1] - lows.slice(-2)[0]);
  let dx = 100 * (pdi - ndi) / (pdi + ndi);
  let adxn = adxCalc(highs.slice(1), lows.slice(1)) * (highs.length-1) + dx
  return adxn / highs.length;
}

// Stochastic Oscillator
function stochasticOsc(data){
  let last14 = data.c.slice(-14);
  let min = last14.reduce((a, c) => Math.min(a, c));
  let max = last14.reduce((a, c) => Math.max(a, c));
  if(max - min == 0) return 0;
  return (data.c[data.c.length-1] - min) / (max - min);
}

// Find Momentum
function zylmanEquation(o, c, l, h){
  if(c-o == 0) return 0;
  let eq = ((c-l) - (h-c)) / Math.abs(c-o);

  if(eq > 1 || eq < -1) return 1/eq;
  return eq;
}

async function getData(symbol){
  let data = [];

  // 1 Day In the Past
  let past = Math.floor(Date.now()/1000 - start * 1440 * 60);
  let now = Math.floor(Date.now()/1000 - end * 1440*60);

  // Fetch Data from API
  let dayStocks, dayPrices;
  let url = "https://finnhub.io/api/v1/stock/candle?symbol=" + symbol + "&resolution=1&from=" + past + "&to=" + now + "&token=btu9sk748v6vqmm3erqg";
  await fetch(url).then(res => res.json()).then(data => {
    dayStocks = data;
    dayPrices = data.c;
  });

  let minute = 390;

  // Loop over data and create more structured info
  while(minute < dayPrices.length){
    let lastDay = dayPrices.slice(minute - 390, minute);
    let currData = {};

    // Basic Data
    currData.price = dayPrices[minute];
    currData.sma = average(lastDay);
    currData.ema = emAverage(lastDay.slice(-50));
    currData.vrn = variance(lastDay);

    // Bands and Indicators
    currData.hbb = currData.sma + 2*currData.vrn;
    currData.lbb = currData.sma - 2*currData.vrn;
    currData.bbr = (currData.price - currData.lbb) / (currData.price - currData.hbb);
    currData.zcm = zylmanEquation(dayStocks.o[minute], dayStocks.c[minute], dayStocks.l[minute], dayStocks.h[minute]);
    
    // Advanced Data
    currData.acd = emAverage(lastDay.slice(-12)) - emAverage(lastDay.slice(-26));
    currData.adx = adxCalc(dayStocks.h.slice(-50), dayStocks.l.slice(-50));
    currData.stc = stochasticOsc(dayStocks);
    currData.vwp = vwapCalc(dayStocks);
    currData.vol = dayStocks.v[minute];

    data.push(currData);
    minute++;
  }
  return data;
}

// Main Function to Get Data
async function getAllData(){
  let allData = {};
  for(let sym of symbols){
    allData[sym] = await getData(sym);
  }
  fs.writeFileSync('data.json', JSON.stringify(allData, null, 2));
}

let data = JSON.parse(fs.readFileSync('data.json'));

// Create Some Bots
function createBots(botAmount){
  let bots = [];
  let botData = {

    // Buying Data
    bblr: bblr, bstc: bstc, 
    bzcm: bzcm, bacd: bacd,
    badx: badx,
    
    // Selling Data
    sblr: sblr, sstc: sstc,
    szcm: szcm, sacd: sacd,
    sadx: sadx,
    
    // Manipulating Data
    samt: samt,
    bamt: bamt
  }

  if(botAmount % 2) botAmount++; // Make sure its even

  // Randomize Data
  for(let i=0; i<botAmount; i++){
    let bot = {}
    bot.money = budget;
    bot.shares = 0;
    for(let piece of [...Object.keys(botData)]){
      bot[piece] = botData[piece] + (action === 'evolving' ? Math.random() : 0);
    }
    bots.push(bot);
  }

  return bots;
}

// Determine a buy or sell
function getScore(values, symbol, minute){
  let buy = sell = 0;
  let minData = data[symbol][minute];
  if(minData === undefined) return;

  // Buying Score
  buy = values.bblr * (1 - (minData.price - minData.lbb) / (minData.hbb - minData.lbb))
  buy += values.bstc * (1-minData.stc)
  buy += values.bzcm * minData.zcm
  buy += values.bacd * minData.acd
  buy += values.badx * minData.adx

  // Selling Score
  sell = values.bblr * (minData.price - minData.lbb) / (minData.hbb - minData.lbb)
  sell += values.bstc * (minData.stc > 0.80 ? minData.stc : 0)
  sell += values.bzcm * (minData.zcm <= -0.6 ? -minData.zcm : 0)
  sell += values.sacd * minData.acd
  sell += values.sadx * minData.adx;

  if(buy > values.bamt && values.money > minData.price){
    values.shares += Math.floor(values.money/minData.price);
    values.money %= minData.price;
  } else if(sell > values.samt){
    values.money += values.shares * minData.price;
    values.shares = 0;
  }
}

// Get random value from -0.5 to 0.5
function getRandom(){ return Math.random()-0.5; }

// Run bots on real data
function runBots(bots){

  // Loop over all symbols and bots
  for(let h=0; h<bots.length; h++){
    let thisSymbol = symbols[Math.floor(Math.random()*symbols.length)]

    // Loop over minutes in day
    for(let i=0; i<thisSymbol.length; i++){
      getScore(bots[h], thisSymbol, i);
    }

    // Sells
    bots[h].money += bots[h].shares * data[thisSymbol][data[thisSymbol].length-1].price;
    bots[h].money = parseFloat(bots[h].money.toFixed(2));
    bots[h].shares = 0;
  }

  let returnVal = bots.sort((a, b) => a.money - b.money)
  return returnVal;
}

// Using darwinian evolution to improve bots
function darwinianEvolution(bots, generation){
  generation++;

  // Loop over each bot and find money
  bots = runBots(bots);

  // Take good bots and create next generation
  let botHalf = bots.length % 2 == 0 ? bots.length/2 : bots.length/2+1;
  let goodBots = bots.slice(-botHalf);
  let nextGen = goodBots.reduce((a, p) => {

    // Deep copy bots
    let newBot1 = JSON.parse(JSON.stringify(p));
    let newBot2 = JSON.parse(JSON.stringify(p));
    newBot1.money = newBot2.money = budget;

    // Change ratios on random value
    newBot1.samt += getRandom()/generation*2;
    newBot1.samt += getRandom()/generation*2;
    newBot2.bamt += getRandom()/generation*2;
    newBot2.bamt += getRandom()/generation*2;

    // Buying
    newBot1.bblr += getRandom()/generation*2;
    newBot2.bblr += getRandom()/generation*2;
    newBot1.bstc += getRandom()/generation*2;
    newBot2.bstc += getRandom()/generation*2;
    newBot1.bzcm += getRandom()/generation*2;
    newBot2.bzcm += getRandom()/generation*2;
    newBot1.bacd += getRandom()/generation*2;
    newBot2.bacd += getRandom()/generation*2;
    newBot1.badx += getRandom()/generation*2;
    newBot2.badx += getRandom()/generation*2;

    // Selling
    newBot1.sblr += getRandom()/generation*2;
    newBot2.sblr += getRandom()/generation*2;
    newBot1.sstc += getRandom()/generation*2;
    newBot2.sstc += getRandom()/generation*2;
    newBot1.szcm += getRandom()/generation*2;
    newBot2.szcm += getRandom()/generation*2;
    newBot1.sacd += getRandom()/generation*2;
    newBot2.sacd += getRandom()/generation*2;
    newBot1.sadx += getRandom()/generation*2;
    newBot2.sadx += getRandom()/generation*2;

    a.push(newBot1, newBot2);
    return a;
  }, []);

  return nextGen;
}

// Find all generations
function evolveAll(refreshes, generations){
  let bots = createBots(250);
  let gen = 0;
  for(let h=1; h<=refreshes; h++){
    for(let i=1; i<=generations; i++){
      console.log("Running Generation " + gen);
      bots = darwinianEvolution(bots, i);
      gen++;
    }
  }
  return bots;
}

// VERY NEEDED, EITHER: data, evolving, or testing
const action = 'testing';

// Data
let start = 3;
let end = 2;

// Testing or Evolving
let bblr = -1.3884074455280835;
let bstc = -0.8685825268060355;
let bzcm = -1.5110513763088644;
let bacd = 2.8475196483991856;
let badx = 1.6571160815123984;
let sblr = -0.23021055202207888;
let sstc = 3.6422788726535646;
let szcm = -2.3782731196863915;
let sacd = -0.6322569546098057;
let sadx = -0.041657011822320504;
let samt = 1.0829623643782007;
let bamt = 5.729570558936449;

let budget = 1000;

let symbols = ['ETSY', 'AAPL', 'NVDA', 'GE', 'F', 'BBBY', 'M', 'BAC', 'BA'];

if(action === 'data') getAllData();
if(action === 'evolving') console.log(runBots(evolveAll(20, 300)).slice(-100));
if(action === 'testing') console.log(runBots(createBots(250)).slice(-100));