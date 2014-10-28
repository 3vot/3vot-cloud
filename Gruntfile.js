module.exports = function(grunt) {


	grunt.initConfig({
	  aws: grunt.file.readJSON('./aws_key.json'),
	  s3: {
	    options: {
	      key: '<%= aws.key %>',
	      secret: '<%= aws.secret %>',
	      bucket: 'cli_templates.3vot.com',
	      access: 'public-read',
	      headers: {
	      	"Cache-Control": "max-age=0, public",
	        "Expires": new Date(Date.now() + 1).toUTCString()
				},
	    },
			dev: {
	    	upload: [ { src: './templates/**', options: { gzip: true } }]
			}
		}
	});
  
	grunt.loadNpmTasks('grunt-s3');
	grunt.registerTask('default', ['s3']);
}