var httpProxy = require('http-proxy'),
    _ = require("underscore"),
    Transformer = require("./Transformer"),
    streamResponseReplacer = require("./streamResponseReplacer"),
    streamResponseZipper = require("./streamResponseZipper"),
    path = require("path"),
    helpers = require("./helpers"),
    urlParser = require("url"),
    logger = require("./logger")();

var getTransformedRequestParams = function(req, res, transformers) {
    var transformedRequestParams = {
        "history":[],
        "transormersMatchingStatus":[]
    };

    for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++){
        var applied = transformers[currentTransformerIndex].appliesToRequest(req,res);
        transformedRequestParams.transormersMatchingStatus.push(applied.applyTransformer);

        var history = {
            "name": applied.name || "Rule #" + currentTransformerIndex,
            "target":applied.target,
            "applies": applied.applyTransformer,
            "matchers":applied.status,
            "transformers":[]
        };

        if(applied.applyTransformer) {
            var transformed = transformers[currentTransformerIndex].getTransformedRequestParams(req,res,transformedRequestParams);
            _.extend(transformedRequestParams,transformed.transformedParams);
            history.transformers = transformed.status;
        }
        transformedRequestParams.history.push(history);
    }
    //logger.log("info","REQUEST: " + JSON.stringify(transformedRequestParams,null,2),req);
    return transformedRequestParams;
};

var getTransformedResponseParams = function(req, proxyRes, transformers, requestTransormersMatchingStatus) {

    var transformedResponseParams = {
        "history":[]
    };

    for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++){
        var applied = transformers[currentTransformerIndex].appliesToResponse(req, proxyRes, requestTransormersMatchingStatus[currentTransformerIndex]);

        var history = {
            "name": applied.name || "Rule #" + currentTransformerIndex,
            "target":applied.target,
            "applies": applied.applyTransformer,
            "matchers":applied.status,
            "transformers":[]
        };

        if(applied.applyTransformer) {
            var transformed = transformers[currentTransformerIndex].getTransformedResponseParams(proxyRes,transformedResponseParams);
            _.extend(transformedResponseParams,transformed.transformedParams);
            history.transformers = transformed.status;
        }
        transformedResponseParams.history.push(history);
    }
    //logger.log("info","RESPONSE: " + JSON.stringify(transformedResponseParams,null,2),req);
    return transformedResponseParams;
};

var handleRedirects = function(proxyRes, req, res, options) {
    if (
        proxyRes.headers &&
        proxyRes.headers.location &&
        proxyRes.statusCode &&
        /^30(1|2|7|8)$/.test(proxyRes.statusCode) &&
        req.transformedRequestParams &&
        req.transformedRequestParams.target &&
        req.transformedRequestParams.target.host &&
        (urlParser.parse(proxyRes.headers.location).host === req.transformedRequestParams.target.host) &&
        req.headers &&
        req.headers.host
    ) {
        var handledRedirect = urlParser.parse(proxyRes.headers.location);
        handledRedirect.host = req.headers.host;
        //Reparsing after host change
        handledRedirect = urlParser.parse(urlParser.format(handledRedirect));

        //If the protocol has changed, match with de proxy ports configuration
        if(handledRedirect.protocol != req.protocol) {
            if(handledRedirect.protocol === "http:") handledRedirect.port = options.port;
            if(handledRedirect.protocol === "https:") handledRedirect.port = options.ssl_port;
            //Remove host for regenerate with hostname + port on url format
            delete handledRedirect.host;
        }

        logger.log("info","Rewriting host for a '" + proxyRes.statusCode + "' redirect. " + proxyRes.headers.location + " => " + urlParser.format(handledRedirect));
        proxyRes.headers['location'] = urlParser.format(handledRedirect);
    }
};

module.exports = function(_options) {
    var options = {};
    _.extend(options,_options);
    var transformers = [];

    helpers.loadRules(
        options.rules,
        function(err, rules){
            if(!err) {
                options = rules;
                transformers = [];
                for (var transformerIndex = 0; transformerIndex < options.rules.length; transformerIndex++) {
                    transformers.push(new Transformer(options.rules[transformerIndex]));
                }
                _.extend(options,_options);
            }
        }
    );

    var proxy = httpProxy.createProxyServer({"prependPath":true,"appendPath":false});

    proxy.on('error', function (err, req, res) {

        if(!res.headersSent) {
            res.writeHead(500, {
                'Content-Type': 'text/plain'
            });
            res.end('Error: ' + err);
        }
        logger.log("error", "Proxy error: " + err.message + ":" + err.stack);
    });

    proxy.on('proxyReq', function(proxyReq, req, res, options) {
        _.each(req.transformedRequestParams.headers,function(value,name){
            proxyReq.setHeader(name, value);
        });

    });

    proxy.on('proxyRes', function (proxyRes, req, res) {
        res.transformedResponseParams = getTransformedResponseParams(req, proxyRes, transformers, req.transformedRequestParams.transormersMatchingStatus);

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
        logger.transformer(req, res);
        handleRedirects(proxyRes, req, res, options);
    });


    return function(req, res, next){
        req.transformedRequestParams = getTransformedRequestParams(req, res, transformers);

        if(req.transformedRequestParams.target && req.transformedRequestParams.target.host) {
            var url = helpers.getTransformedUrl(req);
            return proxy.web(req, res, {"target": url});
        } else {
            res.end("No target matched");
            return;
        }
    };
};
