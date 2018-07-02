#!/usr/bin/env node
const express = require('express');
const http = require('http');
const FileUpload = require('../lib/server/index.js');

const app = express();
const port = 8888;

app.use(FileUpload({
        'prefix' : '/upload/',
        'uploadDir' : '/data/put_upload_files_here'
 }));

const server = http.createServer(app);

server.listen(port, function () {
    console.log('Express server listening on port ' + port);
});