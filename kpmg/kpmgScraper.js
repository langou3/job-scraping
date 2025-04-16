const kpmgConfig = require("./kpmgConfig"); // Import the config
const fs = require('fs');
const fetch = require('node-fetch'); // Make sure to install node-fetch
const _ = require('lodash');
const AWS = require('aws-sdk');
const cheerio = require('cheerio');
const entities = require('entities');
// 初始化AWS服务
const s3 = new AWS.S3();

const date = new Date();
const now = {
  year: date.getFullYear(),
  month:String(date.getMonth() + 1).padStart(2, '0'),
  day:String(date.getDate()).padStart(2, '0'),
}

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
      .catch(error => {
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
            .catch (error => {
                throw new Error(error)
            })
            return jobPosts.data;
    }

    // Check if the city is a valid Australian city
    isValidCity = (city) =>
        validCities.includes(city);
    
    isValidString = (str) =>
        typeof str === 'string' && str.length > 0;
    
    validateJob = (job) => {
        if (
            !this.isValidString(job.job_title) ||
            !this.isValidString(job.company) ||
            !this.isValidString(job.job_url) ||
            !this.isValidCity(job.job_location_city) 
        ) {
            return null;
        }
            return job;
    }

    uniInterface(job){
        return {          
          job_title: job.title,
          company: job.company,
          city:job.city,
          state:job.state,
          country:job.country,
          location: job.location,
          job_description: job.job_description,
          apply_url: job.url,
          job_level: job.experience_level ? job.job_level.trim() : null,
          job_type: job.job_type ? job.job_type: null,
          salary: job.salary ?  job.salary: null,
          published_at: job.published_date ? job.published_date: null,
          due_at: job.due_date ? job.due_date: null,
        };
      }

    async startScraping() {
        // const maxSize  = await this.maxJobSize();
        const jobPosts = await this.jobInfo(10);

        const jobList = [];
        _.keys(jobPosts).map(i => {
            const job = jobPosts[i];
            if (this.validateJob(job)) {
                // 使用 cheerio 移除 HTML 标签
                const $ = cheerio.load(job.job_description);
                let text = $.text();
                // 解码 HTML 实体字符，例如 &nbsp; -> 空格
                text = entities.decodeHTML(text);
                text = text.replace(/\s+/g, ' ').trim();

                jobList.push(
                    {
                        id: job.id,
                        title: job.job_title,
                        company:"KPMG",
                        funtion:job.job_function,
                        job_description:text,
                        industry: job.job_industry,
                        experience_level:job.job_level,
                        city:job.job_location_city,
                        state:job.job_location_state,
                        country:job.job_location_country,
                        location:job.job_location_display,
                        job_type: job.job_type,
                        job_level: job.job_level,
                        salary_from: job.salary_from,
                        salary_to: job.salary_to,
                        url:job.job_url,
                    }
                )
            }
        })
    
        if (!_.isEmpty(jobList)){
            const putParams = {
                Bucket: 'difan-job-scrape',
                Key: `raw_data/${now.year}/${now.month}/${now.day}/KPMG.json`,
                Body:JSON.stringify(jobList, null, 2),
                ContentType:'application/json'
            }
            await s3.putObject(putParams).promise();
        }
        // if (jobList.length > 0){
        //     fs.writeFile(
        //         `${kpmgConfig.name}JobPosts.json`,
        //         jobList,
        //         { encoding: 'utf-8' },
        //         (err) => {
        //           if (err) {
        //             console.error('Failed to save to local:', err);
        //             return;
        //           }
        //           console.log('Successfully saved to local.');
        //         }
        //       )
        // }
        return jobList;    
    }
}

module.exports = kpmgScraper;
