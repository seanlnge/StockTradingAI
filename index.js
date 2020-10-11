// Imports
import { read, readFileSync } from 'fs';
import getData from './data.js';

const budget = 1000;
const retrieveData = true;
const symbols = ['F'];
let data = JSON.parse(readFileSync('data.json'));

// Main function
async function run(){

  // Retrieve Data
  if(symbols.reduce((a, c) => a || !data[c], false) || retrieveData){
    console.log('Retrieving Training Data...');
    await getData(symbols, 28, 14);
    data = JSON.parse(readFileSync('data.json'));
  }

  // Set Main Data Points
  let botData = {
    bblr: [0, 0], bstc: [0, 0], bzcm: [0, 0],
    bacd: [0, 0], bvrn: [0, 0], bsed: [0, 0],
    bvwp: [0, 0], sblr: [0, 0], sstc: [0, 0],
    szcm: [0, 0], sacd: [0, 0], svrn: [0, 0],
    ssed: [0, 0], svwp: [0, 0], money: 1000,
    shares: 0
  }

  let bestData = evolve(botData, 300, 5);
  botData = bestData.slice(-1)[0];
  let testing = await monteCarlo(deepCopy(botData));
  runBots([botData])

  console.log(botData);
  console.log('\nMoney: $' + botData.money.toFixed(2) + '    Predictability: ' + testing[0] + '% (Avg Daily Money: $' + testing[1].toFixed(2) + ')');
}

const random = () => Math.random()-0.5;

// Create a set amount of bots
function createBots(botData, botAmount){
  if(botAmount % 2) botAmount++;
  let bots = [];
  for(let i=0; i<botAmount; i++) bots.push(deepCopy(botData));
  return bots;
}

// Determine a buy or sell
function score(bot, symbol, minute){
  let buy = 0;
  let sell = 0;
  let stock = data[symbol][minute];

  // Buying score
  buy = bot.bblr[0] * stock.bbr + bot.bvwp[1];
  buy += bot.bstc[0] * stock.stc + bot.bstc[1];
  buy += bot.bzcm[0] * stock.zcm + bot.bzcm[1];
  buy += bot.bacd[0] * stock.acd + bot.bacd[1];
  buy += bot.bvrn[0] * stock.vrn + bot.bvrn[1];
  buy += bot.bsed[0] * stock.sed + bot.bsed[1];
  buy += bot.bvwp[0] * stock.vwp + bot.bvwp[1];

  // Selling score
  sell = bot.sblr[0] * stock.bbr + bot.sblr[1];
  sell += bot.sstc[0] * stock.stc + bot.sstc[1];
  sell += bot.szcm[0] * stock.zcm + bot.szcm[1];
  sell += bot.sacd[0] * stock.acd + bot.sacd[1];
  sell += bot.svrn[0] * stock.vrn + bot.svrn[1];
  sell += bot.ssed[0] * stock.sed + bot.ssed[1];
  sell += bot.svwp[0] * stock.vwp + bot.svwp[1];

  // Whether to buy or sell
  if(buy > 0 && bot.money >= stock.price){
    bot.shares += Math.floor(bot.money / stock.price);
    bot.money %= stock.price;
  } else if(sell > 0 && bot.shares > 0){
    bot.money += stock.price * bot.shares;
    bot.shares = 0;
  }

  return bot;
}


// Run bots on real data
function runBots(bots){

  // Loop over all bots
  for(let bot of bots){
    let symbol = symbols[Math.floor(Math.random()*symbols.length)];

    // Loop over minutes in day
    for(let minute in data[symbol]) bot = score(bot, symbol, minute);
    bot.money += bot.shares * data[symbol].slice(-1)[0].price;
    bot.shares = 0;
  }

  // Sort bots and return
  let returnVal = bots.sort((a, b) => a.money - b.money)
  return returnVal;
}


// Use Darwinian Evolution to Find Best Data to Use
function evolve(botData, generations, reruns){
  let bots = createBots(botData, 50);
  if(!reruns) reruns = 1;

  for(let run=0; run<reruns; run++){
    for(let generation=1; generation<=generations; generation++){

      let amt = run * generations + generation;
      if(amt % 50 == 0) console.log("Running Generation " + amt);

      bots = runBots(bots);
    
      // Take good bots and create next generation
      let goodBots = bots.slice(-bots.length/2);
      bots = goodBots.reduce((a, p) => {
    
        // Edit all values by decreasing random amount
        let newBot1 = deepCopy(p);
        let newBot2 = deepCopy(p);

        Object.keys(newBot1).forEach(val => {
          if(val !== 'money' && val !== 'shares'){
            newBot1[val][0] += random()/generation;
            newBot1[val][1] += random()/generation;
            newBot2[val][0] += random()/generation;
            newBot2[val][1] += random()/generation;
          }
        });
    
        // Set money and shares back to previous values
        newBot1.money = newBot2.money = budget;
        newBot1.shares = newBot2.shares = 0;
    
        a.push(newBot1, newBot2);
        return a;
      }, []);
    }
  }

  return bots;
}

function deepCopy(obj){ return JSON.parse(JSON.stringify(obj)); }

// Find Predictability
async function monteCarlo(bot){
  let orig = deepCopy(bot);

  console.log('Retrieving Testing Data...');
  data = await getData(symbols, 14, 1);
  console.log('Testing...');

  let averageMoney = 0;
  let overallPredictability = 0;

  for(let i=0; i<100; i++){
    let day = Math.floor(Math.random()*(data[symbols[0]].length-390));
    let symbol = symbols[Math.floor(Math.random()*symbols.length)];

    for(let j=day; j<day+390; j++){
      bot = score(bot, symbol, j);
    }
    bot.money += bot.shares * data[symbol].slice(-1)[0].price;
    bot.shares = 0;
    overallPredictability += bot.money > 1000 ? 1 : 0;
    averageMoney += bot.money;
    
    bot = deepCopy(orig);
  }
  averageMoney /= 100;

  console.log('Setting Data Back...');
  data = await getData(symbols, 21, 7);
  return [overallPredictability, averageMoney];
}

/* Reset
{
  {
    bblr: [0, 0], bstc: [0, 0], bzcm: [0, 0],
    bacd: [0, 0], bvrn: [0, 0], bsed: [0, 0],
    bvwp: [0, 0], sblr: [0, 0], sstc: [0, 0],
    szcm: [0, 0], sacd: [0, 0], svrn: [0, 0],
    ssed: [0, 0], svwp: [0, 0], money: 1000,
    shares: 0
  }
}
*/


run();
