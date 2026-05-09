# 阿里云 ECS 部署指南（中科之家）

## 1. 服务器配置建议

| 项目 | 最低配置 | 推荐配置 |
|------|---------|----------|
| CPU | 2核 | 4核 |
| 内存 | 4GB | 8GB |
| 系统盘 | 40GB SSD | 80GB SSD |
| 操作系统 | CentOS 7.9+ / Alibaba Cloud Linux 3 |
| 带宽 | 3Mbps | 5Mbps+ |

## 2. 安全组配置（重要！）

进入阿里云控制台 → ECS → 安全组 → 配置规则 → 入方向 → 手动添加：

| 端口 | 协议 | 授权对象 | 说明 |
|------|------|----------|------|
| 22 | TCP | `0.0.0.0/0` | SSH 远程连接 |
| 80 | TCP | `0.0.0.0/0` | HTTP 网站访问 |
| 443 | TCP | `0.0.0.0/0` | HTTPS 加密访问 |
| 3000 | TCP | `127.0.0.1/32` | 后端 API（仅本机 Nginx 转发，绝不对外暴露）|
| 3306 | TCP | `127.0.0.1/32` | MySQL 数据库（仅本机访问，绝不对外暴露）|

> 端口 3000 和 3306 严禁设 `0.0.0.0/0`，否则你的数据库和 API 直接暴露在公网上，会被攻击。

出方向保持默认（全部允许）即可。

## 3. 完整部署流程

### 3.1 购买 ECS

- 地域选"华东1（上海）"——离目标用户近，你公司也在上海
- 镜像选 `Alibaba Cloud Linux 3`（推荐）或 `CentOS 7.9`
- 勾选"分配公网 IPv4 地址"
- 按量付费先测试，确定后再转包年包月

### 3.2 购买域名（推荐在阿里云万网）

- 建议 `hengtongzhijia.com` 或 `zk-health.com`
- 买完别忘做 ICP 备案（见第 5 节）

### 3.3 登录服务器

```bash
ssh root@<你的ECS公网IP>
```

### 3.4 安装 Node.js 18 LTS

```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
node -v   # 验证
npm -v
```

### 3.5 安装 MySQL 8.0

```bash
sudo yum install -y mysql-community-server --nogpgcheck
sudo systemctl start mysqld
sudo systemctl enable mysqld

# 获取初始临时密码
sudo grep 'temporary password' /var/log/mysqld.log

# 安全初始化（改密码、删匿名用户等）
sudo mysql_secure_installation
```

创建数据库和表：

```bash
mysql -u root -p
```

然后执行以下 SQL：

```sql
CREATE DATABASE IF NOT EXISTS hengtong CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hengtong;

CREATE TABLE IF NOT EXISTS franchise_leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL COMMENT '姓名',
  phone VARCHAR(20) NOT NULL COMMENT '联系电话',
  city VARCHAR(50) NOT NULL COMMENT '意向加盟城市',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  INDEX idx_created_at (created_at),
  INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='加盟招商线索';
```

### 3.6 上传项目文件

在本地 Windows 上（Git Bash）：

```bash
# 打包项目文件（不包括 node_modules 和大文件）
cd /d/work/trae/xuanchuan/qianduan
tar -czf deploy.tar.gz \
  index.html \
  admin.html \
  privacy.html \
  terms.html \
  robots.txt \
  sitemap.xml \
  images/ \
  server/ \
  --exclude='server/node_modules' \
  --exclude='*.pptx' \
  --exclude='ppt_content.txt' \
  --exclude='~$*'

# 上传到服务器
scp deploy.tar.gz root@<ECS公网IP>:/opt/

# SSH 登录服务器，创建目录并解压
ssh root@<ECS公网IP>
mkdir -p /opt/hengtong
cd /opt
tar -xzf deploy.tar.gz -C /opt/hengtong
```

### 3.7 配置环境变量

```bash
cd /opt/hengtong/server
cp .env.example .env
vim .env
```

`.env` 内容：

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你设置的MySQL密码
DB_NAME=hengtong
PORT=3000
ADMIN_KEY=hengtong2026   # 改成你自己的管理密钥
```

### 3.8 安装依赖并启动后端

```bash
cd /opt/hengtong/server
npm install --production

