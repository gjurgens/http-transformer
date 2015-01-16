var httpProxy = require('http-proxy'),
    _ = require("underscore"),
    Transformer = require("./Transformer"),
    streamResponseReplacer = require("./streamResponseReplacer"),
    streamResponseZipper = require("./streamResponseZipper"),
    path = require("path"),
    helpers = require("./helpers");

var getTransformedRequestParams = function(req, res, transformers) {

    var transformedRequestParams = {
        "history":[],
        "transormersMatchingStatus":[]
    };

    for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++){
        var applied = transformers[currentTransformerIndex].appliesToRequest(req,res);

        transformedRequestParams.transormersMatchingStatus.push(applied.applyTransformer);

        var history = {
            "matchers":applied.status,
            "transformers":[]
        };

        if(applied.applyTransformer) {
            console.log("apply transformers for: " + currentTransformerIndex);
            var transformed = transformers[currentTransformerIndex].getTransformedRequestParams(req,res,transformedRequestParams);
            _.extend(transformedRequestParams,transformed.transformedParams);
            history.transformers = transformed.status;
        }
        transformedRequestParams.history.push(history);
    }
    //console.log("REQUEST: " + JSON.stringify(transformedRequestParams,null,2));
    return transformedRequestParams;
};

var getTransformedResponseParams = function(proxyRes, transformers, requestTransormersMatchingStatus) {

    var transformedResponseParams = {
        "history":[]
    };

    for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++){
        var applied = transformers[currentTransformerIndex].appliesToResponse(proxyRes, requestTransormersMatchingStatus[currentTransformerIndex]);

        var history = {
            "matchers":applied.status,
            "transformers":[]
        };

        if(applied.applyTransformer) {
            console.log("apply transformers for: " + currentTransformerIndex);
            var transformed = transformers[currentTransformerIndex].getTransformedResponseParams(proxyRes,transformedResponseParams);
            _.extend(transformedResponseParams,transformed.transformedParams);
            history.transformers = transformed.status;
        }
        transformedResponseParams.history.push(history);
    }
    //console.log("RESPONSE: " + JSON.stringify(transformedResponseParams,null,2));
    return transformedResponseParams;
};

module.exports = function() {
    var options = {};
    var transformers = [];

    helpers.loadRules(path.join(process.cwd(),"rules.json"),function(err, rules){
        if(!err) {
            options = rules;
            transformers = [];
            for (var transformerIndex = 0; transformerIndex < options.rules.length; transformerIndex++) {
                transformers.push(new Transformer(options.rules[transformerIndex]));
            }
        }
    });

    var proxy = httpProxy.createProxyServer({"prependPath":true,"appendPath":false});

    proxy.on('error', function (err, req, res) {

        if(!res.headersSent) {
            res.writeHead(500, {
                'Content-Type': 'text/plain'
            });
            res.end('Error: ' + err);
        }
        console.log("Proxy error: " + err.message + ":" + err.stack);
    });

    proxy.on('proxyReq', function(proxyReq, req, res, options) {
        _.each(req.transformedRequestParams.headers,function(value,name){
            proxyReq.setHeader(name, value);
        });

    });

    proxy.on('proxyRes', function (proxyRes, req, res) {
        res.transformedResponseParams = getTransformedResponseParams(proxyRes, transformers, req.transformedRequestParams.transormersMatchingStatus);

        _.extend(proxyRes.headers,res.transformedResponseParams.headers);

        //If gzipped ungzip before modifi content (inverted)
        if(
            proxyRes.headers['content-encoding'] === "gzip" &&
            res.transformedResponseParams.body.length > 0
        ) {
            streamResponseZipper(req, res, "gzip");
        }

        for(var bodyTransformerIndex = (res.transformedResponseParams.body.length - 1); bodyTransformerIndex >= 0; bodyTransformerIndex--){
            var transformer = res.transformedResponseParams.body[bodyTransformerIndex];
            if(transformer.type === "content") {
                streamResponseReplacer(req, res, transformer.pattern);
            }
        }

        //If gzipped ungzip before modify content (inverted)
        if(
            proxyRes.headers['content-encoding'] === "gzip" &&
            res.transformedResponseParams.body.length > 0
        ) {
            streamResponseZipper(req, res, "gunzip");
        }

        console.log("end response")
    });


    return function(req, res, next){
        req.url = "/";
        req.transformedRequestParams = getTransformedRequestParams(req, res, transformers);

        if(req.transformedRequestParams.target && req.transformedRequestParams.target.host) {
            var url = (req.transformedRequestParams.target.protocol || "http") + "://" + req.transformedRequestParams.target.host + (req.transformedRequestParams.target.url || req.originalUrl || "/");
            console.log("Calling:"  + url);
            return proxy.web(req, res, {"target": url});
        } else {
            res.end("No target matched");
            return;
        }
    };
};
