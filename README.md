# 牛马鼓励器

中文纯静态网页：原创小灰驴动画、下班倒计时、工时进度、工资估算和奖励目标。由 dot 编写、测试和整理自部署版本。

## 运行要求

- 无后端、数据库、API 密钥或构建步骤。发布 `dist/` 全部文件即可。
- 网页通过 HTTP/HTTPS 访问，不要直接双击 `index.html`，浏览器会限制本地 ES 模块。
- 只有运行测试需要 Node.js 20 或更新版本，不需要 `npm install`。

## Docker

在项目目录执行：

```sh
docker compose up -d --build
docker compose ps
curl -I http://127.0.0.1:8080/
```

访问 `http://127.0.0.1:8080/`。默认只绑定服务器本机，适合放在现有 HTTPS 反向代理后，不会自动暴露公网。更新代码后再次运行第一条命令；停止用 `docker compose down`。

后续自行部署到 Oracle 云时，只需普通 Linux 主机及 Docker，或已有 Nginx。域名、HTTPS、访问控制、OCI 安全列表及主机防火墙由部署者按需配置，本项目不会修改它们。新自部署站点不会继承原托管站点的私有访问控制，需要私有访问时应自行加认证。

## 普通 Nginx

将 `dist/` 内容放到站点目录，使用或参考 `deploy/nginx.conf`，调整其中的 `root`、监听端口和域名。重载前先运行 `nginx -t`。配置已显式声明 `.mjs` 的 JavaScript MIME 类型，避免模块被当作下载文件。

### 子路径，例如 `/workday/`

将 `dist/` 内容放到 Nginx 站点根目录下的 `workday/` 文件夹。首页、CSS、图标、脚本及模块导入均使用相对路径，无需改源码。访问地址应带末尾斜线：`https://你的域名/workday/`。

可在现有 server 中配置：

```nginx
location = /workday { return 301 /workday/; }
location /workday/ { try_files $uri $uri/ =404; }
```

这里采用目录部署，不使用 SPA 回退，也不应把不存在的 `.mjs` 请求重写为首页。现有 Nginx 的 MIME 配置必须支持 `mjs`。子路径相对资源引用已做静态检查；本轮实际子路径浏览器访问受环境限制，未完成运行验证。

## 数据与估算

- 工资、班表、奖励及动画偏好只保存在当前浏览器的 localStorage。无上传接口、统计脚本、第三方资源或工资传输请求。
- 仓库只含虚构演示值和测试数据，不含浏览器保存的个人设置。首次演示月薪 12000 元，不是用户真实工资。
- 同一 origin 下不同路径共享 localStorage；如需相互隔离的多个实例，请使用不同子域名。换域名、浏览器或清除站点数据后需重新设置。
- 金额均为估算，不代表考勤、实际到账、存款或税后工资。未处理法定节假日、调休、请假、税费与奖金。
- 默认尊重系统“减少动态效果”，用户可手动播放或暂停，仅影响此网页。暂停动画不影响计时和收入估算。

## 测试

```sh
npm test
TZ=Asia/Shanghai node --test time.test.mjs
TZ=America/New_York node --test time.test.mjs
```

测试覆盖跨午夜和跨月班次、休息时间、无效输入、动画偏好、巡回连续性、固定腿长与完整蹄底接地锁定。源码已做真实浏览器整轮连续动画与窄屏检查。Docker/Nginx 配置尚未在此环境启动验证，部署者应先运行上述启动和 `nginx -t` 检查。

## 文件

- `dist/`：可直接发布的完整网页源码。
- `*.test.mjs`：无外部依赖的测试。
- `deploy/nginx.conf`、`Dockerfile`、`compose.yaml`：可选部署配置。

自部署版本由 dot 整理：保留浏览器本地估算和原创动画，移除原托管平台身份配置，增加独立静态部署配置及测试说明。
