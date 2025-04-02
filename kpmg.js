const kpmgConfig = require("./kpmgConfig"); // Import the config
const fs = require('fs');


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
    const jobDescrpition =  jobPosts.data.job_description;

    return jobPosts.data;
  } catch (error) {
    console.error("Test failed:", error);
  }

}

async function uniInterface(job) {
  console.log("uniInterface");
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


async function saveRaw(jobPosts) {
  console.log(jobPosts.length);
  if (jobPosts.length > 0) {
    const transformedJobs = await Promise.all(
      jobPosts.map(item =>
         uniInterface(item)) 
    );
    console.log(transformedJobs)
    const outputPath = 'JobPosts.json';
    
    await fs.writeFile(
        outputPath,
        JSON.stringify(transformedJobs, null, 2),
        { encoding: 'utf-8' }, 
        (err) => {           
          if (err) throw err;
          console.log('File successfully saved.');
        }
      );
  }
}

async function main() {
  try {
    const searchJobs = await jobInfo(1); // 确保用 await
    // console.log(searchJobs.length);
    // saveRaw(searchJobs);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();