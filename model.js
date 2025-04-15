const kpmgScraper = require("./kpmg/kpmgScraper"); // Import the config
const fs = require('fs');
const AWS = require('aws-sdk');
const { MongoClient, ServerApiVersion } = require('mongodb');
const _ = require('lodash');
const googleScraper = require("./google/googleScraper");
// 初始化AWS服务
// const s3 = new AWS.S3();

// 获取当前日期用于S3路径
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');

const uri = "mongodb+srv://difanw08:X8vEt2bz5V1xRnzN@difandb.qnzgrip.mongodb.net/?retryWrites=true&w=majority&appName=difanDB";
const dbName = "scraped_jobs";
const collectionName = "google";


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
  'Perth'
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

// Check if the city is a valid Australian city
const isValidCity = (city) =>
  validCities.includes(city);

const isValidString = (str) =>
  typeof str === 'string' && str.length > 0;

// Utility functions
const stripHtml = (html) =>
  typeof html === 'string' ? html.replace(/<[^>]*>?/gm, '').trim() : '';

const transformJob = (job) => {
  if (
    !isValidString(job.job_title) ||
    !isValidString(job.company) ||
    !isValidString(job.city) ||
    // !isValidString(stripHtml(job.job_description)) ||
    !isValidCity(job.city) 
  ) {
    return null;
  }
  return job;
}


async function updateJobs(collection, newJobs) {
  // const newApplyLinks = new Set(newJobs.map(job => job.apply_url));
  for (const job of newJobs) {
      const applyLink = job.apply_url;
      console.log(applyLink);

      const existingJob = await collection.findOne({ apply_url: applyLink});

      if (existingJob) {
          const changes = {};
          for (const key of Object.keys(job)) {
            if (key === 'scraped_at') continue;
              if (existingJob[key] !== job[key]) {
                  console.log(existingJob[key]);
                  console.log(job[key]);

                  changes[key] = job[key];
              }
          }

          if (Object.keys(changes).length > 0) {
              await collection.updateOne(
                  { apply_url: applyLink},
                  { $set: changes }
              );
              console.log(`Successfully update${job.job_title} in ${job.company}: ${Object.keys(changes).join(', ')}`);
          } 
      } else {
          await collection.insertOne(job);
      }
  }
}

async function deleteExpiredJobs(collection, newJobs) {
  const companyName = newJobs[0].company;
  const newApplyLinks = new Set(newJobs.map(job => job.apply_url));

  const existingJobs = await collection.find({ company:  companyName}).toArray();
  const existingApplyLinks = new Set(existingJobs.map(job => job.apply_url));

  const expiredApplyLinks = Array.from(existingApplyLinks).filter(link => !newApplyLinks.has(link));

  for (const applyLink of expiredApplyLinks) {
      const result = await collection.deleteOne({ apply_url: applyLink });
  }
  console.log(`${expiredApplyLinks.length} expired Jobs have been deleted`);
}

async function saveMongoDB(jobs) {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const db = await connectToDatabase();

    const collection = db.collection(collectionName);

    await collection.createIndex({ apply_url: 1 }, { unique: true });

    await updateJobs(collection, jobs);
    await deleteExpiredJobs(collection, jobs);

  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

async function main() {
  try {
    scraper = new googleScraper();
    const searchJobs = await scraper.startScraping();
    // const searchJobs = await scraper.startScraping(); 
    const cleanedJobs = searchJobs.map(transformJob).filter((job) => job !== null);
    saveMongoDB(cleanedJobs);

  } catch (error) {
    console.error("Error:", error);
  }
}

main();