var fs = require('fs');
var Aws = require("aws-sdk");
var Semver = require("semver");
var fstream = require("fstream");
var tar = require("tar");
var zlib = require("zlib");
var Q = require("q");
var colors = require('colors');
var mime = require('mime')
var Path = require('path');
var prompt = require("prompt")
var eco = require("eco")
var AwsCredentials = require("../aws/credentials");
var cheerio = require("cheerio")
var rimraf = require("rimraf")
var Packs = require("../utils/packs")
var Log = require("../utils/log")
var App = require("../models/app")
var AppBuild = require("./build")
var rimraf = require("rimraf");
var File = require("../utils/file")

var Request = require("superagent")

var promptOptions= { 
  promptValues:null,
  user:null,
  package: null,
  distPath: null
}

var tempVars= {
  app: null
}

function execute( options ){
  Log.info("Downloading " +  options.promptValues.app_name + " from the 3VOT Marketplace")
  if(!options.promptValues.app_new_name) options.promptValues.app_new_name = options.promptValues.app_name
  var deferred = Q.defer();
  if( !options.package.keys ) tempVars.keys = [options.promptValues.app_user_name, options.promptValues.app_name];

  promptOptions = options;
  tempVars.key = tempVars.keys.join("/")

  getApp()
  .then( function(){ return AwsCredentials.requestKeysFromProfile( "guest" ) })
  .then( File.clearTMPFolder )  
  .then( downloadApp )
  .then( copyFolder )
  .then( File.clearTMPFolder )
  .then( adjustPackage )
  .then( adjustIndex )
  .then( File.clearTMPFolder )
  .then( function(){ 
    var instructions = promptOptions.package.threevot.installInstructions;
    Log.info("INSTRUCTIONS:") 
    Log.info("1. cd into " + promptOptions.promptValues.app_new_name + " folder") 
    if(instructions){ Log.info("2." + instructions) }
    else if( Object.keys(promptOptions.package.dependencies).length>0){
      Log.info("2. Use 'npm install .' to install dependencies")
    }
    return deferred.resolve(tempVars.app) 
  })
  .fail( function(err){ return deferred.reject(err); })

  return deferred.promise;
}

function getApp(){
  var deferred = Q.defer();
  
  callbacks= function(res){
    if (res.ok && responseOk(res.body) ) {
      res.body = JSON.parse(res.body);
      res.body.version = res.body.Version__c;
      res.body.app_name = res.body.Name;
      tempVars.app = res.body;
      tempVars.app_version = res.body.Version__c;
      return deferred.resolve( this ) 
    } else {
      return deferred.reject( res.error || res.body )
    }
  }


  Request.get(promptOptions.package.threevot.api )
  .set( 'Accept', 'application/json' )
  .query( "action=" + "GET_APP" )
  .query( "strict=true" )
  .query( "app_name=" + promptOptions.promptValues.app_name )
  .query( "dev_code="+ promptOptions.user.public_dev_key )
  .query( "app_org="+ promptOptions.promptValues.app_user_name )
  .end(callbacks);

  return deferred.promise;
}


function downloadApp(){
  var deferred = Q.defer();
  var s3 = new Aws.S3();

  if(!promptOptions.promptValues.app_version) promptOptions.promptValues.app_version = tempVars.app_version;

  var path = Path.join( process.cwd(), 'tmp' );
  fs.mkdirSync(path);

  var writeStream = fs.createWriteStream( Path.join( process.cwd(), 'tmp',  promptOptions.promptValues.app_new_name + ".tar.gz"  ) , { flags : 'w' } );

  var key = tempVars.key + "_" +  promptOptions.promptValues.app_version + '.3vot';
  
  var params = {Bucket: promptOptions.package.threevot.paths.sourceBucket , Key: key };
  
  Log.debug("Downloading Source Code from " + key , "actions/app_download", 98)

  s3.getObject(params)
  .on('error', function(error){
    console.log('s3 download error', error);
    deferred.reject(error);
  })
  .createReadStream().pipe( writeStream )
  .on("close", function(){ deferred.resolve(); })
  .on("error", function( error ){ console.log("Error with source key: " + key); deferred.reject(error) });
  
  return deferred.promise;
}

function copyFolder(){
  Log.debug("Copying Folder" , "actions/app_download", 117)

  var deferred = Q.defer();
  var oldPath = Path.join( process.cwd(),'tmp', promptOptions.promptValues.app_new_name + ".tar.gz" );
  var newPath = Path.join( process.cwd(), promptOptions.promptValues.app_new_name );

  fs.stat(newPath, function(err, stats){ 
    if(stats) return deferred.reject("App already exists, rename it before download")

    var read = require('fs').createReadStream
    var unpack = require('tar-pack').unpack
    read( oldPath )
    .pipe(unpack( newPath , function (err) {
      if (err) return deferred.reject(err)
      deferred.resolve()
    }))
  });
  
  return deferred.promise;
}

function adjustPackage(){
  Log.debug("Adjusting the package.json for your Profile", "actions/app_download", 98);
  var app_path = Path.join(process.cwd(), promptOptions.promptValues.app_new_name)
  process.chdir(app_path);

  var deferred = Q.defer();
  promptOptions.package = require( Path.join( process.cwd(), "package.json" ) );
  promptOptions.package.name = promptOptions.promptValues.app_new_name;
  
  promptOptions.package = Packs.setPackageDefaults(promptOptions.package)  

  fs.writeFile( Path.join( process.cwd(), "package.json" ), JSON.stringify(promptOptions.package,null,'\t') , function(err){
    if(err) return deferred.reject(err);
    deferred.resolve();
  });

  return deferred.promise;

}

function adjustIndex(){
  Log.debug("Adjusting the index.html", "actions/app_download", 186);

  var deferred = Q.defer();
  var indexPath =  Path.join( process.cwd(), "index.html" )  
  fs.exists(indexPath, function(err, exists){
    if(err || !exists) return deferred.resolve()
    var indexBody = fs.readFileSync(indexPath)

    var $ = cheerio.load(indexBody)
    var body = $("#_3vot_" + promptOptions.promptValues.app_name)
    body.attr("id", "_3vot_" + promptOptions.promptValues.app_new_name)

    fs.writeFile(indexPath, $.html(), function(err){
      if(err) return deferred.reject(err)
      return deferred.resolve();
    })

  });

  return deferred.promise;
}

function responseOk(responseBody){
  if(responseBody.indexOf("ERROR_CODE") > -1) return false
  return true;
}

module.exports = execute;