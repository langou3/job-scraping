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

const uri = process.env.MONGODB_URI;
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
    console.error("Failed to get max job size:", error);
    throw error;
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
    job_description: job.job_description,
    apply_url: job.job_url,
    scraped_at: new Date()
  };
}


async function saveS3(jobPosts) {
  if (!jobPosts || jobPosts.length === 0) {
    console.log("No jobs to save to S3");
    return;
  }
  
  try{
    const transformedJobs = await Promise.all(
      jobPosts.map(item =>
          uniInterface(item)) 
    );

    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: `data/${year}/${month}/${day}/file.json`, // Partitioned path
      Body: JSON.stringify(transformedJobs, null, 2),
      ContentType: 'application/json'
    };

    // // For AWS SDK v2
    // s3.upload(params, function(err, data) {
    //   if (err) console.error(err);
    //   else console.log('Upload success:', data.Location);
    // })
    const uploadResult = await s3.upload(params).promise();
    console.log('Successfully uploaded to S3:', uploadResult.Location);
    return uploadResult;
  }catch (error) {
    console.error("Failed to save to S3:", error);
    throw error;
  }
}

async function saveMongoDB(jobPosts) {
  if (!jobPosts || jobPosts.length === 0) {
    console.log("No jobs to save to MongoDB");
    return;
  }
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const db = await connectToDatabase();

    const collection = db.collection("kpmg");

    const transformedJobs = await Promise.all(
      jobPosts.map(item =>
         uniInterface(item)) 
    );
    
    // 添加插入时间戳
    const jobsWithTimestamps = transformedJobs.map(job => ({
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

exports.handler = async (event, context) => {
  // 设置Lambda函数完成时不等待空事件循环
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    console.log("Starting job scraping process...");
    
    // 获取工作数量（可以根据需要调整）
    const maxSize = await maxJobSize();
    // const jobsToFetch = Math.min(maxSize, 50); // 限制获取数量，避免超时
    console.log(`Fetching ${maxSize} jobs`);
    
    // 获取工作信息
    const searchJobs = await jobInfo(10);
    
    // 并行保存到S3和MongoDB
    const [s3Result, mongoResult] = await Promise.all([
      saveS3(searchJobs),
      saveMongoDB(searchJobs)
    ]);
    
    console.log("Job scraping completed successfully");
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Success',
        s3Location: s3Result?.Location,
        mongoCount: mongoResult?.insertedCount
      })
    };
  } catch (error) {
    console.error("Error in Lambda execution:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
      })
    }
  }
};