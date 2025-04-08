const kpmgConfig = require("./kpmgConfig"); // Import the config
const fs = require('fs');
const AWS = require('aws-sdk');
const { MongoClient, ServerApiVersion } = require('mongodb');

// 初始化AWS服务
const s3 = new AWS.S3();

// 获取当前日期用于S3路径
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');

const uri = "mongodb+srv://difanw08:X8vEt2bz5V1xRnzN@difandb.qnzgrip.mongodb.net/?retryWrites=true&w=majority&appName=difanDB";
const dbName = "scraped_jobs";
const collectionName = "kpmg";

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

async function connectToDatabase() {
  console.log("Start connecting to DB");
  if (cachedDb) {
    return cachedDb;
  }

  await client.connect();
  const database = client.db(dbName);

  return database;
}

async function maxJobSize() {
  try {
    const searchResult = await fetch(kpmgConfig.request.url(), {
      body: kpmgConfig.request.init.body,
      method: kpmgConfig.request.init.method
    });
    const data = await searchResult.json();
    console.log("Max size is", data['no of jobs'])

    return data['no of jobs'];
  }catch (error) {
    console.error("Test failed:", error);
  }
}


async function jobInfo(maxSize) {  
  try {
    const searchResult = await fetch(kpmgConfig.request.url(maxSize), {
      body: kpmgConfig.request.init.body,
      method: kpmgConfig.request.init.method
    });

    if (!searchResult.ok) {
      throw new Error(`HTTP error! status: ${searchResult.status}`);
    }
    const jobPosts = await searchResult.json();
    console.log(`Found ${jobPosts.data.length} jobs`);
    return jobPosts.data;
  } catch (error) {
    console.error("Failed to fetch job info:", error);
    throw error;
  }
}

async function uniInterface(job) {
  return {
    job_title: job.job_title,
    company: job.company,
    location : {
      country:job.job_location_country,
      city:job.job_location_city,
      display:job.job_location_display
    },
    job_level: job.job_level,
    job_type: job.job_type,
    salary: job.salary ?? undefined,
    job_description: job.job_description,
    apply_url: job.job_url,
    published_at: job.published_date ?? undefined,
    due_at: job.due_date ?? undefined,
    scraped_at: new Date()
  };
}


async function saveS3(jobPosts) {
  console.log(jobPosts.length);
  if (jobPosts.length > 0) {
    // const transformedJobs = await Promise.all(
    //   jobPosts.map(item =>
    //      uniInterface(item)) 
    // );
    // console.log(transformedJobs)

    // const params = {
    //   Bucket: 'difan-job-scrape',
    //   Key: `data/${year}/${month}/${day}/file.json`, // Partitioned path
    //   Body: JSON.stringify(transformedJobs, null, 2),
    //   ContentType: 'application/json'
    // };

    // s3.upload(params, function(err, data) {
    //   if (err) console.error(err);
    //   else console.log('Upload success:', data.Location);
    // });
    fs.writeFile(
      'jobPosts.json',
      JSON.stringify(jobPosts, null, 2),
      { encoding: 'utf-8' },
      (err) => {
        if (err) {
          console.error('Failed to save to local:', err);
          return;
        }
        console.log('Successfully saved to local.');
      }
    )
  }
}

async function saveMongoDB(searchJobs) {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const db = await connectToDatabase();

    // Create references to the database and collection in order to run
    // operations on them.
    const collection = db.collection(collectionName);

    const transformedJobs = await Promise.all(
      searchJobs.map(item =>
         uniInterface(item)) 
    );

    // 添加插入时间戳
    const jobsWithTimestamps = transformedJobs.map(job => ({
      ...job,
      updatedAt: new Date()
    }));

    await collection.createIndex({ apply_url: 1 }, { unique: true });

    // Insert the JSON data
    let result;
    if (Array.isArray(jobsWithTimestamps)) {
      // If JSON is an array, insert multiple documents
      try {

        result = await collection.insertMany(jobsWithTimestamps,{ ordered: false });
      }catch (err) {
        if (err.code === 11000) {
          console.log("Some duplicates were skipped.");
        }
      }
    } else {
      // If JSON is an object, insert a single document
      result = await collection.insertOne(jobsWithTimestamps, { ordered: false });
    }
    console.log("Successfully saved to MongoDb");

  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

async function main() {
  try {
    const searchJobs = await jobInfo(3); // 确保用 await
    // console.log(searchJobs.length);
    saveS3(searchJobs); 
    saveMongoDB(searchJobs);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();