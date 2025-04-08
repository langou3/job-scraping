const kpmgConfig = {
	name: "kpmg",
	request: {
	  baseurl: "https://globalcareers.kpmg.com/",
	  params: {
		offset: 0,
		limit: 3,
		region: "",
		country: "Australia",
		jobFunction: "", // Renamed "function" to avoid reserved word issues
		keyword: "",
		posting: "GO%20Transfers"
	  },
	  url: function (limit = this.params.limit) {
		return `${this.baseurl}api/get-jobs?offset=${this.params.offset}&limit=${limit}&region=${this.params.region}&country=${this.params.country}&function=${this.params.jobFunction}&keyword=${this.params.keyword}&posting=${this.params.posting}`;
	  },
	  init: {
		body: null,
		method: "GET"
	  }
	}
  };
  
  module.exports = kpmgConfig; // Export the config
  