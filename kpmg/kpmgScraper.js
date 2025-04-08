const kpmgConfig = require("./kpmgConfig"); // Import the config
const fs = require('fs');
const fetch = require('node-fetch'); // Make sure to install node-fetch
const AWS = require('aws-sdk');
// 初始化AWS服务
// const s3 = new AWS.S3();

class kpmgScraper {

    async maxJobSize() {
      const maxSize = await fetch(kpmgConfig.request.url(), {
        body: kpmgConfig.request.init.body,
        method: kpmgConfig.request.init.method
      })
      .then(res => res.json())
      .then(data =>{
        return data['no of jobs']
      })
      .catch(err => {
        throw new Error(error)
      });

      return maxSize;
    }

    async jobInfo(maxSize) {  
        const jobPosts = await fetch(kpmgConfig.request.url(maxSize), {
            body: kpmgConfig.request.init.body,
            method: kpmgConfig.request.init.method
            })
            .then (data =>data.json())
            .catch (err => {
                throw new Error(error)
            })
            return jobPosts.data;
    }

    async uniInterface(job) {
        return {
          job_title: job.job_title,
          company: job.company,
          location : {
            country:job.job_location_country,
            city:job.job_location_city,
            display:job.job_location_display
          },
          job_description: job.job_description,
          apply_url: job.job_url,
          job_level: job.job_level ? job.job_level.trim() : undefined,
          job_type: job.job_type ? job.job_type: undefined,
          salary: job.salary ?  job.salary: undefined,
          published_at: job.published_date ? job.published_date: undefined,
          due_at: job.due_date ? job.due_date: undefined,
          scraped_at: new Date()
        };
      }

    async startScraping() {
        const maxSize  = await this.maxJobSize();
        const jobPosts = await this.jobInfo(1);

        const jobFile = JSON.stringify(jobPosts, null, 2)
        if (jobPosts.length > 0){

            // Saving file to S3.
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
                `${kpmgConfig.name}JobPosts.json`,
                jobFile,
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
        console.log(`KPMG: ${maxSize} jobs have been scraped.`)
        const transformedJobs = await Promise.all(
            jobPosts.map(item =>
                this.uniInterface(item)) 
          );
        return transformedJobs;
    }
}

module.exports = kpmgScraper;
