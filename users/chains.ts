import { queryFlipside } from "../helpers/flipsidecrypto";
import axios from 'axios';
import { queryAllium } from "../helpers/allium";

function getUsersChain(chain: string) {
    return async (start: number, end: number) => {
        const query = await queryFlipside(`select count(DISTINCT FROM_ADDRESS), count(tx_hash) from ${chain}.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
        return {
            all: {
                users: query[0][0],
                txs: query[0][1]
            }
        }
    }
}

async function solanaUsers(start: number, end: number) {
    const query = await queryAllium(`select count(DISTINCT signer) as uniqueusers, count(txn_id) as txsnum from solana.raw.transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return {
        all: {
            users: query[0].uniqueusers,
            txs: query[0].txsnum
        }
    }
}

async function osmosis(start: number, end: number) {
    const query = await queryFlipside(`select count(DISTINCT TX_FROM), count(tx_id) from osmosis.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return {
        all: {
            users: query[0][0],
            txs: query[0][1]
        }
    }
}

async function near(start: number, end: number) {
    const query = await queryFlipside(`select count(DISTINCT TX_SIGNER), count(tx_hash) from near.core.fact_transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return {
        all: {
            users: query[0][0],
            txs: query[0][1]
        }
    }
}

const timeDif = (d:string, t:number) => Math.abs(new Date(d).getTime() - new Date(t*1e3).getTime())
function findClosestItem(results:any[], timestamp:number, getTimestamp:(x:any)=>string){
    return results.reduce((acc:any, t:any)=>{
        if(timeDif(getTimestamp(t), timestamp) < timeDif(getTimestamp(acc), timestamp)){
            return t
        } else {
            return acc
        }
    }, results[0])
}


const toIso = (d:number) => new Date(d*1e3).toISOString()
function coinmetricsData(assetID: string) {
    return async (start: number, end: number) => {
        const result = (await axios.get(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?page_size=10000&metrics=AdrActCnt&assets=${assetID}&start_time=${toIso(start - 24*3600)}&end_time=${toIso(end + 24*3600)}`)).data.data;
        const closestDatapoint = findClosestItem(result, start, t=>t.time)
        if (!closestDatapoint) {
            throw new Error(`Failed to fetch CoinMetrics data for ${assetID} on ${end}, no data`);
        }

        return parseFloat(closestDatapoint['AdrActCnt']);
    }
}

/*
// https://tronscan.org/#/data/stats2/accounts/activeAccounts
async function tronscan(start: number, _end: number) {
    const results = (await axios.get(`https://apilist.tronscanapi.com/api/account/active_statistic?type=day&start_timestamp=${(start - 2*24*3600)*1e3}`)).data.data;
    return findClosestItem(results, start, t=>t.day_time).active_count
}
*/

// not used because coinmetrics does some deduplication between users
async function bitcoinUsers(start: number, end: number) {
    const query = await queryAllium(`select count(DISTINCT SPENT_UTXO_ID) as usercount from bitcoin.raw.inputs where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
    return query[0].usercount
}

function getAlliumUsersChain(chain: string) {
    return async (start: number, end: number) => {
        const query = await queryAllium(`select count(DISTINCT from_address) as usercount, count(hash) as txcount from ${chain}.raw.transactions where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
        return {
            all: {
                users: query[0].usercount,
                txs: query[0].txcount
            }
        }
    }
}

function getAlliumNewUsersChain(chain: string) {
    return async (start: number, end: number) => {
        const query = await queryAllium(`select count(DISTINCT from_address) as usercount from ${chain}.raw.transactions where nonce = 0 and BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${start}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${end})`)
        return query[0].usercount
    }
}

export default [
    ...([
        "bsc", "gnosis"
        // "terra2", "flow"
    ].map(c => ({ name: c, getUsers: getUsersChain(c) }))),
    {
        name: "solana",
        getUsers: solanaUsers
    },
    {
        name: "osmosis",
        getUsers: osmosis
    },
    {
        name: "near",
        getUsers: near
    },
    // https://coverage.coinmetrics.io/asset-metrics/AdrActCnt
    {
        name: "bitcoin",
        getUsers: coinmetricsData("btc")
    },
    {
        name: "litecoin",
        getUsers: coinmetricsData("ltc")
    },
    {
        name: "cardano",
        getUsers: coinmetricsData("ada")
    },
    {
        name: "algorand",
        getUsers: coinmetricsData("algo")
    },
    {
        name: "bch",
        getUsers: coinmetricsData("bch")
    },
    {
        name: "bsv",
        getUsers: coinmetricsData("bsv")
    },
].map(chain=>({
    name: chain.name,
    id: `chain#${chain.name}`,
    getUsers: (start:number, end:number)=>chain.getUsers(start, end).then(u=>typeof u === "object"?u:({all:{users:u}})),
})).concat([
    "arbitrum", "avalanche", "ethereum", "optimism", "polygon", "tron"
].map(c => ({ name: c, id: `chain#${c}`, getUsers: getAlliumUsersChain(c), getNewUsers: getAlliumNewUsersChain(c) })))
