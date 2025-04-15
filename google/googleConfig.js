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

module.exports = googleScraperConfig; // Export the config
