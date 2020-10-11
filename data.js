import { writeFileSync } from 'fs';
import fetch from 'node-fetch';

const average = (arr) => arr.reduce((a, p) => a+p) / arr.length;
const variance = (arr) => arr.reduce((a, p) => a + (p - average(arr)) ** 2) / arr.length;
const vwapCalc = (volume, close) => volume.reduce((a, p, i) => a + p * close[i]) / volume.reduce((a, p) => a + p);

function emAverage(arr){
  if(arr.length == 1) return arr[0];
  let prev = emAverage(arr.slice(-arr.length+1));
  let mult = 2/(arr.length+1);
  return arr[0] * mult + prev * (1-mult);
}

// Stochastic Oscillator
function stochasticOsc(close){
  let last14 = close.slice(-14);
  let min = last14.reduce((a, c) => Math.min(a, c));
  let max = last14.reduce((a, c) => Math.max(a, c));
  if(max - min == 0) return 0;
  return (close[close.length-1] - min) / (max - min);
}

// Find Momentum
function zylmanEquation(o, c, l, h){
  if(c-o == 0) return 0;
  let eq = ((c-l) - (h-c)) / Math.abs(c-o);
  if(eq > 1 || eq < -1) return 1/eq;
  return eq;
}

async function getData(symbol, start, end){
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
    currData.sed = currData.sma / currData.ema;
    currData.vrn = Math.sqrt(variance(lastDay));

    // Bands and Indicators
    currData.hbb = currData.sma + 2*currData.vrn;
    currData.lbb = currData.sma - 2*currData.vrn;
    currData.bbr = (currData.price - currData.lbb) / (currData.hbb - currData.lbb);
    currData.zcm = zylmanEquation(dayStocks.o[minute], dayStocks.c[minute], dayStocks.l[minute], dayStocks.h[minute]);
    
    // Advanced Data
    currData.acd = emAverage(lastDay.slice(-12)) - emAverage(lastDay.slice(-26));
    currData.stc = stochasticOsc(lastDay);
    currData.vwp = vwapCalc(dayStocks.v.slice(minute-390, minute), dayStocks.c.slice(minute-390, minute));
    currData.vol = dayStocks.v[minute];

    
    data.push(currData);
    minute++;
  }
  return data;
}

// Main Function to Get Data
async function getAllData(symbols, start, end){
  let allData = {};
  for(let sym of symbols){
    allData[sym] = await getData(sym, start, end);
  }
  writeFileSync('data.json', JSON.stringify(allData, null, 2));

  return allData;
}

export default getAllData;