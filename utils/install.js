var bower = require("bower");
var Path = require("path")
var fs = require("fs")
var prompt = require("prompt")
var Log = require("./log")

var Q = require("q");

function install(){
  var deferred = Q.defer();
  var app_path = Path.join( process.cwd() )
      
  
  var pkgPath = Path.join( process.cwd(), "package.json");

  var pkg = require( pkgPath )
  var gitDeps = Object.keys( pkg.threevot.gitDependencies )

  installBower(destinationDir, gitDeps)
  .then( installNPM  )
  .then( function() {
    process.chdir( Path.join( process.cwd(), "..", ".." ) );
    return deferred.resolve();
  })
  .fail( function(error) { 
    return deferred.reject(error);
  });
  
  return deferred.promise;
  
}

function installBower(destinationDir, packagesToInstall ){
  var deferred = Q.defer();

  Log.debug("Installing Git Components in "  + destinationDir, "utils/install", 42)
  
  bower.config.directory = destinationDir

  bower.commands
  .install(packagesToInstall, {}, {} )
  .on('end', function (installed) {
      deferred.resolve();
  })

  .on("error", function (error) {
      Log.debug("error in install bower", "utils/install", 51)    
      deferred.reject(error);
  });

  return deferred.promise;
}
  
function installNPM(){
  var deferred = Q.defer();

  Log.debug("Installing NPM Components in " + process.cwd(), "utils/install",60)
  var exec = require('child_process').exec;

  var npmcommand = (process.platform === "win32" ? "npm.cmd" : "npm")
  
  var spawn = require('child_process').spawn,
      npm    = spawn(npmcommand, ['install', '.']);

  npm.stderr.setEncoding('utf8');
  npm.stderr.on('data', function (data) {
    Log.debug(data, "utils/install", 74);
  });

  npm.on('error', function (err) {
    Log.debug(err, "utils/install", 74);
  });

  npm.stdout.on('data', function (data) {
    //Log.debug(data, "utils/install", 66);
  });

  npm.on('close', function (code) {
    return deferred.resolve()
  });


  return deferred.promise;  
}

module.exports = installNPM;

install.installNPM = installNPM;