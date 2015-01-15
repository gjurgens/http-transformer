var http = require('http');
http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<html><body>\n<h1 class="foo">Test Response</h1>\n<pre>request successfully proxied: ' + req.headers['host'] + "|" + req.url + '\n' + JSON.stringify(req.headers, true, 2) + "</pre>\n</pre></body></body></html>");
    res.end();
}).listen(9000);