# 先测试一下能否启动
node server.js
# 看到 "服务已启动: http://localhost:3000" 后 Ctrl+C 退出
```

### 3.9 用 PM2 守护进程

```bash
sudo npm install -g pm2
pm2 start server.js --name zhongke-api
pm2 save
pm2 startup  # 按提示复制粘贴开机自启命令
```

### 3.10 安装 Nginx

```bash
sudo yum install -y nginx
sudo systemctl enable nginx
```

创建 `/etc/nginx/conf.d/zhongke.conf`：

```nginx
server {
    listen 80;
    server_name 你的域名.com www.你的域名.com;

    root /opt/hengtong;
    index index.html;

    # 前端静态页面
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反代到 Express（3000端口仅本机监听）
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

启动：

```bash
sudo nginx -t              # 检查配置
sudo systemctl start nginx
```

## 4. 无域名情况（仅 IP 访问）

Nginx 配置中 `server_name` 改为 `_`：

```nginx
server {
    listen 80;
    server_name _;
    root /opt/hengtong;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 5. 域名 + ICP 备案 + DNS 解析

### 域名购买

阿里云万网 → 注册 `.com` 域名 → 实名认证

### ICP 备案

阿里云免费代备案，登录阿里云 → 搜索"备案" → 开始备案。

需要准备：
- 营业执照（彩色扫描件）
- 法人身份证（正反面）
- 域名证书（万网控制台下载）
- 填写网站名称（建议"中科之家官网"，**不能用"中国""中华""全国"等字样**）

流程：阿里云初审（1个工作日）→ 短信核验（24小时内）→ 上海管局终审（7-10个工作日）。

### DNS 解析

备案通过后，阿里云控制台 → 云解析 DNS → 添加记录：

| 主机记录 | 类型 | 记录值 |
|----------|------|--------|
| `@` | A | ECS 公网 IP |
| `www` | A | ECS 公网 IP |

等几分钟生效，然后浏览器输入域名就能打开网站。

### 备案号更新

备案通过后会拿到类似 `沪ICP备XXXXXXXX号` 的编号，在 `index.html` 中搜索 `xxxxxxxx` 替换为实际编号。

## 6. HTTPS 证书

```bash
sudo yum install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com -d www.你的域名.com
# 按提示操作，选择自动重定向 HTTP → HTTPS
```

Certbot 自动续期（不用手动操作），验证：

```bash
sudo certbot renew --dry-run
```

## 7. 部署后验证清单

- [ ] `http://你的域名/` → 能打开首页
- [ ] `http://你的域名/admin.html` → 能打开管理后台
- [ ] 首页填表单提交 → 成功（测试 API 通路）
- [ ] 管理后台登录 → 能看到刚才提交的数据
- [ ] `http://你的域名/privacy.html` → 隐私政策页
- [ ] `http://你的域名/terms.html` → 服务条款页
- [ ] `http://你的域名/robots.txt` → 爬虫规则
- [ ] HTTPS 锁图标正常显示

## 8. 常用运维命令

```bash
pm2 status               # 后端进程状态
pm2 logs zhongke-api     # 查看后端日志
pm2 restart zhongke-api  # 重启后端
nginx -t                 # 检查 Nginx 配置
systemctl reload nginx   # 重载 Nginx
systemctl status mysqld  # MySQL 状态
mysql -u root -p hengtong -e "SELECT COUNT(*) FROM franchise_leads;"  # 查看线索数量
```

## 9. 更新部署

后续改了代码后重新部署：

```bash
# 本地重新打包
cd /d/work/trae/xuanchuan/qianduan
tar -czf deploy.tar.gz index.html admin.html privacy.html terms.html robots.txt sitemap.xml images/ server/ --exclude='server/node_modules' --exclude='*.pptx' --exclude='ppt_content.txt' --exclude='~$*'

# 上传
scp deploy.tar.gz root@<ECS公网IP>:/opt/

# 服务器上
ssh root@<ECS公网IP>
cd /opt
tar -xzf deploy.tar.gz -C /opt/hengtong
pm2 restart zhongke-api   # 重启后端
sudo nginx -s reload      # 重载 Nginx
```
