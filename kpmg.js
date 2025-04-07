const kpmgConfig = require("./kpmgConfig"); // Import the config
const fs = require('fs');
const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
const day = String(now.getDate()).padStart(2, '0');

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

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
    console.log("Jobs Data:", jobPosts.data);
    console.log("Jobs length:", jobPosts.data.length);
    
    return jobPosts.data;
  } catch (error) {
    console.error("Test failed:", error);
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
    apply_url: job.job_url
  };
}


async function saveS3(jobPosts) {
  console.log(jobPosts.length);
  if (jobPosts.length > 0) {
    const transformedJobs = await Promise.all(
      jobPosts.map(item =>
         uniInterface(item)) 
    );
    console.log(transformedJobs)

    const params = {
      Bucket: 'difan-job-scrape',
      Key: `data/${year}/${month}/${day}/file.json`, // Partitioned path
      Body: JSON.stringify(transformedJobs, null, 2),
      ContentType: 'application/json'
    };

    // For AWS SDK v2
    s3.upload(params, function(err, data) {
      if (err) console.error(err);
      else console.log('Upload success:', data.Location);
    });

  }
}

async function saveMongoDB(searchJobs) {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const dbName = "scraped_jobs";
    const collectionName = "kpmg";
  
    // Create references to the database and collection in order to run
    // operations on them.
    const database = client.db(dbName);
    const collection = database.collection(collectionName);

    const transformedJobs = await Promise.all(
      searchJobs.map(item =>
         uniInterface(item)) 
    );
    
    // Insert the JSON data
    let result;
    if (Array.isArray(transformedJobs)) {
      // If JSON is an array, insert multiple documents
      result = await collection.insertMany(transformedJobs);
    } else {
      // If JSON is an object, insert a single document
      result = await collection.insertOne(transformedJobs);
    }
    console.log("Successfully saved to MongoDb");

  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

async function main() {
  try {
    const searchJobs = await jobInfo(2); // 确保用 await
    // console.log(searchJobs.length);
    saveS3(searchJobs); 
    saveMongoDB(searchJobs);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();