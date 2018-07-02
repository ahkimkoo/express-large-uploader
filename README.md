#大文件上传控件使用帮助

基于express的大文件上传组件，使用HTML5 的File API对文件分片上传到服务端，支持断点续传。

## 服务端

安装模块

```bash
npm install express-large-uploader --save
```

在express中引入模块

```javascript
const FileUpload = require('express-large-uploader');
app.use(FileUpload({
        'prefix' : '/upload/',
        'uploadDir' : '/data/put_upload_files_here'
 }))
```
其中prefix是url前缀，主要是前端js引用时用到, uploadDir是上传的文件存放位置

## 前端

在页面尾部中引入js
```html
<script type="text/javascript" src="/upload/file-upload.js"></script>
```
路径中的upload对应的就是服务端设置的prefix

页面中使用控件：

```html
<input type="text" name="file" id="file"/>
<input type="button" name="tg" id="tg" value="上传大文件" upload-ref="#file" upload-conf-keepname="false" />
```
有upload-ref属性的元素点击事件会触发文件上传的动作，upload-ref的值就是上传结果（文件名）存放的元素（一般是文本表单,不要使用file类型）。upload-conf-keepname表示上传时是否保持文件名，如果为false上传时将md5 hash作为文件名。

打开前端示例：/upload/client/file-upload-demo.html
