class FileUpLoader {
    constructor(baseUrl, config) {
        this.config = Object.assign({
            'chunkSize': 4 * 1024 * 1024,
            'generateFileName': false
        }, config);
        this.baseUrl = baseUrl;
        this.checkFileProgress = null;
        this.uploadFileProgress = null;
        this.uploadFinish = null;
    }

    onCheckFileProgress(fn) {
        this.checkFileProgress = fn;
    }

    onUploadFileProgress(fn) {
        this.uploadFileProgress = fn;
    }

    onUploadFinish(fn) {
        this.uploadFinish = fn;
    }

    genFileName(fileMd5Value) {
        if (this.config['generateFileName']) {
            this.uploadFileName = fileMd5Value + this.file.name.substring(this.file.name.lastIndexOf('.'));
        } else {
            this.uploadFileName = this.file.name;
        }
    }

    md5File() {
        let self = this;
        return new Promise((resolve, reject) => {
            let blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
            let chunkSize = self.file.size / 100;
            let chunks = 100;
            let currentChunk = 0;
            let spark = new SparkMD5.ArrayBuffer();
            let fileReader = new FileReader();

            fileReader.onload = function(e) {
                //console.log('read chunk nr', currentChunk + 1, 'of', chunks);
                spark.append(e.target.result); // Append array buffer
                currentChunk++;
                if (currentChunk < chunks) {
                    loadNext();
                } else {
                    let cur = +(new Date())
                        //console.log('finished loading');
                    let result = spark.end();
                    resolve(result);
                }
            };

            fileReader.onerror = function(err) {
                console.warn('oops, something went wrong.');
                reject(err);
            };

            let loadNext = function() {
                let start = currentChunk * chunkSize,
                    end = ((start + chunkSize) >= self.file.size) ? self.file.size : start + chunkSize;
                fileReader.readAsArrayBuffer(blobSlice.call(self.file, start, end));
                if (self.checkFileProgress) self.checkFileProgress(currentChunk + 1);
            }
            loadNext();
        });
    }

