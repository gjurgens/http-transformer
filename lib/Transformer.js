var _ = require("underscore"),
    helpers = require("./helpers");

module.exports = function(options) {
    var transformHeader = function(name, value, pattern, modifiedValue) {
        return {
            "name":name,
            "value":helpers.transform((modifiedValue || value),pattern)
        };
    };

    var transformUrl = function(req, res, _url, pattern) {
        var url = helpers.transform((_url || req.originalUrl), pattern);
        if(typeof url === "string" && url.length > 0 && url[0] != "/") url = "/" + url;
        return url;
    };

    var transformProtocol = function(req, res, protocol, pattern) {
        return helpers.transform((protocol || req.protocol), pattern);
    };

    var transformTarget = function(req, res, host, pattern) {
        return helpers.transform((host || options.target), pattern);
    };

    var processlogicGourpMatcher =  function(rule, matchers, type, req, proxyRes, appliedToRequest) {
        if((matchers instanceof Array)) {
            rule.childrens = applies(matchers, type, req, proxyRes, appliedToRequest);
            switch(rule.type) {
                case "OR":
                    rule.applied = _.reduce(rule.childrens, function(prev, rule){
                        return (prev || rule.applied);
                    },false);
                    break;
                case "AND":
                    rule.applied = _.reduce(rule.childrens, function(prev, rule){
                        return (prev && rule.applied);
                    },true);
                    break;
                case "NOT":
                    rule.applied = !(_.reduce(rule.childrens, function(prev, rule){
                        return (prev && rule.applied);
                    },true));
                    break;
                default:
                    rule.applied = _.reduce(rule.childrens, function(prev, rule){
                        return (prev && rule.applied);
                    },true);
            }
        } else {
            rule.childrens = [];
            rule.applied = true;
            rule.error = "Logical grouper has no matchers";
        }
    };


    var applies = function(matchers, type, req, proxyRes, appliedToRequest){
        var appliedStatus = [];
        for(var matcherIndex = 0; matcherIndex < matchers.length; matcherIndex++){
            var rule = {
                "type":null,
                "value":null,
                "pattern":null,
                "error":null
            };
            var currentMatcher = matchers[matcherIndex];
            switch(type){
                case "request":
                    switch(currentMatcher.type) {
                        case "header":
                            rule.type = "header:" + currentMatcher.name;
                            rule.value = req.get(currentMatcher.name);
                            rule.pattern = currentMatcher.pattern;
                            rule.applied = helpers.matches(rule.value, rule.pattern);
                            break;
                        case "url":
                            rule.type = "url";
                            rule.value = req.originalUrl;
                            rule.pattern = currentMatcher.pattern;
                            rule.applied = helpers.matches(rule.value, rule.pattern);
                            break;
                        case "protocol":
                            rule.type = "protocol";
                            rule.value = req.protocol;
                            rule.pattern = currentMatcher.pattern;
                            rule.applied = helpers.matches(rule.value, rule.pattern);
                            break;
                        case "AND":
                        case "OR":
                        case "NOT":
                            rule.type = currentMatcher.type;
                            processlogicGourpMatcher(rule, currentMatcher.matchers, type, req, proxyRes, appliedToRequest);
                            break;
                        default:
                            rule.type = currentMatcher.type;
                            rule.applied = false;
                            rule.error = "Type not found in matcher";
                    }
                    break;
                case "response":
                    switch(currentMatcher.type) {
                        case "requestMatchers":
                            rule.type = "requestMatchers";
                            rule.value = appliedToRequest;
                            rule.pattern = currentMatcher.applied;
                            rule.applied = (appliedToRequest === currentMatcher.applied);
                            break;
                        case "header":
                            rule.type = "header:" + currentMatcher.name;
                            rule.value = proxyRes.headers[currentMatcher.name];
                            rule.pattern = currentMatcher.pattern;
                            rule.applied = helpers.matches(rule.value, rule.pattern);
                            break;
                        case "statusCode":
                            rule.type = "status";
                            rule.value = proxyRes.statusCode;
                            rule.pattern = currentMatcher.pattern;
                            rule.applied = helpers.matches(rule.value, rule.pattern);
                            break;
                        case "AND":
                        case "OR":
                        case "NOT":
                            rule.type = currentMatcher.type;
                            processlogicGourpMatcher(rule, currentMatcher.matchers, type, req, proxyRes, appliedToRequest);
                            break;
                        default:
                            rule.type = currentMatcher.type;
                            rule.applied = false;
                            rule.error = "Type not found in matcher";
                    }
                    break;
                default:
                    rule.type = currentMatcher.type;
                    rule.applied = false;
                    rule.error = type + "is invalid, only request/response are supported";
            }
            appliedStatus.push(rule);
        }

        return appliedStatus;

    };

    this.appliesToRequest = function(req) {
        var response = {
            "name":options.name,
            "target":options.target,
            "status":[],
            "applyTransformer":true
        };

        if(options.request && options.request.matchers && options.request.matchers instanceof Array) {
            response.status = applies(options.request.matchers, "request", req);
            response.applyTransformer=_.reduce(response.status, function(prev, rule){
                return (prev && rule.applied);
            },true);
        }

        return response;
    };

    this.appliesToResponse = function(req, proxyRes, appliedToRequest) {
        var response = {
            "name":options.name,
            "target":options.target,
            "status":[],
            "applyTransformer":true
        };

        if(options.response && options.response.matchers && options.response.matchers instanceof Array) {
            response.status = applies(options.response.matchers, "response", req, proxyRes, appliedToRequest);
            response.applyTransformer=_.reduce(response.status, function(prev, rule){
                return (prev && rule.applied);
            },true);
        }

        return response;
    };

    this.getTransformedRequestParams = function(req, res, _transformedParams) {
        var transformedParams = _.extend({
                "headers":{},
                "target":{
                    "protocol":null,
                    "host":null,
                    "url":null
                }
            },
            _transformedParams
        );

        var transformedStatus = [];

        //If transformer has a specific target declared, it tackes precedence over the others
        if(options && options.target) {
            transformedParams.target.host = options.target;
        }

        if(options.request && options.request.transformers && options.request.transformers instanceof Array) {
            for(var transformerIndex = 0; transformerIndex < options.request.transformers.length; transformerIndex++){
                var transform = {
                    "type":null,
                    "original_value":null,
                    "transformed_value":null,
                    "pattern":null,
                    "error":null
                };

                var currentTransformer = options.request.transformers[transformerIndex];
                switch(currentTransformer.type) {
                    case "header":
                        transform.type = "header:" + currentTransformer.name;
                        transform.original_value = transformedParams.headers[currentTransformer.name] || req.get(currentTransformer.name);

                        var header = transformHeader(currentTransformer.name, req.get(currentTransformer.name), currentTransformer.pattern, transformedParams.headers[currentTransformer.name]);
                        transformedParams.headers[header.name] = header.value;

                        transform.transformed_value = header.value;
                        transform.pattern = currentTransformer.pattern;
                        break;

                    case "url":
                        transform.type = "url";
                        transform.original_value = transformedParams.target.url || req.originalUrl;

                        transformedParams.target.url = transformUrl(req, res, transformedParams.target.url, currentTransformer.pattern);

                        transform.transformed_value = transformedParams.target.url;
                        transform.pattern = currentTransformer.pattern;
                        break;

                    case "protocol":
                        transform.type = "protocol";
                        transform.original_value = transformedParams.target.protcol || req.protocol;

                        transformedParams.target.protocol = transformProtocol(req, res, transformedParams.target.protcol, currentTransformer.pattern);

                        transform.transformed_value = transformedParams.target.protocol;
                        transform.pattern = currentTransformer.pattern;
                        break;

                    case "target":
                        transform.type = "target";
                        transform.original_value = transformedParams.target.host  || options.target;

                        transformedParams.target.host = transformTarget(req, res, transformedParams.target.host, currentTransformer.pattern);

                        transform.transformed_value = transformedParams.target.host;
                        transform.pattern = currentTransformer.pattern;
                        break;

                    default:
                        transform.type = currentTransformer.type;
                        transform.error = "Type not found in transformer";
                }
                transformedStatus.push(transform);
            }
        }

        return {
            "status":transformedStatus,
            "transformedParams":transformedParams
        };
    };


    this.getTransformedResponseParams = function(proxyRes, _transformedParams) {
        var transformedParams = _.extend({
                "headers":{},
                "body":[]
            },
            _transformedParams
        );

        var transformedStatus = [];

        if(options.response && options.response.transformers && options.response.transformers instanceof Array) {
            for(var transformerIndex = 0; transformerIndex < options.response.transformers.length; transformerIndex++){
                var transform = {
                    "type":null,
                    "original_value":null,
                    "transformed_value":null,
                    "pattern":null,
                    "error":null
                };

                var currentTransformer = options.response.transformers[transformerIndex];
                switch(currentTransformer.type) {
                    case "header":
                        transform.type = "header:" + currentTransformer.name;
                        transform.original_value = transformedParams.headers[currentTransformer.name] || proxyRes[currentTransformer.name];

                        var header = transformHeader(currentTransformer.name, proxyRes[currentTransformer.name], currentTransformer.pattern, transformedParams.headers[currentTransformer.name]);
                        transformedParams.headers[header.name] = header.value;

                        transform.transformed_value = header.value;
                        transform.pattern = currentTransformer.pattern;
                        break;
                    case "content":
                        transform.type = "content";
                        transform.pattern = currentTransformer.pattern;
                        transformedParams.body.push({
                            "type":"content",
                            "pattern":currentTransformer.pattern
                        });
                        break;
                    default:
                        transform.type = currentTransformer.type;
                        transform.error = "Type not found in transformer";
                }
                transformedStatus.push(transform);
            }
        }

        return {
            "status":transformedStatus,
            "transformedParams":transformedParams
        };
    }

};