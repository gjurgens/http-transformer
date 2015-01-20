var winston = require("winston"),
    helpers = require("./helpers");

var INDENT_CHARS = "|  ";

var indent = function(n) {
    return Array(n + 1).join(INDENT_CHARS);
};

module.exports = function(options){

    var log = function() {
        var level = "info",
            msg = "",
            req = null;

        if(arguments.length === 1) {
            msg = arguments[0];
        }
        if(arguments.length >= 2) {
            level = arguments[0];
            msg = arguments[1];
        }
        if(arguments.length >= 3) {
            req = arguments[2];
        }
        var message = ((req && req.id) ? " REQ_ID:" + req.id:"") + ": " + msg;
        winston.log(level, message);
    };

    var transformer = function(req, res) {

        var addMatchers = function(matchers,tabs){
            if(tabs === undefined) tabs = 0;
            var prefix = indent(tabs);
            var message = "";
            if(matchers.length > 0) message += prefix + "MATCHERS:\n";
            for(var matcherIndex = 0; matcherIndex < matchers.length; matcherIndex++) {
                var matcher = matchers[matcherIndex];
                message += prefix + indent(1) + "Matcher #" + matcherIndex + " (" + (matcher.applied ? "" : "NOT ") + "APPLIED)\n";
                message += matcher.type ? prefix + indent(2) + "Type: " + matcher.type + "\n" : "";
                message += prefix + indent(2) + "Value: " + matcher.value + "\n";
                message += matcher.pattern ? prefix + indent(2) + "Pattern: " + matcher.pattern + "\n" : "";
                message += matcher.error ? prefix + indent(2) + "Error: " + matcher.error + "\n" : "";
                if(matcher.childrens && matcher.childrens.length > 0) {
                    message += prefix + indent(2) + "Childrens:\n";
                    message += addMatchers(matcher.childrens, tabs + 3);
                }
            }
            return message;
        };

        var addTransformers = function(transformers) {
            var message = "";
            if(transformers.length > 0) message += indent(3) + "TRANSFORMERS:\n";
            for(var currentTransformerIndex = 0; currentTransformerIndex < transformers.length; currentTransformerIndex++) {
                var currentTransformer = transformers[currentTransformerIndex];
                message += indent(4) + "Transformer #" + transformerIndex + "\n";
                message += currentTransformer.type ? indent(5) + "Type: " + currentTransformer.type + "\n" : "";
                message += indent(5) + "Original Value: " + currentTransformer.original_value + "\n";
                message += indent(5) + "Transformed Value: " + currentTransformer.transformed_value + "\n";
                message += currentTransformer.pattern ? indent(5) + "Pattern: " + currentTransformer.pattern + "\n" : "";
                message += currentTransformer.error ? indent(5) + "Error: " + currentTransformer.error + "\n" : "";
            }
            return message;

        }

        var message = ((req && req.id) ? " REQ_ID:" + req.id:"") + "\n";
        message += indent(1) + "TRANSFORMING " + req.protocol + '://' + req.get('host') + req.originalUrl + " => "  + helpers.getTransformedUrl(req) + "\n";

        if(req && req.transformedRequestParams && req.transformedRequestParams.history && req.transformedRequestParams.history.length > 0) {
            message += indent(1) + "REQUEST TRANSFORMS:\n";

            for(var requestTransformerIndex = 0; requestTransformerIndex < req.transformedRequestParams.history.length; requestTransformerIndex++) {
                var requestTransformer = req.transformedRequestParams.history[requestTransformerIndex];
                message += indent(2) + "TRANSFORMER '" + requestTransformer.name + "' (" + (requestTransformer.applies ? "" : "NOT ") + "APPLIED)\n";
                message += indent(3) + "TARGET: " + (requestTransformer.target ? requestTransformer.target : "not specified") + "\n";

                message += addMatchers(requestTransformer.matchers, 3);
                message += addTransformers(requestTransformer.transformers);
                message += indent(3) + "\n";
            }

        }

        if(res && res.transformedResponseParams && res.transformedResponseParams.history && res.transformedResponseParams.history.length > 0) {
            message += indent(1) + "RESPONSE TRANSFORMS:\n";

            for(var transformerIndex = 0; transformerIndex < res.transformedResponseParams.history.length; transformerIndex++) {
                var transformer = res.transformedResponseParams.history[transformerIndex];
                message += indent(2) + "TRANSFORMER '" + transformer.name + "' (" + (transformer.applies ? "" : "NOT ") + "APPLIED)\n";

                message += addMatchers(transformer.matchers, 3);
                message += addTransformers(transformer.transformers);
                message += indent(3) + "\n";
            }
        }

        return winston.log("info",message);
    };

    return {
        "log":log,
        "transformer":transformer
    }
};