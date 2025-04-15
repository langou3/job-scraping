const fs = require('fs');
const fetch = require('node-fetch'); 
const puppeteer = require('puppeteer');
const _ = require('lodash');

const googleScraperConfig = {
    name: 'google',
    baseurl : 'https://www.google.com/about/careers/applications/jobs/results',
    browserViewPort: { width: 1080, height: 1024 },
    params: {
		country: "Australia",
		page: ""
	  },
    url: function (limit = this.params.limit) {
    return `${this.baseurl}?location=${this.params.country}&page=${limit}`;
    },
    selector: {
        jobList: 'ul.spHGqe > li',
        }
}

class googleScraper {

    async singlePageScraping(browser, url) {

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport(googleScraperConfig.browserViewPort);
        try {
            await page.goto(url);
            const jobUrl = {url:url};
			// job title
			const titleSelector = await page.waitForSelector('div.sPeqm');
			const title = await titleSelector?.evaluate(el => el.querySelector('h2')?.textContent);
            console.log(title)
            const jobTitle = {job_title: title};
            await page.waitForSelector('div.DkhPwc');
            const result = await page.evaluate(() => {
  
                const spans = Array.from(document.querySelectorAll('div > span'));
                const companySpan = spans.find(span => 
                  span.querySelector('i')?.textContent.includes('corporate_fare')
                );
                const locationSpan = spans.find(span => 
                  span.querySelector('i')?.textContent.includes('place')
                );
                const jobSpan = spans.find(span => 
                    span.querySelector('i')?.textContent.includes('bar_chart')
                );
                  
                let jobLevel = "";
                if (jobSpan) {
                    let nextNode = jobSpan.nextSibling;
                    while (nextNode) {
                        if (nextNode.nodeType === Node.ELEMENT_NODE && nextNode.tagName === 'SPAN') {
                            jobLevel = nextNode.textContent.trim();
                            break; 
                        }
                    nextNode = nextNode.nextSibling;
                    }
                }
                
                if (!jobLevel && jobSpan) {
                    const parentSpan = jobSpan.closest('button, span')?.querySelector('span');
                    jobLevel = parentSpan?.textContent.trim();
                }
                return {
                  company: companySpan?.textContent?.replace('corporate_fare', '').trim(),
                  location: locationSpan?.textContent?.replace('place', '').trim(),
                  level:jobLevel
                };
              });

            // qualifications
            const qualifications = await page.evaluate(() => {
                const jobSection = document.querySelector('div.KwJkGe');
                if (!jobSection) return null;
                
                return {
                    minimum_qualifications: Array.from(jobSection.querySelectorAll('h3 ~ ul:first-of-type li'))
                        .map(li => li.textContent.replace(/::marker|""/g, '').trim())
                        .filter(text => text), 
                    preferred_qualifications: Array.from(jobSection.querySelectorAll('h3 ~ ul:last-of-type li'))
                        .map(li => li.textContent.replace(/::marker|""/g, '').trim())
                        .filter(text => text)  
                };
            });

           // Extract about the job description
            const aboutJob = await page.evaluate(() => {
                const jobSection = document.querySelector('div.aG5W3');
                if (!jobSection) return null;
                
                let aboutTexts = "";
                if (jobSection.querySelector('h3') && jobSection.querySelector('p')) {
                    const h3 = jobSection.querySelector('h3');
                    if (h3) h3.remove(); 
                    aboutTexts = Array.from(jobSection.querySelectorAll('p'))
                    .map(p => p.textContent.trim())
                    .filter(text => text);
                } else {
                    const h3 = jobSection.querySelector('h3');
                    if (h3) h3.remove(); 
                    aboutTexts = jobSection.textContent.trim()
                }

                return {
                    about_the_job: aboutTexts.length > 0 ? aboutTexts : null, 
                };
            });
            // console.log(aboutJob);

            // Extract job responsibilities
            const responsibilities = await page.evaluate(() => {
                const responsibilitiesSection = document.querySelector('div.BDNOWe');
                if (!responsibilitiesSection) return null;
                const title = responsibilitiesSection.querySelector('h3')?.textContent.trim();
                
                const paragraphs = Array.from(responsibilitiesSection.querySelectorAll('li'))
                .map(p => p.textContent.trim());            
                return {
                    rensponsibilities: paragraphs
                };
            });
            // console.log(responsibilities);

            const jobInfo = _.merge({},jobTitle ,result, qualifications,aboutJob, responsibilities, jobUrl);
            return jobInfo;
        }catch (e){
            console.error(e);
            await browser.close();
            return null;
        
        }
    } 

    async listPageScraping(browser, pageNumber) {
        const page = await browser.newPage();
        await page.setViewport(googleScraperConfig.browserViewPort);
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.goto(googleScraperConfig.url(pageNumber));

        const jobList = await page.waitForSelector('ul.spHGqe > li');
        const urls = await page.$$eval('ul.spHGqe > li', listItems => {
            const links = [];
   
            listItems.forEach(li => {
                const anchor = li.querySelector('a');
                links.push(anchor.href);
            });
          
            return links;
        });

        if (!urls) {
            return []
        } else {
            return urls;
        }
    }

    async maxPageNumber(browser){
        const page = await browser.newPage();
        await page.setViewport(googleScraperConfig.browserViewPort);
        await page.goto(googleScraperConfig.url(googleScraperConfig.page));

        const result = await page.$eval('div[jsname="uEp2ad"]', el => {
            const parts = Array.from(el.childNodes).map(n => n.textContent.trim());
            return {
              start: parseInt(parts[0], 10),
              end: parseInt(parts[2], 10),
              total: parseInt(parts[4], 10),
            };
          });
        const itemsPerPage = result.end - result.start + 1; 
        const maxPage = Math.ceil(result.total / itemsPerPage); 
        return maxPage;
    }

    async startScraping() {
        const jobPosts = [];

        const browser = await puppeteer.launch({ headless: true  });

        const maxPage = await this.maxPageNumber(browser);
        console.log("max page", maxPage);
        const urls = await this.listPageScraping(browser, 1);
        await Promise.all(
            urls.map(async url => {
                const jobInfo = await this.singlePageScraping(browser, url);
                if (jobInfo) {
                    jobPosts.push(jobInfo);
                }
            })
        )

        // for (let i = 1; i <= maxPage; i++) {
        //     const urls = await this.listPageScraping(browser, i);
        //     await Promise.all(
        //         urls.map(async url => {
        //             const jobInfo = await this.singlePageScraping(browser, url);
        //             if (jobInfo) {
        //                 jobPosts.push(jobInfo);
        //             }
        //         })
        //     )
        // }
        browser.close();
        fs.writeFile(
            `GoogleJobPosts.json`,
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

module.exports = googleScraper;
