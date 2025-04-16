const kpmgScraper = require("./kpmg/kpmgScraper"); // Import the config
const fs = require('fs');
// const { S3 } = require('@aws-sdk/client-s3');
const AWS = require('aws-sdk');
const { MongoClient, ServerApiVersion } = require('mongodb');
const _ = require('lodash');
// 初始化AWS服务
const s3 = new AWS.S3();

// 获取当前日期用于S3路径
const date = new Date();
const now = {
  year: date.getFullYear(),
  month:String(date.getMonth() + 1).padStart(2, '0'),
  day:String(date.getDate()).padStart(2, '0'),
}
const yesterdayDate = new Date(date);
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const yesterday  ={
  year: yesterdayDate.getFullYear(),
  month:String(yesterdayDate.getMonth() + 1).padStart(2, '0'),
  day:String(yesterdayDate.getDate()).padStart(2, '0'),
}

const uri = "mongodb+srv://difanw08:X8vEt2bz5V1xRnzN@difandb.qnzgrip.mongodb.net/?retryWrites=true&w=majority&appName=difanDB";
const dbName = "scraped_jobs";
const collectionName = "KPMG";


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// 连接缓存变量
let cachedDb = null;

// List of valid Australian cities
const validCities = [
  'Sydney',
  'Melbourne',
  'Brisbane',
  'Adelaide',
  'Hobart',
  'Perth',
  'Canberra'
];

async function connectToDatabase() {
  console.log("Start connecting to DB");
  if (cachedDb) {
    return cachedDb;
  }

  await client.connect();
  const database = client.db(dbName);

  return database;
}

async function checkUpdates(jobList){
    // check if there exists yesterday data
    const getParams = {
      Bucket: 'difan-job-scrape',
      Key: `raw_data/${yesterday.year}/${yesterday.month}/${yesterday.day}/KPMG.json`,  
    }
    try {
      const headCode = await s3.headObject(getParams).promise();
    } catch (headErr) {
      if (headErr.code === 'NotFound'){
        return jobList;
      }
    }
    const data = await s3.getObject(getParams)?.promise();
    const yesterdayData = json.parse(data?.Body.toString('utf-8'));

    //return comparison 
    const yesterdayUrls = yesterdayData.map(job => job.job_url);
    const todayUrls = jobList.map(job => job.job_url);
    const newUrls = _.difference(todayUrls,yesterdayUrls);
    const newJobs = jobList.filter(job => _.includes(newUrls, job.job_url));
    return newJobs;
}

async function saveMongoDB(newjobs) {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const db = await connectToDatabase();

    const collection = db.collection(collectionName);

    await collection.createIndex({ apply_url: 1 }, { unique: true });

    const jobsWithTimestamps = newjobs.map(job => ({
      ...job,
      updatedAt: new Date()
    }));

    if (Array.isArray(jobsWithTimestamps)) {
      // If JSON is an array, insert multiple documents
      console.log("Start saving");
      result = await collection.insertMany(jobsWithTimestamps);
    } else {
      // If JSON is an object, insert a single document
      result = await collection.insertOne(jobsWithTimestamps);
    }
    console.log(`Inserted ${result.insertedCount} documents into MongoDB`);
    return result;

  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

async function main() {
  try {
    scraper = new kpmgScraper();
    const jobList = await scraper.startScraping();
    if (!_.isEmpty(jobList)){
      const newJobs = await checkUpdates(jobList);
      const transformedJobs = await Promise.all(
        newJobs.map(item =>
          scraper.uniInterface(item)) 
      );
      const result = await saveMongoDB(transformedJobs);
      console.log(result);
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

main();