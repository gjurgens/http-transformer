var fs = require("fs"),
    yaml = require("js-yaml"),
    fsPath = require("path");

var CACHED_RULE_PATH = null;

exports.matches = function(str, pattern) {
    var regexp = new RegExp(pattern);
    return regexp.test(str);
};

exports.transform = function(str, pattern) {
    var replacedStr = str;
    if(typeof pattern === "string") replacedStr = pattern;
    if(pattern instanceof Array && (pattern.length === 2 || pattern.length === 3)) {
        var regexp,
            replaceMask;
        if(pattern.length === 2) {
            regexp = new RegExp(pattern[0]);
            replaceMask = pattern[1];
        } else {
            regexp = new RegExp(pattern[0],pattern[1]);
            replaceMask = pattern[2];
        }
        if(str) {
            replacedStr = str.replace(regexp,replaceMask);
        }
    }
    return replacedStr;
};

exports.loadRules = function(path, callback) {
    var DEFAULT_RULES_FILE_YAML = "ht-rules.yaml",
        DEFAULT_RULES_FILE_JSON = "ht-rules.json",
        DEFAULT_RULES_DIRECTORY = "ht-rules";

    var readFile = function(path, callback) {
        console.log("Loading rules file: " + path);
        var data = "";
        try {
            data = fs.readFileSync(path,{"encoding":"utf8"});
        } catch(err){
            console.log("Rules file: " + path + ", could not be loaded (" + err + ")");
            callback((new Error("Rules file: " + path + ", could not be loaded (" + err + ")")),{});
        }
        var ext = path.split(".").pop();
        if(ext === "yaml") {
            try{
                callback(
                    null,yaml.load(
                        data,
                        {
                            "schema":yaml.JSON_SCHEMA
                        }
                    )
                );
                console.log("Done loading file: " + path)
            } catch(err) {
                console.log("Rules file: " + path + ", could not be loaded. Invalid YAML (" + err + ")");
                callback((new Error("Rules file: " + path + ", could not be loaded. Invalid YAML (" + err + ")")),{});
            }
        } else {
            try{
                callback(null,JSON.parse(data));
                console.log("Done loading file: " + path)
            } catch(err) {
                console.log("Rules file: " + path + ", could not be loaded. Invalid JSON (" + err + ")");
                callback((new Error("Rules file: " + path + ", could not be loaded. Invalid JSON (" + err + ")")),{});
            }
        }
    };

    var readDirectory = function(path, callback){
        console.log("Loading rules from directory: " + path);
        fs.readdir(path,function(err, files){
            if(err) {
                console.log("Rules from directory: " + path + ", could not be loaded (" + err + ")");
                callback((new Error("Rules from directory: " + path + ", could not be loaded (" + err + ")")),{});
            } else {
                var allRules = {
                    "rules":[]
                };
                for(var fileIndex = 0; fileIndex < files.length; fileIndex++) {
                    readFile(fsPath.join(path,files[fileIndex]),function(err, data){
                        if(!err) {
                            allRules.rules = allRules.rules.concat(data.rules);
                        }
                    });
                }
                callback(null, allRules);
            }
        });
    };


    //Detecting default rules paths
    if(!path) {
        if(CACHED_RULE_PATH) {
            path = CACHED_RULE_PATH;
        } else {
            if(fs.existsSync(fsPath.join(process.cwd(), DEFAULT_RULES_FILE_YAML))) {
                path = fsPath.join(process.cwd(), DEFAULT_RULES_FILE_YAML);
                CACHED_RULE_PATH = path;
            } else if(fs.existsSync(fsPath.join(process.cwd(), DEFAULT_RULES_FILE_JSON))) {
                path = fsPath.join(process.cwd(), DEFAULT_RULES_FILE_JSON);
                CACHED_RULE_PATH = path;
            } else if(fs.existsSync(fsPath.join(process.cwd(), DEFAULT_RULES_DIRECTORY))) {
                path = fsPath.join(process.cwd(), DEFAULT_RULES_DIRECTORY);
                CACHED_RULE_PATH = path;
            }
        }
    }

    if(path[0] !== "/") {
        path = fsPath.join(process.cwd(), path);
    }

    fs.stat(path, function(err, stat){
        if(err) {
            console.log("Rules file: " + path + ", could not be loaded (" + err + ")");
            callback((new Error("Rules file: " + path + ", could not be loaded (" + err + ")")),{});
        } else {
            if(stat.isFile()) {
                readFile(path,callback);
                fs.watchFile(path, {"persistent":true, "interval":500}, function (curr, prev) {
                    console.log("Rules file: " + path + " was modified.");
                    readFile(path,callback);
                });
            } if(stat.isDirectory()){
                readDirectory(path, callback);
                fs.watchFile(path, {"persistent":true, "interval":500}, function (curr, prev) {
                    console.log("Rules in directory: " + path + " were modified.");
                    readDirectory(path, callback);
                });
            } else {
                console.log(path + ", is not a file or directory");
                callback((new Error(path + ", is not a file or directory")),{});
            }
        }
    });
};
exports.getTransformedUrl = function(req) {
    return (req.transformedRequestParams.target.protocol || req.protocol || "http") + "://" + req.transformedRequestParams.target.host + (req.transformedRequestParams.target.url || req.originalUrl || "/");
}