const path = require('path');
let formidable = require('formidable');
let fs = require('fs-extra');
let concat = require('concat-files');
const express = require('express');
const Router = express.Router;

module.exports = (options) => {
    options = options || {};
    
    let router = Router();
    let prefix = options.prefix || '/file-upload/';
    if(!prefix.endsWith('/'))prefix += '/';
    let uploadDir = options.uploadDir || '/tmp';
    let uploadTempDir = options.uploadTempDir || path.resolve(uploadDir, 'tmp');
    
    // 检查文件的MD5
    router.get(prefix+'check-file', (req, resp) => {
        let query = req.query;
        let fileName = query.fileName;
        let fileMd5Value = query.fileMd5Value;
        // 获取文件Chunk列表
        getChunkList(
            path.join(uploadDir, fileName),
            path.join(uploadDir, fileMd5Value),
            data => {
                resp.send(data);
            }
        )
    });

    router.all(prefix+'merge-file', (req, resp) => {
        let query = req.query;
        let md5 = query.md5;
        let size = query.size;
        let fileName = query.fileName;
        //logger.debug(md5, fileName);
        mergeFiles(path.join(uploadTempDir, md5), uploadDir, fileName, size);
        resp.send({
            stat: 1
        });
    });

    router.all(prefix+'upload-file', (req, resp) => {
        let form = new formidable.IncomingForm({
            'uploadDir': uploadTempDir
        })

        form.parse(req, function(err, fields, file) {
            let index = fields.index;
            let total = fields.total;
            let fileMd5Value = fields.fileMd5Value;
            let folder = path.resolve(__dirname, uploadTempDir, fileMd5Value);
            folderIsExit(folder).then(val => {
                let destFile = path.resolve(folder, fields.index);
                copyFile(file.data.path, destFile).then(
                    successLog => {
                        resp.send({
                            stat: 1,
                            desc: index
                        });
                    },
                    errorLog => {
                        resp.send({
                            stat: 0,
                            desc: 'Error'
                        });
                    }
                )
            })
        });
    });

    //这个仅用来测试
    router.get(prefix+'client/*',(req,res)=>{
        let file = path.normalize(__dirname +path.sep+ '..' + path.sep + req.originalUrl.replace(prefix,''));
        let file_exist = fs.pathExistsSync(file);
        if(file_exist){
            if(file.endsWith('.js')){
                let file_data = fs.readFileSync(file);
                file_data = file_data.toString().replace('<%=UPLOAD_URL%>',prefix);
                res.send(file_data);
            }else res.sendFile(file);
        }else{
            res.status(404).send(req.originalUrl+' Not found');
        }
    });

    //js css 合并加载
    router.get(prefix+'file-upload.js',(req,res)=>{
        let spark_content = fs.readFileSync(path.resolve(__dirname,'..','client','spark-md5.min.js'));
        let axios_content = fs.readFileSync(path.resolve(__dirname,'..','client','axios.min.js'));
        let css_content = fs.readFileSync(path.resolve(__dirname,'..','client','file-upload.css'));
        let core_content = fs.readFileSync(path.resolve(__dirname,'..','client','file-upload.js'));

        let merged_content = `${spark_content.toString()}\n\n${axios_content.toString()}\n\nvar upload_file_pre_css = '${css_content.toString('base64')}';\n\nvar UPLOAD_URL_PRE = '${prefix}';\n\n${core_content.toString()}`;
        res.setHeader('content-type', 'text/javascript');
        res.send(merged_content);
    });

    // 文件夹是否存在, 不存在则创建文件
    function folderIsExit(folder) {
        //logger.debug('folderIsExit', folder);
        return new Promise(async(resolve, reject) => {
            let result = await fs.ensureDirSync(path.join(folder));
            //logger.debug('result----', result);
            resolve(true);
        })
    }


    // 把文件从一个目录拷贝到别一个目录
    function copyFile(src, dest) {
        let promise = new Promise((resolve, reject) => {
            fs.rename(src, dest, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve('copy file:' + dest + ' success!');
                }
            })
        })
        return promise;
    }


    // 获取文件Chunk列表
    async function getChunkList(filePath, folderPath, callback) {
        let isFileExit = await isExist(filePath);
        let result = {}
            // 如果文件(文件名, 如:node-v7.7.4.pkg)已在存在, 不用再继续上传, 真接秒传
        if (isFileExit) {
            result = {
                stat: 1,
                file: {
                    isExist: true,
                    name: filePath
                },
                desc: 'file is exist'
            }
        } else {
            let isFolderExist = await isExist(folderPath);
            //logger.debug(folderPath);
            // 如果文件夹(md5值后的文件)存在, 就获取已经上传的块
            let fileList = [];
            if (isFolderExist) {
                fileList = await listDir(folderPath);
            }
            result = {
                stat: 1,
                chunkList: fileList,
                desc: 'folder list'
            }
        }
        callback(result);
    }

    // 文件或文件夹是否存在
    function isExist(filePath) {
        return new Promise((resolve, reject) => {
            fs.stat(filePath, (err, stats) => {
                // 文件不存在
                if (err && err.code === 'ENOENT') {
                    resolve(false);
                } else {
                    resolve(true);
                }
            })
        })
    }

    // 列出文件夹下所有文件
    function listDir(path) {
        return new Promise((resolve, reject) => {
            fs.readdir(path, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                // 把mac系统下的临时文件去掉
                if (data && data.length > 0 && data[0] === '.DS_Store') {
                    data.splice(0, 1);
                }
                resolve(data);
            })
        })
    }
    // 合并文件
    async function mergeFiles(srcDir, targetDir, newFileName, size) {
        // logger.debug(...arguments);
        let targetStream = fs.createWriteStream(path.join(targetDir, newFileName));
        let fileArr = await listDir(srcDir);
        // 把文件名加上文件夹的前缀
        for (let i = 0; i < fileArr.length; i++) {
            fileArr[i] = srcDir + '/' + fileArr[i];
        }
        //logger.debug(fileArr);
        concat(fileArr, path.join(targetDir, newFileName), () => {
            //logger.debug('Merge Success!');
        })
    }
    
    return router;
};