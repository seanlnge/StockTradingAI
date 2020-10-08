const fs = require('fs');
const fetch = require('node-fetch');

let symbols = ['ETSY'];

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
  let past = Math.floor(Date.now()/1000 - 13 * 1440 * 60);
  let now = Math.floor(Date.now()/1000 - 6 * 1440*60);

  // Fetch Data from API
  let stockData1, stockPrices1;
  let url = "https://finnhub.io/api/v1/stock/candle?symbol=" + symbol + "&resolution=1&from=" + past + "&to=" + now + "&token=btu9sk748v6vqmm3erqg";
  await fetch(url).then(res => res.json()).then(data => {
    stockData1 = data;
    stockPrices1 = data.c;
  });

  let minute = 390;

  while(minute < stockPrices1.length){
    let lastDay = stockPrices1.slice(minute - 390, minute);
    let currMinuteData = {};
    currMinuteData.price = stockPrices1[minute];
    currMinuteData.sma = average(lastDay);
    currMinuteData.ema = emAverage(lastDay.slice(-20));
    currMinuteData.vrn = variance(lastDay);
    currMinuteData.stc = stochasticOsc(stockData1);
    currMinuteData.vwp = vwapCalc(stockData1);
    currMinuteData.vol = stockData1.v[minute];
    currMinuteData.hbb = currMinuteData.sma + 2*currMinuteData.vrn;
    currMinuteData.lbb = currMinuteData.sma - 2*currMinuteData.vrn;
    currMinuteData.zcm = zylmanEquation(stockData1.o[minute], stockData1.c[minute], stockData1.l[minute], stockData1.h[minute]);
    data.push(currMinuteData);
    minute++;
  }
  return data;
  
}
async function getAllData(){
  let allData = {};
  for(let sym of symbols){
    allData[sym] = await getData(sym);
  }
  fs.writeFileSync('data.json', JSON.stringify(allData, null, 2));
}

let data = JSON.parse(fs.readFileSync('data.json'));

let bots = [];
let botData = {
  //bollingerRatio: 7.296309571915129,
  //stochasticOsc: 3.091956809271737,
  //zylmanCandlestick: -0.34585406940540075
  bollingerRatio: 5.084389530128404,
  stochasticOsc: 0.7216417996413134,
  zylmanCandlestick: -0.9321962431100155
  //bollingerRatio: 3.1489486734449765,
  //stochasticOsc: 0.6786321750838469,
  //zylmanCandlestick: -1.2118257793611413
}
let botAmount = 50;
if(botAmount % 2) botAmount++;

for(let i=0; i<botAmount; i++){
  let bot = {}
  bot.money = 1000;
  bot.shares = 0;
  for(let piece of [...Object.keys(botData)]){
    bot[piece] = botData[piece] + (action === 'evolving' ? Math.random() : 0);
  }
  bots.push(bot);
}

// Determine a buy or sell
function getScore(values, symbol, minute){
  let buy = sell = 0;
  let minData = data[symbol][minute];

  //buy += values.bollingerRatio * (1 - (minData.price - minData.lbb) / (minData.hbb - minData.lbb));
  //buy += values.stochasticOsc * (minData.stc < 0.20 ? 1-minData.stc : 0);
  //buy += values.zylmanCandlestick * (minData.zcm >= 0.6 ? minData.zcm : 0);
  buy += values.bollingerRatio * (1 - (minData.price - minData.lbb) / (minData.hbb - minData.lbb));
  buy += values.stochasticOsc * (1-minData.stc);
  buy += values.zylmanCandlestick * minData.zcm;

  sell += values.zylmanCandlestick * (minData.zcm <= -0.6 ? -minData.zcm : 0);
  sell += values.stochasticOsc * (minData.stc > 0.80 ? minData.stc : 0);
  sell += values.bollingerRatio * (minData.price - minData.lbb) / (minData.hbb - minData.lbb)

  if(buy > 2){
    values.shares += Math.floor(values.money/minData.price);
    values.money %= minData.price;
  } else if(sell > 2){
    values.money += values.shares * minData.price;
    values.shares = 0;
  }
}

// Get random value from -0.5 to 0.5
function getRandom(){
  return Math.random()-0.5;
}

// Run bots on real data
function runBots(bots){

  // Loop over all symbols and bots
  for(let h=0; h<bots.length; h++){
    let thisSymbol = symbols[Math.floor(Math.random()*symbols.length)]

    // Loop over minutes in day
    for(let i=0; i<data[symbols[0]].length; i++){
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
  let goodBots = bots.slice(-botAmount/2);
  let nextGen = goodBots.reduce((a, p) => {

    // Deep copy bots
    let newBot1 = JSON.parse(JSON.stringify(p));
    let newBot2 = JSON.parse(JSON.stringify(p));
    newBot1.money = newBot2.money = 1000;

    // Change ratios on random value
    newBot1.bollingerRatio += getRandom()/generation*2;
    newBot2.bollingerRatio += getRandom()/generation*2;
    newBot1.stochasticOsc += getRandom()/generation*2;
    newBot2.stochasticOsc += getRandom()/generation*2;
    newBot1.zylmanCandlestick += getRandom()/generation*2;
    newBot2.zylmanCandlestick += getRandom()/generation*2;

    a.push(newBot1, newBot2);
    return a;
  }, []);

  return nextGen;
}

// Find all generations
function evolveAll(refreshes, generations){
  let gen = 0;
  for(let h=1; h<=refreshes; h++){
    for(let i=1; i<=generations; i++){
      console.log("Running Generation " + gen);
      bots = darwinianEvolution(bots, i);
      gen++;
    }
  }
  console.log(runBots(bots));
}

// VERY NEEDED, EITHER: data, evolving, or testing
const action = 'testing';

if(action === 'data') getAllData();
if(action === 'evolving') evolveAll(30, 100);
if(action === 'testing') console.log(runBots(bots));