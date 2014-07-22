var Path = require("path")
var Q = require("q");
var fs = require("fs")
var extend = require('util')._extend
var Log = require("./log")
var prompt = require("prompt")

function get(options, oneUser){
  var deferred = Q.defer();
  if(!options) options = {}
  if(!oneUser && oneUser != false) oneUser=true;

  spawn(["get", options.namespace || "3vot"  ])
  .then( function(result){ 
    try{ result  = JSON.parse(result) }catch(err){ result = {} }
    if(oneUser && (!result.users || result.users === {} )) return deferred.reject("No users found, use adduser ");
    var object = {};
    object.package = getPackage(options.app_name);
    object.user = result;
    object.promptValues = options;
    options = object;
    return object
  })
  .then( function(object){ if(oneUser) return promptForUser(object); else return object; } )
  .then( deferred.resolve )
  .fail( deferred.reject )

  return deferred.promise;
}


function promptForUser(object){
  var deferred = Q.defer();

  var objectKeys = Object.keys(object.user.users)
  var objectUsers = objectKeys.length;
  
  if(objectUsers <= 1){
    if(objectUsers == 1) object.user = object.user.users[ objectKeys[0] ];
    process.nextTick( function(){ return deferred.resolve(object); });
    return deferred.promise;
  }

  prompt.start();

  var description = "Profile:\n";
  var index = 1;
  var userArray = [];
  for(user in object.user.users){
    description += index + ": " + user + "\n";
    userArray.push( object.user.users[user] );
    index++;
  }

  var prompts = [ 
    { name: 'user_name_index', description: description }
  ]

  prompt.get(prompts, function (err, result) {
    object.user = userArray[ parseInt(result.user_name_index) - 1 ];
    deferred.resolve(object);
  });

  return deferred.promise;


}

function set(contents, namespace){
  var deferred = Q.defer();
  spawn(["set", namespace || "3vot", JSON.stringify(contents)])
  .then( deferred.resolve )
  .fail( deferred.reject )

   return deferred.promise;  
}

function spawn(commands){
  var deferred = Q.defer();

  Log.debug("Spawing Node Process", "utils/spawk",40)
  var exec = require('child_process').exec;

  var npmcommand = (process.platform === "win32" ? "npm.cmd" : "npm")
  
  var spawn = require('child_process').spawn
  var npm    = spawn(npmcommand, commands);
  var npmResponse ="";

  npm.stderr.setEncoding('utf8');
  npm.stderr.on('data', function (data) {
    deferred.reject(data)
  });

  npm.on('error', function (err) {
    return deferred.reject(err);
  });
  
  npm.stdout.on('data', function (data) {
    npmResponse += data.toString();
  });

  npm.on('close', function (code) {
    return deferred.resolve(npmResponse)
  });

  return deferred.promise;  
}

function getPackage(){
  var path = Path.join( process.cwd(), "package.json" );
  var result = {}
  if(fs.existsSync(path)) result =  require( path );
  return setDefaults(result);
}

function setDefaults(result){
  if(!result.threevot) result.threevot =  {};
  result.threevot.paths = result.threevot.paths || { "sourceBucket": "source.3vot.com", "productionBucket": "3vot.com" }
  result.threevot.uploadSource = result.threevot.uploadSource || true;
  result.threevot.build = result.threevot.build || true;
  result.threevot.distFolder = result.threevot.distFolder || "dist";  
  result.threevot.pathsToExclude =  result.threevot.pathsToExclude || ["node_modules"]

  delete result.threevot.user_name;
  delete result.threevot.public_dev_key;
  delete result.threevot.size;
  delete result.threevot.displayName;
  delete result.INSTRUCTIONS

  return result;
}

module.exports = {
  _3vot: get,
  get: get,
  set: set,
  package: getPackage,
  setPackageDefaults: setDefaults,
  promptForUser: promptForUser,
  spawn: spawn
}

