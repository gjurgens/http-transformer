var _ = require("underscore"),
    zlib = require('zlib');


module.exports = function(req, res, type, _options) {
    var zip;
    switch(type) {
        case "gzip":
            zip = zlib.createGzip();
            break;
        case "gunzip":
            zip = zlib.createGunzip();
            break;
        default:
            console.log("Invalid compress type");
            return;
    }


    var options = {};
    _.extend(options,_options);


    var _write      = res.write;
    var _end        = res.end;
    var _writeHead  = res.writeHead;

    zip.on("error", function(error){
        _end.call(res,"Error handling compressed response (" + type + "): " + error.toString());
        console.log("Error handling compressed response (" + type + "): " + error.toString());
    });

    res.allowedReplace = false;

    res.writeHead = function (code, headers) {
        //res.setHeader("content-encoding","gzip");
        //if(headers) headers["content-encoding"] = "gzip";
        if(type === "gunzip"){
            res.removeHeader("content-encoding");
            if(headers) delete headers["content-encoding"];
        }
        if(type === "gzip") {
            res.setHeader("content-encoding",type);
            if(headers) headers["content-encoding"] = type;
        }
        _writeHead.apply(res, arguments);
    };

    res.write = function (data, encoding) {
        zip.write(data, encoding);
    };

    zip.on('data', function (buf) {
        _write.call(res, buf);
    });

    res.end = function (data, encoding) {
        zip.end(data, encoding);
    };

    zip.on('end', function () {
        _end.call(res);
    });

};