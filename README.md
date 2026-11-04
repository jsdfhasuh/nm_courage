# 牛马鼓励器

中文纯静态网页：原创小灰驴动画、鼠标萝卜互动、下班倒计时、工时进度、工资估算和奖励目标。由 dot 编写、测试和整理自部署版本。

## 运行要求

- 无后端、数据库、API 密钥或构建步骤。发布 `dist/` 全部文件即可。
- 网页通过 HTTP/HTTPS 访问，不要直接双击 `index.html`，浏览器会限制本地 ES 模块。
- 运行测试需要 Node.js 20 或更新版本及 `jq`（用于容器配置生成器回归），不需要 `npm install`。网页访问本身不需要这些工具。

## Docker

在项目目录执行：

```sh
docker compose up -d --build
docker compose ps
curl -I http://127.0.0.1:8080/
```

访问 `http://127.0.0.1:8080/`。默认只绑定服务器本机，适合放在现有 HTTPS 反向代理后，不会自动暴露公网。更新代码后再次运行第一条命令；停止用 `docker compose down`。

后续自行部署到 Oracle 云时，只需普通 Linux 主机及 Docker，或已有 Nginx。域名、HTTPS、访问控制、OCI 安全列表及主机防火墙由部署者按需配置，本项目不会修改它们。新自部署站点不会继承原托管站点的私有访问控制，需要私有访问时应自行加认证。

### 容器环境变量默认值

容器每次启动时生成 `runtime-config.json`，只包含下面白名单变量的有效值。镜像不用重新构建；改变变量后重新创建容器，再刷新页面即可。优先级是 **浏览器已保存的有效设置 > 容器默认值 > 程序内置演示值**。容器变量不会反复覆盖用户在网页上保存的设置。

支持的变量（空值或未设置时使用内置默认）：

| 变量 | 内置默认 | 格式 |
| --- | --- | --- |
| `NM_SALARY_TYPE` | `monthly` | `monthly` 月薪或 `daily` 日薪 |
| `NM_SALARY` | `12000` | 大于 0、不超过 10 亿的十进制金额 |
| `NM_WORK_START` | `09:00` | `HH:mm` |
| `NM_WORK_END` | `18:00` | `HH:mm`，可早于上班时间表示跨午夜 |
| `NM_BREAK_ENABLED` | `true` | `true` / `false` |
| `NM_BREAK_START` | `12:00` | `HH:mm` |
| `NM_BREAK_END` | `13:30` | `HH:mm` |
| `NM_WORKDAYS` | `1,2,3,4,5` | 逗号分隔的 `0`–`6`，`0` 表示周日 |
| `NM_GOAL_NAME` | `一杯好喝的奶茶` | 非空名称，最多 24 个字符 |
| `NM_GOAL_PRICE` | `25` | 大于 0、不超过 10 亿的十进制金额 |

示例值仅用于演示，不代表个人真实工资：

```sh
docker run -d --name nm-courage --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -e NM_SALARY=15000 \
  -e NM_WORK_START=09:30 -e NM_WORK_END=18:30 \
  -e NM_BREAK_START=12:00 -e NM_BREAK_END=13:00 \
  -e NM_WORKDAYS=1,2,3,4,5 \
  -e NM_GOAL_NAME='一杯咖啡' -e NM_GOAL_PRICE=30 \
  ghcr.io/jsdfhasuh/nm_courage:latest
```

项目 `compose.yaml` 已映射这些变量，可通过宿主机环境或自行创建且不提交的 `.env` 提供。更新后执行 `docker compose up -d --force-recreate`，只执行 `docker compose restart` 不会重新读取已修改的 Compose 环境变量。已有容器名称冲突时，请自行安排停止和替换。

上下班不能相同；启用午休时，休息必须完整位于班次内且不能覆盖整个班次。例如夜班 `22:00`–`06:00` 需要同时把休息改为 `01:00`–`01:30`，或设置 `NM_BREAK_ENABLED=false`。非法环境变量会让容器明确报错并停止启动，不会静默采用错误工资；错误日志只列变量名，不打印其值。非 Docker 静态部署仍直接使用 `dist/`：其配置文件默认为 `{}`，配置缺失、格式错误或读取超时也不会阻止网页启动，会回退内置默认值。

已有浏览器设置不会随变量变化而被清空。可在“我的设置”中点击 **恢复站点默认值** 并确认，只移除本应用保存的薪资、班表和奖励目标，动画与专注偏好及同域其他数据不受影响。浏览器拒绝存储操作时，界面会说明只能在当前页面应用。

**隐私：这些默认值会发送给所有能访问网页的人。不要放密码、Token 或其他秘密；网页公开时也不建议把真实工资设为站点默认。** 生成器不会导出其他环境变量。用户后来在网页里填写的个人设置仍只保存在该浏览器，不会上传到服务器，也不会进入公开镜像。当前时间仍采用访问者浏览器时区，容器的 `TZ` 不会改变网页计时。

