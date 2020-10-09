const fs = require('fs');
const fetch = require('node-fetch');

/********************************/
/*    Retrieving Stock Data     */
/********************************/

const average = (arr) => arr.reduce((a, p) => a+p) / arr.length;
const random = () => Math.random()-0.5;
const variance = (arr) => arr.reduce((a, p) => a + (p - average(arr)) ** 2) / arr.length;
const vwapCalc = (data) => data.v.reduce((a, p, i) => a + p * data.c[i]) / data.v.reduce((a, p) => a + p);

function emAverage(arr){
  if(arr.length == 1) return arr[0];
  let prev = emAverage(arr.slice(-arr.length+1));
  let mult = 2/(arr.length+1);
  return arr[0] * mult + prev * (1-mult);
}

// ADX
function adxCalc(highs, lows){
  if(highs.length == 1) return highs[0];

  let pdi = Math.max(0, highs.slice(-2)[1] - highs.slice(-2)[0]);
  let ndi = Math.max(0, lows.slice(-2)[0] - lows.slice(-2)[1]);
  let dx = 100 * (pdi - ndi) / (pdi + ndi);
  let adxn = adxCalc(highs.slice(-lows.length+1), lows.slice(-lows.length+1)) * (highs.length-1) + dx
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
  let past = Math.floor(Date.now()/1000 - (start+1) * 1440 * 60);
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




/********************************/
/*   Evolutionary Procedures    */
/********************************/

function createBots(botAmount){
  if(botAmount % 2) botAmount++;
  let bots = [];

  let botData = {
    // Basics
    money: budget, shares: 0,

    // Buying Data
    bblr: bblr, bstc: bstc, 
    bzcm: bzcm, bacd: bacd,
    
    // Selling Data
    sblr: sblr, sstc: sstc,
    szcm: szcm, sacd: sacd,
    
    // Manipulating Data
    samt: samt,
    bamt: bamt
  }

  for(let i=0; i<botAmount; i++){ bots.push(botData) }

  return bots;
}

// Determine a buy or sell
function getScore(values, symbol, minute){
  let buy = sell = extra = 0;
  let stock = data[symbol][minute];

  // Buying score
  buy = values.bblr * stock.bbr;
  buy += values.bstc * stock.stc;
  buy += values.bzcm * stock.zcm;
  buy += values.bacd * stock.acd;

  // Selling score
  sell = values.sblr * stock.bbr;
  sell += values.sstc * stock.stc;
  sell += values.szcm * stock.zcm;
  sell += values.sacd * stock.acd;

  // Whether to buy or sell
  if(buy > values.bamt && values.money > stock.price){
    values.shares += Math.floor(values.money/stock.price);
    values.money %= stock.price;
  } else if(sell > values.samt){
    values.money += values.shares * stock.price;
    values.shares = 0;
  }
}


// Run bots on real data
function runBots(bots){

  // Loop over all symbols and bots
  for(let h=0; h<bots.length; h++){
    let thisSymbol = symbols[Math.floor(Math.random()*symbols.length)]

    // Loop over minutes in day
    for(let i=0; i<data[thisSymbol].length-390; i++){
      getScore(bots[h], thisSymbol, i);
    }

    // Sells all data to have most money
    bots[h].money += bots[h].shares * data[thisSymbol][data[thisSymbol].length-1].price;
    bots[h].money = parseFloat(bots[h].money.toFixed(2));
    bots[h].shares = 0;
  }

  // Sort bots and return
  let returnVal = bots.sort((a, b) => a.money - b.money)
  return returnVal;
}

// Using darwinian evolution to improve bots
function darwinianEvolution(bots, generation){

  // Loop over each bot and find money
  bots = runBots(bots);

  // Take good bots and create next generation
  let goodBots = bots.slice(-bots.length/2);
  let nextGen = goodBots.reduce((a, p) => {

    // Edit all values by decreasing random amount
    let newBot1 = newBot2 = JSON.parse(JSON.stringify(p));
    let allBotValues = Object.keys(newBot1);
    allBotValues.forEach(val => {
      newBot1[val] += random()/generation;
      newBot2[val] += random()/generation;
    });

    // Set money and shares back to previous values
    newBot1.money = newBot2.money = budget;
    newBot1.shares = newBot2.shares = 0;

    a.push(newBot1, newBot2);
    return a;
  }, []);

  return nextGen;
}

// Find all generations
function evolve(generations, reruns){
  let bots = createBots(50);
  if(!reruns) reruns = 1;

  for(let h=0; h<reruns; h++){
    for(let i=1; i<=generations; i++){
      let amt = h*generations + i;
      console.log("Running Generation " + amt);
      bots = darwinianEvolution(bots, i);
    }
  }

  return bots;
}




/*********************************/
/*    User-Generated Actions     */
/*********************************/

const action = 'testing';
let budget = 333;
let symbols = ['BBBY'];

// Days in past to get data
let start = 1, end = 0;

// Bot data
let {bblr, bstc, bzcm, bacd, sblr, sstc, szcm, sacd, samt, bamt} = {
  bblr: 0.5,
  bstc: 0.5,
  bzcm: 0.5,
  bacd: 0.5,
  sblr: 0.5,
  sstc: 0.5,
  szcm: 0.5,
  sacd: 0.5,
  samt: 2,
  bamt: 2
}
let data;

async function runAction(action){
  switch(action){
    case 'data': {
      await getAllData();
      break;
    }
    case 'evolving': {
      data = JSON.parse(fs.readFileSync('data.json'));
      let goodBots = evolve(300, 10).slice(-100);
      console.log(runBots(goodBots));
      break;
    }
    case 'testing': {
      data = JSON.parse(fs.readFileSync('data.json'));
      let bestBots = runBots(createBots(1)).slice(-100);
      console.log(bestBots);
      break;
    }
    default: { console.log('bro pick an actual action'); }
  }
}
runAction(action);