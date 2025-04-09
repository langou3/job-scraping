const fs = require('fs');
const fetch = require('node-fetch'); 
const puppeteer = require('puppeteer');

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

    async singlePageScraping() {
        const browser = await puppeteer.launch({ headless: true  });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport(googleScraperConfig.browserViewPort);
        let url = 'https://www.google.com/about/careers/applications/jobs/results/138138461663044294-software-engineer-photos?location=Australia';
        try {
            await page.goto(url);

			// job title
			const titleSelector = await page.waitForSelector('div.sPeqm');
			const title = await titleSelector?.evaluate(el => el.querySelector('h2')?.textContent);
            console.log(title)


            await page.waitForSelector('div.DkhPwc');
            const result = await page.evaluate(() => {
                // 假设公司信息和地点信息都在同一父div下的相邻span中
                const container = document.querySelector('div > span > i + span, div > span > span');
                
                const spans = Array.from(document.querySelectorAll('div > span'));
                const companySpan = spans.find(span => 
                  span.querySelector('i')?.textContent.includes('corporate_fare')
                );
                const locationSpan = spans.find(span => 
                  span.querySelector('i')?.textContent.includes('place')
                );
                
                return {
                  company: companySpan?.textContent?.replace('corporate_fare', '').trim(),
                  location: locationSpan?.textContent?.replace('place', '').trim()
                };
              });

            console.log(result)

            // qualifications
            const qualifications = await page.evaluate(() => {
                const jobSection = document.querySelector('div.KwJkGe');
                if (!jobSection) return null;
                
                return {
                    minimum: Array.from(jobSection.querySelectorAll('h3 ~ ul:first-of-type li'))
                        .map(li => li.textContent.replace(/::marker|""/g, '').trim())
                        .filter(text => text), 
                    preferred: Array.from(jobSection.querySelectorAll('h3 ~ ul:last-of-type li'))
                        .map(li => li.textContent.replace(/::marker|""/g, '').trim())
                        .filter(text => text)  
                };
            });

            console.log( qualifications);

           // Extract about the job description
            const aboutJob = await page.evaluate(() => {
                const jobSection = document.querySelector('div.aG5W3');
                if (!jobSection) return null;
                
                const aboutTexts = Array.from(jobSection.querySelectorAll('h3 ~ p'))
                    .map(p => p.textContent.trim())
                    .filter(text => text);
                
                return {
                    aboutTheJob: aboutTexts.length > 0 ? aboutTexts[0] : null, 
                };
            });
            console.log(aboutJob);

            // Extract job responsibilities
            const responsibilities = await page.evaluate(() => {
                const responsibilitiesSection = document.querySelector('div.BDNOWe');
                if (!responsibilitiesSection) return null;
                const title = responsibilitiesSection.querySelector('h3')?.textContent.trim();
                
                const paragraphs = Array.from(responsibilitiesSection.querySelectorAll('p'))
                .map(p => p.textContent.trim());            
                return {
                    title: title,
                    content: paragraphs
                };
            });
            console.log(responsibilities);


            await browser.close();
        }catch (e){
            console.error(e);
            await browser.close();

            return null;
        
        }
    } 

    async listPageScraping() {
        const browser = await puppeteer.launch({ headless: true  });
        const page = await browser.newPage();
        await page.setViewport(googleScraperConfig.browserViewPort);

		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        let pageNumber = '';
        await page.goto(googleScraperConfig.url(pageNumber));
        // let data = await page.content();

        // await page.waitForSelector('ul.spHGqe > li');
        // // Extract job data
        // const jobs = await page.evaluate(() => {
        //     const jobCards = Array.from(document.querySelectorAll('ul.spHGqe > li'));
        //     return jobCards.map(li => {
        //     return {
        //         title: li.querySelector('h3')?.textContent?.trim(), // Example selector
        //         link: li.querySelector('a')?.href,
        //     };
        //     }).filter(job => job.title); // Filter out empty results
        // });

        const jobList = await page.waitForSelector('ul.spHGqe > li');
        console.log(jobList);
        const urls = await page.$$eval('ul.spHGqe > li', listItems => {
            const links = [];
   
            listItems.forEach(li => {
                const anchor = li.querySelector('a');
                links.push(anchor.href);
            });
          
            return links;
        });

        await browser.close();

        if (!urls) {
            return []
        } else {
            return urls;
        }
    }

    async maxPageNumber(){
        const browser = await puppeteer.launch({ headless: true  });
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
        await browser.close();
        const itemsPerPage = end - start + 1; 
        const maxPage = Math.ceil(total / itemsPerPage); 
        return maxPage;
    }
}

module.exports = googleScraper;