    checkFileMD5(fileMd5Value) {
        return new Promise((resolve, reject) => {
            let url = this.baseUrl + 'check-file?fileName=' + this.file.name + "&fileMd5Value=" + fileMd5Value;
            axios.get(url)
                .then(function(response) {
                    let json = typeof response['data'] == 'object' ? response['data'] : JSON.parse(response['data']);
                    resolve(json)
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }

    async checkAndUploadChunk(fileMd5Value, uploadedChunkList) {
        let chunks = Math.ceil(this.file.size / this.config.chunkSize);
        let hasUploaded = uploadedChunkList.length;
        for (let i = 0; i < chunks; i++) {
            let exit = uploadedChunkList.indexOf(i + "") > -1;
            // 如果已经存在, 则不用再上传当前块
            if (!exit) {
                let index = await this.uploadFile(i, fileMd5Value, chunks);
                hasUploaded++;
                let radio = Math.floor((hasUploaded / chunks) * 100);
                if (this.uploadFileProgress) this.uploadFileProgress(radio);
            }
        }
    }

    uploadFile(i, fileMd5Value, chunks) {
        return new Promise((resolve, reject) => {
            let end = (i + 1) * this.config.chunkSize >= this.file.size ? this.file.size : (i + 1) * this.config.chunkSize;
            let form = new FormData();
            form.append("data", this.file.slice(i * this.config.chunkSize, end)); //file对象的slice方法用于切出文件的一部分
            form.append("total", chunks); //总片数
            form.append("index", i); //当前是第几片     
            form.append("fileMd5Value", fileMd5Value);

            axios.post(this.baseUrl + 'upload-file', form, {
                    'headers': {
                        'Content-Type': 'multipart/form-data'
                    }
                })
                .then(function(response) {
                    let json = typeof response['data'] == 'object' ? response['data'] : JSON.parse(response['data']);
                    resolve(json['desc']);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }

    mergeChunkOnServer(fileMd5Value) {
        let url = this.baseUrl + 'merge-file?md5=' + fileMd5Value + "&fileName=" + this.uploadFileName + "&size=" + file.size;
        return axios.get(url);
    }

    async upload() {
        try {
            let fileMd5Value = await this.md5File(this.file);

            this.genFileName(fileMd5Value);

            let result = await this.checkFileMD5(fileMd5Value);
            if (result.file) {
                console.log('file exists on server');
            } else {
                let uploadedChunkList = result.chunkList;
                await this.checkAndUploadChunk(fileMd5Value, uploadedChunkList);
                await this.mergeChunkOnServer(fileMd5Value);
            }
            if (this.uploadFinish) this.uploadFinish(null, this.uploadFileName);
            return this.uploadFileName;
        } catch (err) {
            if (this.uploadFinish) this.uploadFinish(err);
            return err;
        }
    }

    async fire(file) {
        this.file = file;
        this.upload();
    }

}

var decodeJss = function(val_name) {
    if (typeof window[val_name] != 'undefined') {
        let style_ele = createElement('style', atob(window[val_name]), {
            'type': 'text/css'
        });
        document.getElementsByTagName('head')[0].appendChild(style_ele);
    }
}

var createElement = function(type, html, attrs) {
    var ele = document.createElement(type);
    if (html) {
        if (Array.isArray(html)) {
            if (typeof html[0] == 'object') {
                for (let t of html) {
                    ele.appendChild(t);
                }
            } else ele.innerHTML = html.join('');
        } else {
            if (typeof html == 'object') ele.appendChild(html);
            else ele.innerHTML = html;
        }
    }
    if (attrs) {
        for (var a in attrs) {
            if (attrs.hasOwnProperty(a)) ele.setAttribute(a, attrs[a]);
        }
    }
    return ele;
}


var getElementAbsPos = function(e) {
    var t = e.offsetTop;
    var l = e.offsetLeft;
    while (e = e.offsetParent) {
        t += e.offsetTop;
        l += e.offsetLeft;
    }

    return {
        left: l,
        top: t
    };
}

var getUploadContainer = function(id, ref_ele) {
    let container = document.getElementById(id);
    let file_field, progress_bar;
    if (container) {
        file_field = container.querySelector('.uploadfile_filed');
        progress_bar = container.querySelector('.uploadfile_progress_bar');
    } else {
        progress_bar = createElement('div', '0%', {
            'class': 'uploadfile_progress_bar'
        });
        let progress = createElement('div', progress_bar, {
            'class': 'uploadfile_progress'
        });
        file_field = createElement('input', '', {
            'type': 'file',
            'class': 'uploadfile_filed'
        });
        container = createElement('div', [file_field, progress], {
            'class': 'uploadfile_container',
            'id': id
        });
        document.body.appendChild(container);

    }

    container.style.top = (getElementAbsPos(ref_ele).top + ref_ele.offsetHeight) +'px';
    console.log(getElementAbsPos(ref_ele).top + ref_ele.offsetHeight, container.style.top);

    return {
        'container': container,
        'file_field': file_field,
        'progress_bar': progress_bar
    }
}

const UPLOAD_URL = typeof window['UPLOAD_URL_PRE'] == 'undefined' ? '/upload/' : window['UPLOAD_URL_PRE'];

var all_triggers = document.querySelectorAll('*[upload-ref]');

for (let t of all_triggers) {
    (function(tg) {
        tg.addEventListener('click', function(e) {
            let trigger = e.target;
            let upload_ref = trigger.getAttribute('upload-ref');
            let output_field = document.querySelector(upload_ref);
            if (!output_field) output_field = document.querySelector('#' + upload_ref);
            if (output_field) {
                let container = getUploadContainer(btoa(upload_ref).replace('=', '_'), trigger);

                let conf_keep_name = trigger.getAttribute('upload-conf-keepname').toLowerCase();
                let cfg = {
                    'generateFileName': (!conf_keep_name || conf_keep_name == 'false' || conf_keep_name == 'no' || conf_keep_name == '0')
                };

                let fileUpLoader = new FileUpLoader(UPLOAD_URL, cfg);
                fileUpLoader.onCheckFileProgress(function(val) {
                    container['progress_bar'].style.width = val + '%';
                    container['progress_bar'].innerText = '检测文件：' + val + '%';
                });

                fileUpLoader.onUploadFileProgress(function(val) {
                    container['progress_bar'].style.width = val + '%';
                    container['progress_bar'].innerText = '上传文件：' + val + '%';
                });

                fileUpLoader.onUploadFinish(function(err, filename) {
                    if (err) {
                        container['progress_bar'].innerText = '上传失败';
                    } else {
                        container['progress_bar'].style.width = '100%';
                        container['progress_bar'].innerText = '上传完成';
                        output_field.value = filename;
                    }
                    setTimeout(function() {
                        container['container'].style.display = 'none';
                    }, 1500);
                });

                container['file_field'].addEventListener('change', function(e1) {
                    container['container'].style.display = 'block';
                    let file = e1.target.files[0];
                    fileUpLoader.fire(file);
                }, false);

                container['file_field'].click();
            }
        }, false);
    })(t);
}

decodeJss('upload_file_pre_css');