配置以 JSON 编码并通过 `Cache-Control: no-store` 提供，不把变量拼接成可执行脚本。它写入 `/tmp/nm-courage/`，不改镜像静态目录。支持非 root UID 和只读根文件系统，但必须保留可写 `/tmp`，例如额外添加：

```sh
--user 10001:10001 --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m,mode=1777
```

同一容器重启会重新生成配置；更改 UID、环境变量或 tmpfs 配置时应重新创建容器。此功能只更新本仓库的自部署网页与镜像，不会同步更新其他已托管站点。

### GitHub Actions 定时构建镜像

工作流：[`Build Docker images`](https://github.com/jsdfhasuh/nm_courage/actions/workflows/docker-build.yml)。配置文件为 `.github/workflows/docker-build.yml`，由 dot 编写和推送。

- 每天北京时间 **04:00** 运行，对应 UTC 的 `0 20 * * *`。定时任务只在默认分支上运行，工作流必须位于 `main` 才会生效。
- 也可在仓库 **Actions → Build Docker images → Run workflow** 手动构建。Dockerfile、部署配置或工作流变更推到 `main` 时会立即构建验证；相关 Docker、网页、测试或工作流文件的 PR 也会执行验证，普通无关提交不会触发。
- 先跑完整 Node.js 测试及上海、纽约时区测试，再用原有 Dockerfile 分别构建 **linux/amd64** 和 **linux/arm64**。普通 Intel/AMD 服务器选 amd64，Oracle Ampere A1 等 ARM 服务器选 arm64。
- 每个架构使用原生 GitHub runner，构建时拉取 `nginx:1.28-alpine` 的当前基础镜像，并按架构缓存构建层。镜像含源码 commit、版本和构建时间标签。同一源码重新构建可能包含更新后的基础镜像。
- 每个镜像都会实际启动，检查 Nginx 配置、首页、JavaScript MIME、静态资源、缺失文件 404 和容器健康检查；并验证变量覆盖、安全 JSON、非法变量拒绝、同镜像更换变量，以及非 root UID + 只读根 + tmpfs 的运行。只有通过检查才上传镜像产物。
- 不需要自建密钥。构建、PR 和匿名验证 job 仅申请 `contents: read`；只有受信任 `main` 的独立发布 job 增加 `packages: write`，使用本次运行的临时 `GITHUB_TOKEN` 发布到 GHCR。外部 Actions 固定到完整 commit SHA，不自动更新服务器。

**从公开 GHCR 拉取镜像**

仓库的定时、手动及受限 `main` push 运行，在两架构构建与容器测试都通过后，会把同一批已测试的镜像发布为：

- `ghcr.io/jsdfhasuh/nm_courage:latest`：当前发布版本，Docker 根据主机自动选择 amd64 或 arm64。
- `ghcr.io/jsdfhasuh/nm_courage:sha-<完整40位commit>`：追踪源码版本；同一源码的每日构建仍可能更新基础镜像。
- `ghcr.io/jsdfhasuh/nm_courage:build-<run_id>-<run_attempt>`：追踪某次构建；需要精确固定镜像时，使用 Actions Summary 中的 `@sha256:…` digest。

PR、非 `main` 手动运行和其他仓库的 fork 不会发布。发布 job 复用通过 checksum 和容器测试的镜像产物，不会测试后重新构建另一份镜像；同时防止旧 `main` 覆盖新版本的 `latest`。重试较早的同源码构建时，如果已有更新的构建发布，只补充该次构建标签，不回退 `latest` 或源码标签。

**首次发布注意：GHCR 新 package 通常默认为 Private，不会因为源码仓库公开而自动公开。** 首次镜像推送成功后，由仓库所有者在 GitHub 个人主页的 **Packages → nm_courage → Package settings → Change visibility → Public** 完成公开设置，再在 Actions 中 **Re-run failed jobs**。此设置不需要新增 PAT 或其他长期凭据。工作流只有在无 registry 登录的干净 Docker 配置下，确认公开多架构 manifest，并分别实际匿名拉取、启动两架构镜像后，才会显示匿名验证成功；仅发布 job 成功不代表公开可拉取。

公开验证成功后，任何人都能读取和下载这个镜像，无需 GitHub 登录：

```sh
docker pull ghcr.io/jsdfhasuh/nm_courage:latest
docker run -d --name nm-courage --restart unless-stopped \
  -p 127.0.0.1:8080:8080 ghcr.io/jsdfhasuh/nm_courage:latest
curl -I http://127.0.0.1:8080/
```

这不会自动部署或升级已有容器；已有同名容器时，应先自行安排停止和替换。服务仍默认只绑定本机端口。

**离线下载并运行镜像产物**

1. 打开一次成功的 Actions 运行，在 Summary 底部的 **Artifacts** 下载 `nm-courage-linux-amd64-…` 或 `nm-courage-linux-arm64-…`。下载需要登录有仓库读取权限的 GitHub 账号。
2. 解压 ZIP，得到镜像 `.tar.gz`、`SHA256SUMS` 和 `image-info.txt`。产物保留 **7 天**，过期后可重新手动构建。PR 的产物用于验证；日常部署选 `main` 的定时或手动运行。
3. 在解压后的目录校验并加载。以下为 amd64 示例，ARM 主机将两处 `amd64` 改为 `arm64`：

```sh
sha256sum -c SHA256SUMS
docker load -i nm-courage-linux-amd64.tar.gz
docker run -d --name nm-courage --restart unless-stopped \
  -p 127.0.0.1:8080:8080 nm-courage:latest-amd64
curl -I http://127.0.0.1:8080/
```

离线镜像同时含 `nm-courage:sha-<前12位commit>-<架构>` 标签，完整 commit、镜像 ID 和本次运行地址见 `image-info.txt`。本地 `latest-amd64` / `latest-arm64` 只是下载产物的便捷标签；远程拉取应使用上面的完整 `ghcr.io/jsdfhasuh/nm_courage:latest` 地址。`docker load` 不会更新正在运行的容器。

GitHub 定时任务可能延迟或在繁忙时被跳过，不保证准点。公开仓库长期（60 天）无活动时定时工作流可能被自动停用，可在 Actions 重新启用。修改时间时注意 cron 使用 UTC。

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

## 鼠标萝卜

电脑上将鼠标移入小驴画面，鼠标尖端会变成萝卜，小驴会平滑转向追随并在附近停下。移出画面后恢复自动巡逻或待机，不需要点击或拖拽。顶部与边缘会调整萝卜朝向，但尖端仍跟着真实鼠标位置。

暂停、页面失焦、打开设置时恢复系统光标并停止追逐。触屏和窄屏保持自动动画，不捕获触摸或阻止滚动。休息时也可主动逗小驴，工资与工时仍按原班表计算。默认减少动态设置下不会追逐，用户主动选择播放后才可互动。

## 数据与估算

- 用户在网页里填写和保存的工资、班表、奖励及动画偏好只保存在当前浏览器的 localStorage。无个人设置上传接口、统计脚本或第三方资源；部署者配置的容器默认值会从服务器发送给访问者，应按公开配置对待。
- 仓库只含虚构演示值和测试数据，不含浏览器保存的个人设置。未配置容器默认值时，内置演示月薪为 12000 元，不是用户真实工资。
- 同一 origin 下不同路径共享 localStorage；如需相互隔离的多个实例，请使用不同子域名。换域名、浏览器或清除站点数据后需重新设置。
- 金额均为估算，不代表考勤、实际到账、存款或税后工资。未处理法定节假日、调休、请假、税费与奖金。
- 默认尊重系统“减少动态效果”，用户可手动播放或暂停，仅影响此网页。暂停动画不影响计时和收入估算。

## 测试

```sh
npm test
TZ=Asia/Shanghai node --test time.test.mjs
TZ=America/New_York node --test time.test.mjs
```

测试覆盖跨午夜和跨月班次、休息时间、无效输入、动画偏好、鼠标交互条件、巡回/追逐连续性、急反向、多帧率、固定腿长与完整蹄底接地锁定；新增运行时配置的校验、安全编码、白名单、默认值优先级、存储兼容及确认重置回归。Docker 工作流会对每个架构执行两个 smoke-test 脚本，以对应 Actions 运行结果为准；部署时仍应检查实际主机的端口、反向代理及 HTTPS 配置。

## 文件

- `dist/`：可直接发布的完整网页源码。
- `*.test.mjs`：无 npm 依赖的测试，环境变量生成器测试另需 `jq`。
- `deploy/nginx.conf`、`Dockerfile`、`compose.yaml`：可选部署配置。
- `.github/workflows/docker-build.yml`：定时、手动及 PR 镜像构建。
- `.github/scripts/smoke-test-image.sh`：容器 HTTP 与健康检查。
- `.github/scripts/smoke-test-runtime-config.sh`：容器变量与只读/非 root 运行检查。
- `deploy/40-runtime-config.sh`、`deploy/runtime-config.jq`：启动时白名单配置生成器。
- `dist/runtime-config.mjs`、`dist/runtime-config.json`：网页默认值读取、校验与静态部署回退。

自部署版本由 dot 整理：保留浏览器本地估算和原创动画，移除原托管平台身份配置，增加独立静态部署配置及测试说明。

